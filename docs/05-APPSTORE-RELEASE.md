# 05 · App Store Release Plan

This document defines the complete release flow for TafsirLingo from development build to Mac App Store submission. Key points: Safari Web Extension must be signed and distributed together with the macOS App containing it; this product is free; not distributed in mainland China; privacy statement must truthfully describe "when the user actively triggers, selected text is sent to the AI service the user configures themselves".

---

## 1. Verified Apple Official Requirements

[Verified] Source: Apple Developer documentation `Distributing your Safari web extension` / `Safari web extensions`.

- A Safari Web Extension is an App Extension that must be packaged inside a containing app (macOS App).
- During development, you can enable `Develop > Allow Unsigned Extensions` in Safari to test unsigned extensions.
- App Store distribution requires an Apple Developer Program account, signing the containing app and extension, and uploading via Xcode Archive to App Store Connect.
- Extensions cannot be submitted to the App Store separately; they must be submitted with the containing app.
- The containing app cannot be an empty shell; it must have actual functionality for the user. The host app for this project provides full settings, Keychain management, test connection, and extension enablement guidance, satisfying this requirement.

[Verified] Source: Apple Developer documentation `Manage availability for your app on the App Store`.

- App Store Connect allows selecting `Specific Countries or Regions` in Availability.
- To exclude mainland China, do NOT select `All Countries or Regions`; select all regions except `China mainland`.

[Verified] Source: Apple Developer documentation `Manage app privacy`.

- App Store Connect's App Privacy must answer whether data is collected.
- If the app and third-party partners do not collect data, you can select `No, we do not collect data from this app`.
- But if the app collects any data, even for functionality, it must be declared.

---

## 2. Pre-Release Engineering Checklist

### 2.1 Bundle IDs

Recommended values:

| Target | Bundle ID |
|--------|-----------|
| Host app | `top.bayanlistening.tafsirlingo` |
| Safari extension | `top.bayanlistening.tafsirlingo.Extension` |

Check before release:

- [ ] Create two App IDs / Identifiers in Apple Developer Portal.
- [ ] Both targets have the same Team.
- [ ] Xcode Signing & Capabilities has no red errors.

### 2.2 Capabilities / Entitlements

Host App:

```xml
com.apple.security.app-sandbox = true
com.apple.security.network.client = true
com.apple.security.application-groups = ["group.top.bayanlistening.tafsirlingo"]
keychain-access-groups = ["$(AppIdentifierPrefix)top.bayanlistening.tafsirlingo"]
```

Extension:

```xml
com.apple.security.app-sandbox = true
com.apple.security.network.client = true
com.apple.security.application-groups = ["group.top.bayanlistening.tafsirlingo"]
keychain-access-groups = ["$(AppIdentifierPrefix)top.bayanlistening.tafsirlingo"]
```

Notes:

- `network.client`: background needs to send HTTPS requests to the user-configured AI service.
- `application-groups`: Host app and extension share non-sensitive config (baseURL/model/targetLang).
- `keychain-access-groups`: Host app writes the key, extension native handler reads the key.
- Do not hardcode TeamID in Keychain code; prefer aligning via entitlement's `$(AppIdentifierPrefix)`. If you must write it in code, replace with the real TeamID before submission and test.

### 2.3 Manifest Permission Review

`manifest.json` permissions that need explaining:

```json
"permissions": ["nativeMessaging", "activeTab", "storage", "scripting"],
"host_permissions": ["<all_urls>"],
"content_scripts": [{ "matches": ["<all_urls>"] }]
```

App Review risk points:

- `<all_urls>` permission is broad.
- `nativeMessaging` triggers attention to native communication usage.

Review Notes must proactively explain:

- The extension only reads the selection when the user selects text and actively triggers explanation.
- Does not scan pages in the background, does not automatically upload page content.
- Native Messaging is only used to read the user-saved API key from local Keychain and to open the settings window.
- API requests are sent to the user's own OpenAI-compatible endpoint; the developer has no backend and receives no data.

---

## 3. App Store Connect Configuration

### 3.1 App Information

Recommended:

- Name: `TafsirLingo`
- Subtitle: `AI explanations for selected text`
- Primary Category: `Education`
- Secondary Category: `Productivity` or leave blank
- Content Rights: The app does not provide third-party content, only processes text selected by the user on the current webpage; if the form asks about third-party content access, explain that the app does not host/distribute content.

### 3.2 Pricing

- Select Free.
- Do not add In-App Purchases.
- Do not add subscriptions.

### 3.3 Availability: Exclude Mainland China

Steps:

1. App Store Connect → this App → Pricing and Availability / Availability.
2. Select `Specific Countries or Regions`.
3. Select all target regions except `China mainland`.
4. Do not check the option that auto-includes all future regions unless you confirm future region compliance.

Reason: the product decision is "not distributed in mainland China". Additionally, Apple's mainland China availability page lists certain content/news/religion categories that may require additional filing or licenses; while this product is a language learning tool, the user's primary use case involves news webpage explanation, so directly excluding mainland China reduces compliance complexity.

### 3.4 App Privacy

Recommended entry (assuming implementation strictly follows `01 §7`):

- Data Collection: `No, we do not collect data from this app`.

Reasons:

- The developer has no server.
- The app does not include analytics SDK / ad SDK / crash reporting SDK.
- Selected text is only sent from the user's device to the AI endpoint configured by the user when the user actively triggers; the developer does not receive, store, or process it.
- API key is stored only in the user's local macOS Keychain.

Note: if any telemetry, crash reporting, account, vocab notebook cloud sync, or developer proxy service is added in the future, the privacy label must be re-evaluated.

### 3.5 Privacy Policy URL

Apple requires a Privacy Policy URL. Before launch, a privacy policy page must be placed on the website. Recommended content:

```text
TafsirLingo does not collect, store, or sell personal data.

When you select text in Safari and explicitly ask TafsirLingo to explain it, the selected text and nearby context are sent from your device directly to the AI endpoint you configure. TafsirLingo's developer does not operate a server for these requests and does not receive the text, your API key, or the AI response.

Your API key is stored only in macOS Keychain on your device.
```

Chinese equivalent:

```text
TafsirLingo does not collect, store, or sell personal data.

When you select text in Safari and actively request an explanation, the selected text and its nearby context are sent from your device directly to the AI endpoint you configure. The TafsirLingo developer does not run a server for these requests and will not receive your text, API key, or AI response.

Your API key is stored only in the local macOS Keychain.
```

---

## 4. Review Notes Template

Write clearly in App Review Notes at submission time to reduce the risk of `<all_urls>` and native messaging being misinterpreted.

```text
TafsirLingo is a free Safari Web Extension for language learning.

Primary flow:
1. Open any webpage in Safari.
2. Select a word, phrase, or sentence.
3. Click the small "Explain" bubble or press Command-Shift-E.
4. The extension displays an AI-generated explanation in a floating card near the selection.

The extension uses <all_urls> because the feature is intended to work on arbitrary webpages selected by the user. It does not scan pages in the background and does not upload webpage content automatically. Text is sent only after the user explicitly selects text and triggers explanation.

The app has no developer-operated backend, analytics, advertising, account system, or tracking. Users provide their own OpenAI-compatible API endpoint, model, and API key in the macOS app settings. The API key is stored only in macOS Keychain.

Native messaging is used only to read the user-saved API configuration from Keychain/App Group storage and to open the settings window from the extension UI.

Test instructions:
1. Launch TafsirLingo and enter an OpenAI-compatible Base URL, API key, and model.
2. Click "Test Connection" to verify the configuration.
3. Enable the Safari extension in Safari Settings > Extensions.
4. Open a webpage, select text, and click "Explain".
```

If the review account cannot use a real AI key, provide a temporary test endpoint/key in Review Notes. Do not put long-term production keys in notes; use a dedicated review key and revoke it after review.

---

## 5. Metadata & Screenshot Recommendations

### 5.1 App Description (English Draft)

```text
TafsirLingo helps you understand selected text on any Safari webpage with contextual AI explanations.

Select a word, phrase, or sentence while reading, click Explain, and TafsirLingo shows a concise explanation right where you are. It is designed for language learners who need more than dictionary definitions: the AI considers nearby context so the explanation fits the sentence you are reading.

Features:
• Explain selected text on any webpage
• Context-aware AI explanations
• Works with your own OpenAI-compatible API endpoint
• API key stored locally in macOS Keychain
• Elegant Liquid Glass interface designed for macOS Tahoe
• No account, no subscription, no developer-operated server
```

### 5.2 App Description (Chinese Draft, for website / listing; may not be available in mainland China)

```text
TafsirLingo is a Safari extension designed for language learning. When you select a word, phrase, or sentence on a webpage, it calls the AI endpoint you configure and provides an explanation based on context.

It is not a mechanical dictionary lookup — it explains meaning based on the current sentence and paragraph, suitable for reading Arabic, English, and other foreign language webpages.

Features:
• Explain selected text on any webpage
• Context-aware, not just dictionary definitions
• Supports OpenAI-compatible interfaces, user-provided API key
• API key stored only in local macOS Keychain
• macOS Tahoe Liquid Glass interface
• No account, no subscription, no developer server
```

### 5.3 Screenshot Checklist

Must prepare 3–5 Mac App Store screenshots:

1. Selecting text on an Arabic webpage in Safari, Liquid Glass explanation card appears.
2. Selecting a sentence on an English webpage, Chinese explanation card in streaming completion state.
3. Native settings window: Liquid Glass form + API configuration.
4. Test connection success state.
5. Friendly guide card when not configured.

Screenshot notes:

- Do not display real API keys.
- If webpage content comes from third-party news sites, avoid using full pages with copyright/trademark disputes as the marketing subject in screenshots; use self-built test pages or capture very small, unrecognizable text areas.
- Liquid Glass screenshots must show "clear refraction + highlights", do not capture as ordinary frosted glass.

---

## 6. Pre-Release QA Checklist

Functionality:

- [ ] Extension can be enabled in Safari settings.
- [ ] Tested on at least: aljazeera.net, wikipedia.org, developer.apple.com, a local HTML test page under `<all_urls>`.
- [ ] Arabic RTL selection positioning is correct.
- [ ] English LTR selection positioning is correct.
- [ ] Shortcut `⌘⇧E` triggers correctly.
- [ ] Popup can open settings.
- [ ] Unconfigured key guidance is correct.
- [ ] Wrong key / wrong model / no network / timeout all show correct error states.
- [ ] Closing the card aborts the request.

Security:

- [ ] Console, os_log, crash logs do not print API key.
- [ ] `browser.storage.local` does not contain API key.
- [ ] Keychain entry exists and both host app / extension can access it.
- [ ] AI response text rendering uses `textContent`, no `innerHTML`.
- [ ] No third-party analytics / ads / tracking SDK.

Design:

- [ ] All items in `02 §6` Liquid Glass acceptance checklist pass.
- [ ] Works under Reduce Motion / Reduce Transparency.
- [ ] Clear in both dark mode and light mode.

Release:

- [ ] Archive succeeds.
- [ ] Xcode Organizer Validate App succeeds.
- [ ] App Privacy filled out.
- [ ] Privacy Policy URL publicly accessible.
- [ ] Availability excludes China mainland.
- [ ] Review Notes filled in completely.

---

## 7. Build & Upload Process

1. Xcode select Release configuration.
2. Product → Archive.
3. Organizer → select archive → Validate App.
4. Fix signing / entitlement / privacy manifest issues.
5. Distribute App → App Store Connect → Upload.
6. In App Store Connect, select the build, fill in metadata, privacy, pricing, regions, Review Notes.
7. Submit for review.

Development beta testing:

- Unsigned local test: Safari → Develop → Allow Unsigned Extensions.
- External TestFlight / App Store testing: must sign and upload. Safari Web Extension installs together with the containing app.

---

## 8. Possible Review Follow-ups & Answers

### Q: Why does the extension need access to all websites?

A: The extension's core feature is user-initiated language explanation for selected text on arbitrary webpages. It does not read or upload page content automatically. It only processes text explicitly selected by the user after the user clicks Explain or uses the keyboard shortcut.

### Q: What is native messaging used for?

A: Native messaging is used to access macOS platform features not available to web extensions: reading the user's API key from Keychain, reading non-sensitive settings from the app group, and opening the settings window.

### Q: Do you collect selected text or API keys?

A: No. The developer does not operate a server for this app. Selected text is sent directly from the user's device to the AI endpoint configured by the user. API keys are stored only in macOS Keychain and are not sent to the developer.

### Q: Does the app include AI-generated content?

A: The app displays AI responses from the user's chosen OpenAI-compatible provider. The user configures the provider and explicitly triggers each request. The app itself does not host or moderate a public content service.

---

## 9. Things NOT to Do

- Do NOT write real long-term API keys into App Review Notes.
- Do NOT put keys in `browser.storage.local` for convenience.
- Do NOT add analytics/telemetry, or the privacy label must change.
- Do NOT select `All Countries or Regions`, or it will include mainland China.
- Do NOT imply built-in free AI service in the description; this product requires user-provided API.
- Do NOT promise "translation is accurate"; describe it as a learning aid explanation.