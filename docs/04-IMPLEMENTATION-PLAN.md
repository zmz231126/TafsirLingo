# 04 · Implementation Plan (Per-Phase / Per-File / With Code)

Build the entire product from zero following this. Each Phase has an **acceptance gate** at the end; only proceed to the next phase after passing. Code snippets are skeletons and key logic that can be directly pasted with minor tweaks; they are not pseudocode.

> Environment prerequisites: Xcode 26+, macOS 26 SDK, Safari 26+. Repository is currently in Apple's Safari Web Extension App template raw state (see `00 §Product Name & Naming`).

---

## Phase 0 · Scaffold Transformation

Goal: transform the template into TafsirLingo's skeleton, loadable in Safari, extension appears, popup click does not error.

### 0.1 Bundle ID & Target
- Host app target → `top.bayanlistening.tafsirlingo`
- Extension target → `top.bayanlistening.tafsirlingo.Extension`
- Deployment Target for both targets: **macOS 26.0**.
- Remove iOS-related targets/configs from the template (if any), keep only macOS.

### 0.2 Update `manifest.json`
Per `01 §6`:
```json
{
  "manifest_version": 3,
  "default_locale": "en",
  "name": "__MSG_extension_name__",
  "description": "__MSG_extension_description__",
  "version": "1.0",
  "icons": { "48": "images/icon-48.png", "96": "images/icon-96.png", "128": "images/icon-128.png", "256": "images/icon-256.png", "512": "images/icon-512.png" },
  "background": { "scripts": ["background.js"], "type": "module" },
  "content_scripts": [{
    "js": ["content.js"],
    "css": ["card.css"],
    "matches": ["<all_urls>"],
    "run_at": "document_idle",
    "all_frames": false
  }],
  "action": { "default_popup": "popup.html", "default_icon": "images/toolbar-icon.svg" },
  "permissions": ["nativeMessaging", "activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "commands": {
    "trigger-explain": {
      "suggested_key": { "default": "Command+Shift+E" },
      "description": "Explain the current selection"
    }
  }
}
```

### 0.3 Locales
- Keep `_locales/en/messages.json`, fill all keys per `03 §9`.
- Create `_locales/zh/messages.json` (Safari uses `zh`; for precise Simplified Chinese, `zh_CN` can be used; having both is more robust).

### 0.4 App Group + Keychain Access Group (entitlements)
Add to both targets:
- App Group: `group.top.bayanlistening.tafsirlingo`
- Keychain Sharing → Access Group: `top.bayanlistening.tafsirlingo`

(Detailed entitlements in `05`.)

### 0.5 Clean Template Junk
- `popup.html`/`popup.js`: remove Hello World, place placeholder structure first (beautify in Phase 5).
- `background.js` / `content.js`: clear echo logic, leave empty shells.
- `SafariWebExtensionHandler.swift`: **remove `os_log` that prints messages** (prevent leaks), rewrite in Phase 2.

**Acceptance Gate 0**: Safari "Develop" menu loads the extension successfully, icon appears, popup click does not error, console has no red errors.

---

## Phase 1 · Selection Pipeline (content script)

Goal: select text → bubble appears → after trigger, get `{text, context, pageLang, dir, pageUrl}` (first `console.log`, no AI connection).

### 1.1 `content.js` Skeleton
```js
// content.js
import { extractContext } from "./lib/context.js";   // if modules aren't convenient, inline
const STATE = { bubble: null, card: null, lastRange: null };

document.addEventListener("selectionchange", debounce(onSelectionChange, 120));
document.addEventListener("mousedown", maybeDismiss, true);
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SHORTCUT_TRIGGER") startExplain();
});

function onSelectionChange() {
  const sel = window.getSelection();
  const text = sel && sel.toString().trim();
  if (!text) { hideBubble(); return; }
  STATE.lastRange = sel.getRangeAt(0).cloneRange();
  showBubbleNear(STATE.lastRange);
}

function buildPayload() {
  const sel = window.getSelection();
  const range = STATE.lastRange || (sel.rangeCount ? sel.getRangeAt(0) : null);
  if (!range) return null;
  const text = sel.toString().trim();
  const { context, dir } = extractContext(range, text);
  const pageLang = document.documentElement.lang || "";
  return { text, context, pageLang, dir, pageUrl: location.href };
}
```

### 1.2 Context Extraction `lib/context.js` (implement `01 §3` algorithm)
```js
const BLOCK = new Set(["P","LI","BLOCKQUOTE","TD","TH","DIV","SECTION","ARTICLE","H1","H2","H3","H4","DD","DT"]);
const MAX = 1500, MIN = 400, MARK_L = "【【", MARK_R = "】】";

export function extractContext(range, text) {
  let node = range.startContainer;
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && !BLOCK.has(el.tagName)) el = el.parentElement;
  el = el || document.body;

  let base = (el.textContent || "").replace(/\s+/g, " ").trim();
  // In base, wrap the first occurrence of text with markers (fallback: prepend if not found)
  let marked = base.includes(text)
    ? base.replace(text, MARK_L + text + MARK_R)
    : `${MARK_L}${text}${MARK_R} … ${base}`;

  // If not long enough, go up / to siblings to supplement
  let cur = el;
  while (marked.length < MIN && cur.parentElement) {
    cur = cur.parentElement;
    const more = (cur.textContent || "").replace(/\s+/g, " ").trim();
    if (more.length > marked.length) marked = more.includes(text)
      ? more.replace(text, MARK_L + text + MARK_R) : marked;
    if (cur === document.body) break;
  }
  if (marked.length > MAX) marked = clampAroundMark(marked, MAX);

  const dir = (getComputedStyle(el).direction === "rtl"
    || el.closest("[dir=rtl]")) ? "rtl" : "ltr";
  return { context: marked, dir };
}

function clampAroundMark(s, max) {
  const i = s.indexOf("【【"); if (i < 0) return s.slice(0, max);
  const half = Math.floor(max / 2);
  return s.slice(Math.max(0, i - half), i + half);
}
```

### 1.3 Bubble Rendering (Shadow DOM)
- Use a fixed host element attached to `document.body` + `attachShadow({mode:"open"})`.
- Bubble styles go through `card.css` injected into shadow (content_scripts.css injects at page level; shadow needs its own `<style>` or `adoptedStyleSheets`). **Recommend `adoptedStyleSheets`**, feed the same CSS text to shadow for complete isolation.
- Bubble click → `startExplain()`.

### 1.4 Keyboard Shortcut
`background.js` listens to `commands.onCommand`, sends `SHORTCUT_TRIGGER` to content of the active tab:
```js
browser.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "trigger-explain") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "SHORTCUT_TRIGGER" });
});
```

**Acceptance Gate 1**: On aljazeera.net, select an Arabic word, bubble appears and positions correctly (right-aligned under RTL); after click, console prints a structurally correct payload with `【【…】】` markers, `dir:"rtl"`.

---

## Phase 2 · AI Pipeline (Native Messaging + Streaming Call)

Goal: content triggers → background gets key → calls AI → streams incremental bytes back to content (content first `console.log` increments, does not render card).

### 2.1 `SafariWebExtensionHandler.swift` Rewrite (Read Keychain)
```swift
import SafariServices
import os.log

let kService = "top.bayanlistening.tafsirlingo.apikey"
let kAccessGroup = "top.bayanlistening.tafsirlingo"   // Replace with <TeamID>.<group> at release per config
let kAppGroup = "group.top.bayanlistening.tafsirlingo"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
  func beginRequest(with context: NSExtensionContext) {
    let item = context.inputItems.first as? NSExtensionItem
    let message = item?.userInfo?[SFExtensionMessageKey]
    let dict = message as? [String: Any] ?? [:]
    let type = dict["type"] as? String ?? ""

    var response: [String: Any]
    switch type {
    case "PING":
      response = ["ok": true]
    case "GET_CONFIG":
      let d = UserDefaults(suiteName: kAppGroup)
      let baseURL = d?.string(forKey: "baseURL") ?? ""
      let model = d?.string(forKey: "model") ?? ""
      let targetLang = d?.string(forKey: "targetLang") ?? ""
      let key = readKey(account: baseURL)
      response = ["ok": true,
                  "config": ["baseURL": baseURL, "model": model,
                             "targetLang": targetLang, "hasKey": key != nil],
                  "apiKey": key ?? ""]
    default:
      response = ["ok": false, "error": "unknown type"]
    }
    // Note: NEVER os_log(apiKey)
    let out = NSExtensionItem()
    out.userInfo = [SFExtensionMessageKey: response]
    context.completeRequest(returningItems: [out], completionHandler: nil)
  }

  func readKey(account: String) -> String? {
    var q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: kService,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    if !account.isEmpty { q[kSecAttrAccount as String] = account }
    if !kAccessGroup.isEmpty { q[kSecAttrAccessGroup as String] = kAccessGroup }
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
          let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
```

### 2.2 `background.js`: Get Config + OpenAI Streaming
```js
const APP_ID = "top.bayanlistening.tafsirlingo";

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "explain") return;
  let controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "START") return;
    controller.abort(); controller = new AbortController();
    await runExplain(msg.payload, port, controller.signal);
  });
});

async function runExplain(payload, port, signal) {
  let cfg;
  try {
    const r = await browser.runtime.sendNativeMessage(APP_ID, { type: "GET_CONFIG" });
    cfg = r?.config; cfg.apiKey = r?.apiKey;
  } catch (e) { return port.postMessage({ type: "ERROR", kind: "native", message: String(e) }); }

  if (!cfg?.hasKey || !cfg.baseURL) return port.postMessage({ type: "NOT_CONFIGURED" });

  const url = normalizeBaseURL(cfg.baseURL);   // see 01 §5
  const body = {
    model: cfg.model, stream: true,
    messages: [
      { role: "system", content: systemPrompt(cfg.targetLang) },
      { role: "user", content: userPrompt(payload.text, payload.context) }
    ]
  };
  let res;
  try {
    res = await fetch(url, {
      method: "POST", signal,
      headers: { "Authorization": `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (e) { return port.postMessage({ type: "ERROR", kind: "network", message: String(e) }); }

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    return port.postMessage({ type: "ERROR", kind: mapHttp(res.status), message: extractErr(t) });
  }
  port.postMessage({ type: "OPEN" });   // first byte, content switches to streaming
  await pumpSSE(res, port);
  port.postMessage({ type: "DONE" });
}

async function pumpSSE(res, port) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content
                   ?? j.choices?.[0]?.message?.content ?? "";
        if (delta) port.postMessage({ type: "DELTA", text: delta });
      } catch { /* ignore heartbeats / non-json lines */ }
    }
  }
}
```
`normalizeBaseURL` / `systemPrompt` / `userPrompt` / `mapHttp` / `extractErr` implemented per `01 §5`.

### 2.3 Content Side: Establish Port (Print First)
```js
function startExplain() {
  const payload = buildPayload(); if (!payload) return;
  const port = browser.runtime.connect({ name: "explain" });
  port.postMessage({ type: "START", payload });
  port.onMessage.addListener((m) => console.log("[explain]", m)); // Phase 3: change to card rendering
}
```

**Acceptance Gate 2**: First, hardcode a real key in settings placeholder (or temporarily hardcode into Keychain for debugging); after selecting text and triggering, console sees continuous `DELTA` increments and final `DONE`; with no key, receive `NOT_CONFIGURED`; with network off, receive `ERROR/network`.

---

## Phase 3 · Liquid Glass Card (content script rendering)

Goal: turn the Phase 2 console stream into the card state machine from `03 §4` + Liquid Glass appearance from `02 §4`.

### 3.1 `card.css`
Fully implement tokens, `.lg-card`, `::before` sheen, sweep animation, `@supports url(#lg-refract)` progressive enhancement, dark mode, `prefers-reduced-motion` / `prefers-reduced-transparency` degradation from `02 §4.1–4.6`. **Hard constraint: blur ≤ 4px.**

### 3.2 Card Component `lib/card.js`
- `mountCard(anchorRect, dir)`: build card DOM inside shadow host at body position; inject `card.css` via `adoptedStyleSheets`; position/overflow per `03 §4.7`; set `direction` per `03 §6`.
- Inject one hidden SVG filter once (`02 §4.4`).
- State methods: `setLoading()` / `open()` / `appendDelta(t)` / `done()` / `notConfigured()` / `error(kind,msg)`.
- `appendDelta` **use only `textContent +=`**, no `innerHTML` (`01 §7`).
- Action row buttons (copy/retry/close) per `03 §4.4`.
- Entry plays `02 §4.3` sweep + scale; skip under `prefers-reduced-motion`.

### 3.3 Wire Up (Replace Phase 2.3's console)
```js
function startExplain() {
  const payload = buildPayload(); if (!payload) return;
  hideBubble();
  const card = mountCard(STATE.lastRange.getBoundingClientRect(), payload.dir);
  card.setLoading();
  const port = browser.runtime.connect({ name: "explain" });
  STATE.activePort = port;
  port.postMessage({ type: "START", payload });
  port.onMessage.addListener((m) => {
    switch (m.type) {
      case "OPEN": card.open(); break;
      case "DELTA": card.appendDelta(m.text); break;
      case "DONE": card.done(); break;
      case "NOT_CONFIGURED": card.notConfigured(); break;
      case "ERROR": card.error(m.kind, m.message); break;
    }
  });
  card.onRetry(() => { card.setLoading(); port.postMessage({ type: "START", payload }); });
  card.onClose(() => { port.disconnect(); card.dismiss(); });
  card.onOpenSettings(() => browser.runtime.sendMessage({ type: "OPEN_SETTINGS" }));
}
```
- Close / scroll out of viewport / Esc / click elsewhere → `port.disconnect()` + `card.dismiss()`.
- `OPEN_SETTINGS` handled by background → native open settings window (Phase 4.4).

**Acceptance Gate 3**: Select text → bubble → tap → card Liquid Glass entry → streaming word by word → completion action row. Check item-by-item against `02 §6` acceptance checklist (especially blur≤4px, specular rim present, sweep present, background discernible). RTL article direction is correct.

---

## Phase 4 · Native Settings UI (SwiftUI True Liquid Glass)

Goal: implement `03 §7` settings window, true Liquid Glass, able to write Keychain + App Group, test connection, and be invoked by the extension.

### 4.1 Switch from AppKit Template to SwiftUI
The template host app is `AppDelegate` + `ViewController`(WKWebView). Change to SwiftUI App:
- Add `TafsirLingoApp.swift` (`@main struct ... : App`), `Settings`/`WindowGroup` host `SettingsView`.
- Remove/deprecate `ViewController.swift`'s WKWebView homepage (or keep it as "how to enable extension" guide page).

### 4.2 `SettingsView.swift` (True Liquid Glass, APIs from 02 §3.1)
```swift
import SwiftUI

struct SettingsView: View {
  @StateObject var vm = SettingsVM()
  @Namespace private var ns

  var body: some View {
    ZStack {
      MeshGradientBackground()           // colorful background for glass to refract, see 02 §3.3
      ScrollView {
        VStack(spacing: 20) {
          header
          GlassEffectContainer(spacing: 20) {
            VStack(spacing: 16) {
              aiConfigCard
              preferenceCard
              shortcutCard
            }
          }
          aboutFooter
        }.padding(24)
      }
    }
    .frame(minWidth: 520, minHeight: 620)
  }

  var aiConfigCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      LabeledField("Base URL", text: $vm.baseURL, placeholder: "https://api.openai.com/v1")
      SecureFieldRevealable("API Key", text: $vm.apiKey)
      LabeledField("Model", text: $vm.model, placeholder: "gpt-4o-mini")
      HStack {
        Button(action: vm.testConnection) {
          Label(vm.testing ? "Testing…" : "Test Connection", systemImage: "bolt.fill")
        }.buttonStyle(.glassProminent).disabled(vm.testing)
        if let r = vm.testResult { Text(r.text).foregroundStyle(r.color).font(.caption) }
      }
    }
    .padding(18)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))   // true Liquid Glass
  }
  // preferenceCard / shortcutCard same pattern, wrapped with .glassEffect(...)
}
```
> Key points: `.glassEffect` goes last; multiple cards wrapped in `GlassEffectContainer`; primary button `.glassProminent`; background must have content to refract. Even with D1=26, still use `if #available(macOS 26,*)` wrapper + `.background(.regularMaterial)` fallback (`02 §3.2-7`).

### 4.3 `SettingsVM.swift`: Write Keychain + App Group + Test Connection
```swift
@MainActor final class SettingsVM: ObservableObject {
  @Published var baseURL = "", apiKey = "", model = ""
  @Published var targetLang = Locale.preferredLanguageCode()
  @Published var testing = false
  @Published var testResult: (text: String, color: Color)? = nil

  let appGroup = "group.top.bayanlistening.tafsirlingo"

  func load() {
    let d = UserDefaults(suiteName: appGroup)
    baseURL = d?.string(forKey: "baseURL") ?? ""
    model = d?.string(forKey: "model") ?? ""
    targetLang = d?.string(forKey: "targetLang") ?? targetLang
    apiKey = Keychain.read(account: baseURL) ?? ""
  }
  func save() {
    let d = UserDefaults(suiteName: appGroup)
    d?.set(baseURL, forKey: "baseURL"); d?.set(model, forKey: "model"); d?.set(targetLang, forKey: "targetLang")
    Keychain.write(apiKey, account: baseURL)   // see 4.3.1
  }
  func testConnection() {
    testing = true; testResult = nil
    Task {
      defer { testing = false }
      do { try await AIProbe.ping(baseURL: baseURL, key: apiKey, model: model)
           testResult = ("Connection successful", .green) }
      catch let e as AIError { testResult = (e.userText, .red) }
      catch { testResult = ("Something went wrong", .red) }
    }
  }
}
```

#### 4.3.1 `Keychain.swift` (write/read, convention from 01 §4)
```swift
enum Keychain {
  static let service = "top.bayanlistening.tafsirlingo.apikey"
  static let group = "top.bayanlistening.tafsirlingo"   // per actual config at release

  static func write(_ value: String, account: String) {
    delete(account: account)
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
      kSecValueData as String: Data(value.utf8)
    ]
    SecItemAdd(q as CFDictionary, nil)
  }
  static func read(account: String) -> String? { /* same as 02.1 readKey */ }
  static func delete(account: String) { /* SecItemDelete with same service+account */ }
}
```

### 4.4 Invoke Settings: Extension → App
- background receives content's `OPEN_SETTINGS` → `sendNativeMessage(APP_ID, {type:"OPEN_SETTINGS"})`.
- native handler receives → use `NSWorkspace`/activate App and show settings window (or host app registers URL scheme `tafsirlingo://settings`, handler opens it).
- Popup's "Open Settings" works the same way.

**Acceptance Gate 4**: Settings UI is true Liquid Glass (pass `02 §6` native checklist); fill key and tap "Test Connection" successfully; config persists after app restart; tapping "Open Settings" from webpage NOT_CONFIGURED card invokes the window; Keychain has the entry and logs contain no key.

---

## Phase 5 · Polish & Localization

- **Full error state variants**: trigger each one for real (wrong key→401, wrong URL→404, no network, timeout, 429), verify `03 §4.6` copy and "Open Settings / Retry" buttons are correct.
- **Full RTL chain**: aljazeera Arabic word + Chinese explanation, title RTL, body LTR (`03 §6`).
- **Reduce Motion / Reduce Transparency**: cards and settings degrade correctly under system toggles (`02 §5`).
- **Localization**: `_locales/en`, `_locales/zh(_CN)` fill all `03 §9`; SwiftUI side use `Localizable.strings` aligned to the same copy set.
- **Icons**: replace template placeholder icons (48–512 + toolbar svg); design aligns with "explain / glass" imagery.
- **Popup beautification**: glass-style status card per `03 §8`.
- **Empty selection / long selection / pure symbols**: boundary error handling (`03 §3` appearance conditions).
- **Performance**: `selectionchange` debounce; card `will-change` control; sweep animation plays only once, not continuously (save battery).

**Acceptance Gate 5**: All items in `00 §5` Definition of Done are checked off.

---

## File Inventory (Final State Quick Reference)

```
TafsirLingo/                         # Host App (SwiftUI)
  TafsirLingoApp.swift               # @main
  SettingsView.swift                 # Settings UI (true Liquid Glass)
  SettingsVM.swift                   # Config read/write + test connection
  Keychain.swift                     # Keychain wrapper
  AIProbe.swift                      # Probe request for test connection
  MeshGradientBackground.swift       # Background glass can refract
  (Deprecated ViewController.swift or repurposed as "how to enable extension" guide)

TafsirLingo Extension/
  SafariWebExtensionHandler.swift    # Native Messaging: read Keychain / open settings
  Resources/
    manifest.json
    background.js                    # Get config + OpenAI streaming + command routing
    content.js                       # Selection + trigger + wiring
    card.css                         # Liquid Glass card styles (blur≤4px)
    popup.html / popup.js / popup.css
    lib/context.js                   # Context extraction
    lib/card.js                      # Card state machine component
    lib/ai.js (optional)             # normalizeBaseURL/prompt/error mapping
    _locales/en/messages.json
    _locales/zh/messages.json (+ zh_CN)
    images/ (icons)

docs/                                # This plan document
```

## Test & Verification Commands (macOS side)
- Build / run: Xcode select host app scheme, ⌘R. First time, enable in Safari "Settings → Extensions", and allow "unsigned/development" extensions (Safari "Develop" menu check "Allow Unsigned Extensions").
- Extension JS debugging: Safari "Develop → Web Inspector" can debug content/background.
- Real device verify primary use case: open aljazeera.net Arabic article, select text, verify against `00 §5`.
- Pre-submit: run both `02 §6` + `00 §5` checklists completely.