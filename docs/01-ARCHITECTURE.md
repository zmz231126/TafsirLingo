# 01 · Architecture

This document defines component boundaries, data flow, and three critical contracts: **Native Messaging Protocol**, **Keychain Read/Write Convention**, and **AI Request/Response Contract**. Subsequent documents depend on the contracts defined here.

---

## 1. Component Overview

```
┌─────────────────────────── macOS 26 ───────────────────────────┐
│                                                                 │
│  ┌─────────────────────┐         ┌──────────────────────────┐  │
│  │   Host App (SwiftUI) │         │        Safari            │  │
│  │  ───────────────────  │        │  ┌────────────────────┐  │  │
│  │  • Settings UI (true │         │  │  Web Extension     │  │  │
│  │    Liquid Glass)     │         │  │  ┌──────────────┐  │  │  │
│  │  • Write API key to  │          │  │  │ content.js   │  │  │  │
│  │    Keychain           │          │  │  │ (selection/│  │  │  │
│  │  • Test Connection    │          │  │  │ card)      │  │  │  │
│  └──────────┬──────────┘          │  │  └──────┬───────┘  │  │  │
│             │                      │  │         │ Internal  │  │  │
│             │ Shared Keychain      │  │  ┌──────┴───────┐  │  │  │
│             │ (Access Group)       │  │  │ background.js │  │  │  │
│             ▼                      │  │  │ (AI requests/│  │  │  │
│  ┌─────────────────────┐          │  │  │ routing)     │  │  │  │
│  │   macOS Keychain     │◄─────────┼──┼──┤              │  │  │  │
│  │  (kSecClassGeneric)  │ Native   │  │  └──────┬───────┘  │  │  │
│  └─────────────────────┘ Messaging│  │         │           │  │  │
│             ▲                      │  │  ┌──────┴───────┐  │  │  │
│             └──────────────────────┼──┤ SafariWebExtensionHandler│ │
│                (sendNativeMessage) │  │  │  .swift (read Keychain)│ │
│                                    │  │  └──────────────┘  │  │  │
│                                    │  │  ┌──────────────┐  │  │  │
│                                    │  │  │ popup.html    │  │  │  │
│                                    │  │  │ (status/shortcut)│  │  │  │
│                                    │  │  └──────────────┘  │  │  │
│                                    │  └────────────────────┘  │  │
│                                    └──────────┬───────────────┘  │
└────────────────────────────────────────────┬─┴──────────────────┘
                                               │ HTTPS (streaming)
                                               ▼
                               User-provided OpenAI-compatible AI service
                               (OpenAI / DeepSeek / Ollama / proxy...)
```

### Role Responsibilities

| Component | File | Responsibility | Does NOT |
|------|------|------|---------|
| Host App | `TafsirLingo/` (Swift) | Settings UI, write Keychain, test connection, guide extension enablement | Does not send explanation requests |
| Content script | `content.js` | Listen for selection, extract context, render card, display streaming text | Does not touch key directly, does not send AI requests directly |
| Background | `background.js` | Receive content request → get key → call AI → stream back; manage shortcut commands | Does not operate DOM |
| Native handler | `SafariWebExtensionHandler.swift` | Respond to `sendNativeMessage`, read key from Keychain and return | Does not send AI requests |
| Popup | `popup.html/js/css` | Show "is configured?" status, open settings, enable/disable toggle | Not the primary interaction entry |

> **Why does the background get the key and send the AI request?**
> Content scripts run in the webpage context and are the least trusted; letting them touch the key is the highest risk. The background is the extension's trusted backend, centrally handling credentials and outbound requests, while content only handles UI.

---

## 2. End-to-End Data Flow (Selection → Explanation)

```
User selects "الديمقراطية" on a webpage
        │
        ▼
[content.js] selectionchange / mouseup
        │  ① Get selection text + extract context (see §3)
        │  ② Show "Explain" bubble (Liquid Glass small button) near selection
        ▼
User taps bubble (or presses ⌘⇧E)
        │
        ▼
[content.js] Immediately insert "card" below selection and enter loading state
        │  postMessage → background
        │  { type: "EXPLAIN", payload: { text, context, pageLang, pageUrl } }
        ▼
[background.js]
        │  ③ sendNativeMessage("application.id", { type: "GET_CONFIG" })
        ▼
[SafariWebExtensionHandler.swift]
        │  ④ Read { baseURL, apiKey, model } from Keychain → return (key not logged)
        ▼
[background.js]
        │  ⑤ Assemble OpenAI chat/completions request (stream:true) (see §5)
        │  ⑥ Read streaming fetch, forward each incremental token to content via port
        ▼
[content.js]
        │  ⑦ Card appends text word by word; show done state after completion
        ▼
Error in any step → card shows corresponding error state (see 03 §Error States)
```

### Key Constraints
- background ↔ content uses a **long-lived port** (`browser.runtime.connect`) rather than one-shot messages, because streaming requires continuous incremental pushes.
- Only one in-flight explanation request per tab is allowed; a new trigger cancels the old one (`AbortController`).

---

## 3. Context Extraction Strategy (Core Algorithm)

Context quality directly determines explanation quality. The content script extracts context by the following priority:

1. The full `textContent` of the **block-level element containing the selection** (`<p>`, `<li>`, `<blockquote>`, `<td>`, etc.) as "near context".
2. If near context < configured threshold (e.g., 400 chars), go up to parent block or adjacent sibling blocks to supplement, up to ~1500 chars (to prevent token waste).
3. Wrap the selected text with markers in the context so the AI knows exactly which part to explain:

   ```
   ...before... 【【الديمقراطية】】 ...after...
   ```

4. Record page language: `document.documentElement.lang` or the nearest `lang` attribute on the selection element; record direction: `dir` (`rtl`/`ltr`).

> Implementation details and code are in `04 Phase 1`. This document only defines the contract: the payload content sends to background looks like
> `{ text: string, context: string (with 【【】】 markers), pageLang: string, dir: "rtl"|"ltr", pageUrl: string }`

---

## 4. Contract A: Native Messaging (JS ↔ Swift Read Keychain)

### Caller (background.js)
```js
const APP_ID = "top.bayanlistening.tafsirlingo"; // Aligned with host app bundle id
const resp = await browser.runtime.sendNativeMessage(APP_ID, { type: "GET_CONFIG" });
// resp looks like { ok: true, config: { baseURL, model, targetLang, hasKey: true } , apiKey: "..." }
```

### Responder (SafariWebExtensionHandler.swift)
Handle these `type`s:

| Request type | Behavior | Return |
|-----------|------|------|
| `GET_CONFIG` | Read key from Keychain, read baseURL/model/targetLang from UserDefaults(App Group) | `{ ok, config:{baseURL,model,targetLang,hasKey}, apiKey }` |
| `PING` | Health check | `{ ok: true }` |

Conventions:
- **apiKey only appears once in the `GET_CONFIG` response**; the background uses it and discards it, does not cache to persistent storage.
- Non-sensitive config (baseURL/model/targetLang) goes in the **App Group shared UserDefaults**, so the settings UI writes and the extension reads without needing to go through Keychain every time.
- Swift `os_log` **must NOT print apiKey** (the echo logging in the template must be removed).

### Keychain Storage Convention
- `kSecClass = kSecClassGenericPassword`
- `kSecAttrService = "top.bayanlistening.tafsirlingo.apikey"`
- `kSecAttrAccount = baseURL` (allows multiple configs in the future; MVP single config also stores this way)
- `kSecAttrAccessGroup = "<TeamID>.top.bayanlistening.tafsirlingo"` (shared between app and extension; must configure the same Keychain Access Group in both targets' entitlements, see `05`)
- `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlock`

---

## 5. Contract B: AI Request / Response (OpenAI-Compatible Streaming)

### Request
- Method: `POST {baseURL}/chat/completions` (`baseURL` is user-provided, usually ends with `/v1`; code must handle both with and without `/v1` — see normalization rules below).
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`.
- Body:
  ```json
  {
    "model": "{model}",
    "stream": true,
    "messages": [
      { "role": "system", "content": "{see system prompt below}" },
      { "role": "user", "content": "{see user prompt below}" }
    ]
  }
  ```

### Base URL Normalization Rule (Must Implement, to Prevent User Errors)
```
Input → Actual Request URL
https://api.openai.com/v1        → https://api.openai.com/v1/chat/completions
https://api.openai.com/v1/       → same (strip trailing slash)
https://api.openai.com           → https://api.openai.com/v1/chat/completions (append /v1)
http://localhost:11434/v1        → http://localhost:11434/v1/chat/completions (local Ollama allows http)
```
> Rule: strip trailing `/`; if path does not start with `/v1` or already ends with `/chat/completions`, append `/v1`; finally append `/chat/completions`. Local loopback addresses (localhost/127.0.0.1) allow http; all others require https.

### System Prompt (Template, `{targetLang}` injected from Settings)
```
You are a language learning assistant. The user is reading a webpage and has selected a piece of text, wanting to understand its meaning in the current context.
Please respond in `{targetLang}`. Requirements:
1. First give the most fitting meaning of this text in this context (do not give a dictionary-style list detached from context).
2. If it is a word or phrase, supplement its part of speech / root / common collocations (if applicable).
3. If it is a full sentence, explain its meaning and tone.
4. Be concise, keep under 120 characters unless the user selected a long sentence.
5. Do not repeat the original text, do not make small talk, give the explanation directly.
```

### User Prompt (Template)
```
Context (selected part marked with 【【】】):
{context}

Please explain: {text} in 【【】】
```

### Response Parsing (SSE Stream)
- Read line by line `data: {json}`; `data: [DONE]` ends.
- Accumulate `choices[0].delta.content`.
- Compatible with some proxy services that write `delta` as a full `message` (non-standard): if no `delta.content`, try `choices[0].message.content`.
- Error: HTTP non-2xx → read `error.message` from body to display; parse failure → generic error state.

### Timeout and Cancellation
- First-byte timeout 15s, overall soft timeout 60s.
- Use `AbortController`; new request or user closing the card triggers abort.

---

## 6. Permissions & Manifest Key Points (details in 04 Phase 0)

- `permissions`: `["nativeMessaging", "activeTab", "storage", "scripting"]`
- `host_permissions`: `["<all_urls>"]` (explanation requests are `fetch`ed by background to user-provided domains, need to allow any target)
- `content_scripts.matches`: `["<all_urls>"]`, `run_at: document_idle`
- `commands`: define `trigger-explain` shortcut, default `Command+Shift+E`
- `background.type`: `module` (service worker / persistent background)

> ⚠️ `<all_urls>` + nativeMessaging will make Review stricter. `05` provides a Review Notes template explaining "only used to read user-provided key and send selected text to user's own AI service, no data collection".

---

## 7. Security & Privacy Baseline

- API key stored only in Keychain; discarded after use in extension memory; no logs/exports contain key.
- Selected text is only sent outbound when the user **actively triggers** (tap bubble / press shortcut); never silently upload page content in the background.
- Outbound targets are only user-provided AI base URLs, no third-party analytics/tracking/telemetry.
- App Privacy Manifest (`05`) is filled as "no data collection".
- When content script renders AI response text, **use only `textContent`, never `innerHTML`**, to prevent XSS from AI output or host page injection.