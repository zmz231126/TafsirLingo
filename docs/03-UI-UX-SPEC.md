# 03 · UI / UX Specification (Per-Screen, Per-State)

This document defines every screen, every state, every interaction and animation, every line of copy. Color and glass material follow `02`.

---

## 1. Full Interaction Flow (User-View Storyboard)

```
1. User selects text on a webpage
   → An "Explain" bubble (Liquid Glass small capsule button) fades in near the selection
2. User taps the bubble / presses ⌘⇧E
   → The bubble "grows/morphs" into a card in place (Liquid Glass morph animation)
   → Card enters loading state (streaming dots)
3. AI streams back
   → Text appears word by word
4. Completion
   → Action row appears at card bottom (copy / re-explain / close)
5. User clicks elsewhere / presses Esc / scrolls away
   → Card fades out and disappears
```

Error branch: not configured → card goes directly to "go to Settings" state (see §4).

---

## 2. Component Inventory

| Component | Location | Description |
|------|------|------|
| Explain Bubble (Trigger Bubble) | content script, near selection | Small glass button that appears after selection |
| Explanation Card | content script, auto-positioned below/above selection | Main result display, Liquid Glass |
| Settings Window | Native SwiftUI | Configure AI, shortcut, explain-in language |
| Toolbar Popup | Extension icon click | Status overview + open settings entry |

---

## 3. Explain Bubble (Trigger Bubble)

**Appearance**: 30px tall glass capsule, containing a stroke icon (suggest "sparkles / bulb" imagery) + optional short label "Explain". Apply the glass recipe from `02 §4.5`.

**Positioning**:
- Appears at the bottom-right of the selection end, offset 8px;
- If near the viewport right/bottom edge, automatically flips to top-left, ensuring full visibility;
- Follows the selection, does not follow mouse jitter (debounce 120ms).

**Appearance conditions**:
- Selection is non-empty and length ≥ 1 meaningful character (filter pure whitespace / pure newlines);
- Selection length cap: > 600 chars shows "selection is long" on the bubble, still tappable.

**Dismiss conditions**: selection cleared, tap elsewhere on page, start explanation (morphs into card).

**Animation**: fade-in + `scale(0.9→1)`, 140ms. Under `prefers-reduced-motion`, only fade-in.

**Copy**:
- en: `Explain`
- zh: `解释`

---

## 4. Explanation Card (Explanation Card) — Per State

Card width 320–380px (auto-adapts to content and viewport), max height 60vh, internal scroll when overflow. Liquid Glass material see `02 §4`. **RTL adaptation see §6.**

### 4.1 State Machine
```
            ┌──────────────┐
            │   (triggered) │
            └──────┬───────┘
       Not configured?  │
        ┌──────────┴──────────┐
       Yes                     No
        ▼                      ▼
  [NOT_CONFIGURED]        [LOADING]
        │                      │
        │                  First byte arrives
        │                      ▼
        │                  [STREAMING] ──complete──► [DONE]
        │                      │
        │                  Any error
        │                      ▼
        └──────────────►   [ERROR]
```

### 4.2 LOADING State
- Top: selected text (truncated, max 2 lines) as title, muted color.
- Body: three Liquid Glass dot pulsing loading (do NOT use a hard spinner; use breathing dots that echo the glass material).
- Copy: en `Thinking…` / zh `正在解释…`
- On entry, play the sheen sweep + water droplet forming from `02 §4.3`.

### 4.3 STREAMING State
- Title keeps the selected text.
- Body: AI text **appends word by word** (use `textContent` concatenation, no `innerHTML`).
- A blinking thin cursor at the end of text, showing "still outputting".
- Auto-scroll to bottom, unless the user manually scrolls up (manual up-scroll stops auto-follow).

### 4.4 DONE State
- Cursor disappears.
- Bottom action row (glass small buttons):
  - `Copy`: copy the full explanation text.
  - `Retry`: request again with the same text+context.
  - `Close`: fade out the card.
- Optional: a subtle "×" at top-right for随时 close.

### 4.5 NOT_CONFIGURED State
- Icon + copy:
  - en: `Set up your AI first` / `Add your API key in Settings to start explaining.`
  - zh: `先配置 AI` / `在设置里填入 API key 即可开始解释。`
- One `.glassProminent` style primary button: `Open Settings` → opens the native App settings window via background (see `04 Phase 4`).

### 4.6 ERROR State (by type)
| Error | Copy (zh / en) | Action |
|------|----------------|------|
| Network failure | `网络连接失败，请检查网络。` / `Network error. Check your connection.` | Retry |
| 401/403 Auth | `API key 无效或无权限，请到设置检查。` / `Invalid API key. Check Settings.` | Open Settings |
| 404/Model error | `找不到该模型或接口地址，请检查设置。` / `Model or endpoint not found. Check Settings.` | Open Settings |
| 429 Rate limit | `请求过于频繁，请稍后再试。` / `Rate limited. Try again shortly.` | Retry |
| Timeout | `请求超时，请重试。` / `Request timed out. Try again.` | Retry |
| Other | `出错了：{message}` / `Something went wrong: {message}` | Retry |

Error state keeps rim/sheen, but tint slightly shifts to red warning (low saturation, not glaring).

### 4.7 Positioning & Overflow
- Default appears 10px **below** the selection; if space below is insufficient, flip **above**.
- Horizontally, align with the selection's left edge (LTR) / right edge (RTL); if overflowing viewport, clamp to 12px viewport margin.
- When scrolling the page, the card follows the selection (fixed anchor to the selection rect); if scrolled out of viewport, auto-close.

---

## 5. Motion Specification

| Element | Animation | Duration / Easing |
|------|------|------------|
| Bubble appear | Fade-in + scale 0.9→1 | 140ms / `ease-out` |
| Bubble → Card | Morph enlarge + sheen sweep | 260ms / `cubic-bezier(0.22,1,0.36,1)` |
| Card entry (direct) | scale 0.96→1 + fade-in + sweep | 260ms / same as above |
| Streaming cursor | Blink | 1s loop |
| Loading dots | Breathing pulse | 1.2s loop |
| Card dismiss | Fade-out + scale 1→0.97 | 160ms / `ease-in` |

Under `prefers-reduced-motion: reduce`: all degrade to 120ms pure fade-in/fade-out, no scale, no sweep.

---

## 6. RTL (Arabic, etc.) Adaptation — Primary Use Case Hard Requirement

- Card determines its own `direction` based on the selected text/page `dir`: selection RTL → card body `direction: rtl; text-align: right`.
- Title (the explained original text) displays in its own direction.
- Explanation body direction = direction of the **explain-in language** (Chinese explanation → LTR; Arabic explanation → RTL). i.e., title direction follows the original text, body direction follows the explanation language, judged separately.
- Bubble positioning when RTL selection: prefer aligning to the right edge.
- Punctuation and number mixed layout: use `unicode-bidi: plaintext` fallback to prevent direction confusion.
- Font: body `font-family` explicitly includes a system font fallback covering Arabic (e.g., `"SF Arabic", "Geeza Pro", system-ui`).

---

## 7. Settings Window (SwiftUI, True Liquid Glass)

### 7.1 Layout
Single window, ~520×620, cannot be too small. Top to bottom:

1. **Header**: App icon + "TafsirLingo Settings" + a subtitle.
2. **AI Config Card** (glass card, wrapped by `GlassEffectContainer`):
   - `Base URL`: TextField, placeholder `https://api.openai.com/v1`, small gray text below "Supports any OpenAI-compatible interface".
   - `API Key`: SecureField, with a "show/hide" eye button on the right. Small gray text below "Only stored in local Keychain, never uploaded".
   - `Model`: TextField, placeholder `gpt-4o-mini`.
   - `Test Connection`: `.glassProminent` button → see §7.2.
3. **Explanation Preference Card**:
   - `Explain in`: Picker (Simplified Chinese / English / العربية / …, default follows system language).
   - Optional: explanation style (concise / detailed) — MVP can just keep "concise", reserve the enum.
4. **Shortcut Card**:
   - `Trigger shortcut`: KeyboardShortcut recorder, default `⌘⇧E`.
   - Description "press this shortcut after selecting text on a webpage to explain directly".
5. **About section**: version number, privacy policy link, "how to enable extension in Safari" guide.

> Background: full window with a soft mesh gradient or brand-color gradient wallpaper, **giving the glass content to refract** (see `02 §3.3`).

### 7.2 Test Connection (Test Connection) Interaction
- Click → button enters loading (small dot embedded in the glass button).
- Send a tiny non-streaming probe request with the current form's baseURL/key/model (`messages:[{role:"user",content:"ping"}], max_tokens:1`).
- Success: button briefly shows ✓ + green tint, prompt "Connection successful".
- Failure: show inline error text by §4.6 type (red, low saturation).
- This is the key **pre-save self-check** for the user, reducing frustration from "configured wrong but don't know it".

### 7.3 Save Behavior
- On blur or tap "Save": write key → Keychain; baseURL/model/targetLang/shortcut → App Group UserDefaults (see `01 §4`).
- On successful write, give a restrained toast/highlight feedback, no modal.

---

## 8. Toolbar Popup (Lightweight)

Appears on extension icon click, ~280×200, glass style:
- Top: toggle "Enable on this site" (toggle, glassified).
- Status line: `● AI Configured` / `○ Not Configured` (prominent when not configured).
- Button: `Open Settings` (→ native settings window).
- Bottom: current shortcut hint.

The Popup is not the primary entry; the primary entries are the webpage bubble / shortcut. The Popup only handles "status overview + jump to settings".

---

## 9. Copy Table (en / zh, centrally managed, feed to `_locales`)

| key | en | zh |
|-----|----|----|
| extension_name | TafsirLingo | TafsirLingo |
| extension_description | Select text on any page and ask AI what it means, in context. | Select text on any webpage and ask AI to explain its meaning in context. |
| bubble_explain | Explain | 解释 |
| card_loading | Thinking… | 正在解释… |
| card_copy | Copy | 复制 |
| card_retry | Retry | 重新解释 |
| card_close | Close | 关闭 |
| not_configured_title | Set up your AI first | 先配置 AI |
| not_configured_body | Add your API key in Settings to start explaining. | Add your API key in Settings to start explaining. |
| open_settings | Open Settings | 打开设置 |
| err_network | Network error. Check your connection. | 网络连接失败，请检查网络。 |
| err_auth | Invalid API key. Check Settings. | API key 无效或无权限，请到设置检查。 |
| err_notfound | Model or endpoint not found. Check Settings. | 找不到该模型或接口地址，请检查设置。 |
| err_ratelimit | Rate limited. Try again shortly. | 请求过于频繁，请稍后再试。 |
| err_timeout | Request timed out. Try again. | 请求超时，请重试。 |
| settings_baseurl | Base URL | 接口地址 |
| settings_apikey | API Key | API Key |
| settings_model | Model | 模型 |
| settings_test | Test Connection | 测试连接 |
| settings_explain_in | Explain in | 讲解语言 |
| settings_shortcut | Trigger shortcut | 触发快捷键 |
| privacy_note | Stored only in your Mac's Keychain. Never uploaded. | 仅保存在本机钥匙串，绝不上传。 |