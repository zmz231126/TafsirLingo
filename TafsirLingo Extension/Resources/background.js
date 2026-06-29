// background.js — TafsirLingo background service worker (source)
// Bundled together with lib/ai.js into Resources/background.bundle.js (IIFE)
// by esbuild at build time. Safari does support `type: "module"` backgrounds
// since 16.4, but bundling keeps both content and background symmetric and
// avoids any per-version module-resolution surprises.

import { normalizeBaseURL, systemPrompt, userPrompt, mapHttpStatus, extractErrorMessage } from "./lib/ai.js";

const APP_ID = "top.bayanlistening.tafsirlingo";
const PORT_NAME = "explain";
const FIRST_BYTE_TIMEOUT_MS = 15_000;

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "trigger-explain") return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await browser.tabs.sendMessage(tab.id, { type: "SHORTCUT_TRIGGER" });
    }
  } catch (e) {
    console.error("[TafsirLingo] shortcut dispatch failed", e);
  }
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "OPEN_SETTINGS") {
    browser.runtime.sendNativeMessage(APP_ID, { type: "OPEN_SETTINGS" }).then(
      (resp) => sendResponse(resp ?? { ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  let controller = null;
  let accepting = true;

  port.onDisconnect.addListener(() => {
    accepting = false;
    if (controller) controller.abort();
  });

  port.onMessage.addListener(async (msg) => {
    if (!accepting) return;
    if (msg?.type !== "START" || !msg.payload) return;
    if (controller) controller.abort();
    controller = new AbortController();
    controller.signal.addEventListener("abort", () => { /* nothing else to do */ });
    try {
      await runExplain(msg.payload, port, controller.signal);
    } catch (e) {
      if (accepting) port.postMessage({ type: "ERROR", kind: "native", message: String(e) });
    }
  });
});

async function runExplain(payload, port, signal) {
  let cfg;
  try {
    const r = await browser.runtime.sendNativeMessage(APP_ID, { type: "GET_CONFIG" });
    cfg = r?.config;
    cfg = { ...cfg, apiKey: r?.apiKey ?? "" };
  } catch (e) {
    return port.postMessage({ type: "ERROR", kind: "native", message: String(e) });
  }

  if (!cfg?.hasKey || !cfg.baseURL) {
    return port.postMessage({ type: "NOT_CONFIGURED" });
  }

  let requestURL;
  try {
    requestURL = normalizeBaseURL(cfg.baseURL, "/chat/completions");
  } catch (e) {
    return port.postMessage({ type: "ERROR", kind: "url", message: String(e) });
  }

  const body = {
    model: cfg.model,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt(cfg.targetLang) },
      { role: "user", content: userPrompt(payload.text, payload.context) }
    ],
    // Disable thinking/reasoning for providers that support it (MiniMax-M3,
    // DeepSeek, etc.). Harmless if ignored by the provider.
    thinking: { type: "disabled" }
  };

  let res;
  try {
    res = await fetch(requestURL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    if (signal.aborted) return;
    return port.postMessage({ type: "ERROR", kind: "network", message: String(e) });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return port.postMessage({
      type: "ERROR",
      kind: mapHttpStatus(res.status),
      message: extractErrorMessage(text)
    });
  }

  const firstByteTimer = setTimeout(() => {
    if (controller) controller.abort();
    if (accepting) {
      port.postMessage({ type: "ERROR", kind: "timeout", message: "first byte timeout" });
    }
  }, FIRST_BYTE_TIMEOUT_MS);

  port.postMessage({ type: "OPEN" });
  try {
    await pumpSSE(res, port, () => { clearTimeout(firstByteTimer); });
  } catch (e) {
    if (signal.aborted) return;
    return port.postMessage({ type: "ERROR", kind: "network", message: String(e) });
  } finally {
    clearTimeout(firstByteTimer);
  }
  port.postMessage({ type: "DONE" });
}

async function pumpSSE(res, port, onFirstByte) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let firstByte = true;
  let inThink = false; // tracks <think>...</think> across streaming chunks
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (firstByte) {
      firstByte = false;
      try { onFirstByte && onFirstByte(); } catch (_) { /* swallow */ }
    }
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const choice = j.choices?.[0];
        const delta = choice?.delta ?? {};
        // Only process `content` — never `reasoning_content` /
        // `reasoning` / similar fields — to avoid leaking internal
        // thinking. This works for any OpenAI-compatible endpoint
        // without per-host branching.
        let text = delta.content ?? choice?.message?.content ?? "";
        if (!text) continue;
        // Walk the chunk character by character to handle <think>..</think>
        // blocks that may begin or end in this chunk, or span across
        // multiple chunks (common in streaming SSE).
        let filtered = "";
        let remaining = text;
        while (remaining.length > 0) {
          if (inThink) {
            // Inside a <think> block — suppress everything until </think>
            const close = remaining.indexOf("</think>");
            if (close >= 0) {
              inThink = false;
              remaining = remaining.slice(close + 8); // past </think>
            } else {
              remaining = ""; // discard rest of this chunk
            }
          } else {
            const open = remaining.indexOf("<think>");
            if (open >= 0) {
              filtered += remaining.slice(0, open);
              remaining = remaining.slice(open + 7); // past <think>
              inThink = true;
            } else {
              filtered += remaining;
              remaining = "";
            }
          }
        }
        // Post-processing for non-tag thinking patterns (third-person
        // meta-commentary, "(think)" prefix, etc.)
        filtered = stripThinking(filtered);
        if (filtered) port.postMessage({ type: "DELTA", text: filtered });
      } catch { /* ignore heartbeats / non-JSON lines */ }
    }
  }
}

function stripThinking(text) {
  if (!text) return text;
  // 1) Whole `<think>...</think>` blocks, multiline + dotall.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // 2) MiniMax's bare `(think)\n` / `(think) ` prefix that opens the
  //    reasoning section when reasoning_split is off. The closer is just
  //    "the user-facing content begins"; we cannot reliably detect it, so
  //    we instead drop the prefix and trust the model's later output to be
  //    the answer.
  text = text.replace(/^\s*\(think\)\s*\n?/i, "");
  // 3) Stray opening/closing think tags.
  text = text.replace(/<\/?think>/gi, "");
  // 4) Leading third-person meta-commentary — leak from chain-of-thought
  //    when the model outputs reasoning as `content` without tag wrappers.
  //    Matches one or more sentences that describe what "The user" did
  //    ("The user selected...", "The user is asking about...", etc.) and
  //    follow-up sentences starting with "They" ("They want to know...").
  //    These are never part of a valid user-facing explanation.
  text = text.replace(/^\s*(The user .*?\.\s*)+(\s*They .*?\.\s*)?/i, "");
  return text;
}