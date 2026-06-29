# 00 · Product Overview

## 1. What the Product Is

TafsirLingo is a Safari Web Extension on macOS (with a native host App). It lets users, while browsing any webpage, **select a piece of text → one-tap ask AI "what does this mean" → a Liquid Glass card floats up in place, giving a context-aware explanation**.

It is not a dictionary. A dictionary gives isolated, mechanical definitions; TafsirLingo sends **the selected text + its surrounding context** to the AI together, so the AI can provide an explanation that fits the context. This is the core advantage over looking up a dictionary.

## 2. Who Uses It & How (Primary Use Case)

The author himself reads Arabic news on Al Jazeera (aljazeera.net). When encountering unfamiliar words, phrases, or full sentences, he selects them and immediately gets an AI-powered contextual explanation. This scenario defines all design trade-offs:

- **The reading flow must not be interrupted**: the explanation must appear in place, no navigation, no new tabs.
- **Context is the soul**: the selection and its surrounding sentences/paragraphs must be sent to the AI together.
- **Multi-language text**: selection and display of RTL (right-to-left) text like Arabic must be handled correctly.

## 3. Scope (Scope)

### 3.1 MVP Must-Haves (In Scope)

1. Select text on any webpage under `<all_urls>` to trigger AI explanation.
2. Two trigger methods:
   - A small "Explain" button (bubble) floats up after selection; tap it to trigger.
   - Keyboard shortcut trigger (default `⌘⇧E`, configurable in Settings).
3. The explanation result appears as a **Liquid Glass card** near the selection, **streaming word by word**.
4. Assemble the selected text + context + user-set "explain in language" into a prompt, call the OpenAI-compatible streaming API.
5. Native Settings UI (SwiftUI, true Liquid Glass): fill in base URL / API key / model name / explain-in language / shortcut / test connection.
6. API key stored in Keychain, extension reads it via Native Messaging.
7. English + Simplified Chinese UI copy (locales).
8. Error handling: no key, network failure, API error, timeout — all must have clear in-card prompts.

### 3.2 Explicitly Out of Scope (MVP Phase)

- ❌ Screenshot / image OCR explanation (author initially mentioned "screenshots", but MVP does text selection only; listed as V2 candidate, see §6).
- ❌ Any backend, account, login, cloud sync.
- ❌ Paid features, IAP, subscriptions.
- ❌ Vocabulary notebook / favorites / history persistence (V2 candidate).
- ❌ Text-to-speech (TTS), pronunciation.
- ❌ iOS / iPadOS version (macOS only).
- ❌ App Store distribution in mainland China.

> Boundary principle: The MVP only solves "select → contextual explanation" and does it flawlessly in design. Any feature that doesn't directly serve this primary flow gets pushed back.

## 4. Locked Key Decisions (Foundation, Do Not Change)

| # | Decision | Impact |
|---|------|------|
| D1 | Minimum macOS 26 Tahoe+ | Settings UI uses native Liquid Glass API, **no fallback branch** |
| D2 | AI = OpenAI-compatible `/v1/chat/completions`, streaming | Request/parsing logic is singular, see `01 §5` |
| D3 | Execution scope `<all_urls>` | Content script injects into all pages; permissions and Review notes see `05` |
| D4 | API key stored in macOS Keychain | Need to wire JS↔Swift Native Messaging, see `01 §4` |
| D5 | Free, no backend | Pure client architecture |
| D6 | Exclude mainland China from App Store | App Store Connect region settings, see `05` |

## 5. Success Criteria (Definition of Done for MVP)

- [ ] Select a word in an Arabic article on aljazeera.net, streaming explanation starts within 2 seconds, text direction is correct.
- [ ] Select a sentence on any English webpage, get a Chinese explanation (if target language is set to Chinese).
- [ ] Settings UI is **true Liquid Glass**: background refracts and bends, edges have traveling specular highlights, **not a blurry mess** (check item-by-item against `02` acceptance checklist).
- [ ] When no key is filled, the card clearly prompts "Go to Settings to fill in API key" and can open Settings in one tap.
- [ ] API key does not appear in any extension-exportable storage / logs (it's in Keychain).
- [ ] With network off, triggering explanation shows a friendly error card, not a crash or blank.
- [ ] With `Reduce Motion` on, all Liquid Glass animations degrade to fade-in/fade-out.
- [ ] Passes App Store Review (excluding mainland China).

## 6. Roadmap (Roadmap)

| Phase | Goal | Output |
|------|------|--------|
| **M0 Scaffold** | Template transformation, Bundle ID, entitlements, manifest basic loadability | `04 Phase 0` |
| **M1 Selection Pipeline** | Selection detection + context extraction + trigger bubble / shortcut | `04 Phase 1` |
| **M2 AI Pipeline** | Native Messaging read Keychain + OpenAI streaming call | `04 Phase 2` |
| **M3 Liquid Glass Card** | Web card, CSS Liquid Glass approximation + streaming render | `04 Phase 3` |
| **M4 Native Settings** | SwiftUI true Liquid Glass settings + Keychain write + test connection | `04 Phase 4` |
| **M5 Polish & Localization** | Error states, RTL, Reduce Motion, en/zh copy, icons | `04 Phase 5` |
| **M6 Release** | Signing, Review Notes, region settings, submission | `05` |
| **V2 Candidates** | Screenshot OCR explanation, vocab notebook, history, TTS, more language copy | — |

## 7. Glossary (Glossary)

| Term | Meaning |
|------|------|
| **Host App** | Native macOS App shell that hosts the Safari extension, provides settings UI, manages Keychain. |
| **Web Extension** | The extension that actually runs in Safari, containing content script / background / popup. |
| **Content Script** | JS injected into webpages, responsible for text selection and card display. `content.js` |
| **Background (Service Worker)** | Extension background, responsible for AI requests and Native Messaging routing. `background.js` |
| **Native Messaging** | JS ↔ Swift communication channel (`browser.runtime.sendNativeMessage`) for reading Keychain. |
| **Liquid Glass** | Apple's new material from WWDC25: refraction + specular highlights + color adaptation, **not blur**. See `02` for details. |
| **Glassmorphism** | Blurred effect using only `backdrop-filter: blur()`. **The anti-pattern to avoid in this project.** |
| **Shadow DOM** | Isolated DOM for the web card, preventing host page CSS from polluting our styles. |
| **RTL** | Right-to-left, for Arabic and other RTL scripts. |
| **Explain-in Language** | The language the AI uses to explain (e.g., explain Arabic using Chinese). Selected by the user in Settings. |