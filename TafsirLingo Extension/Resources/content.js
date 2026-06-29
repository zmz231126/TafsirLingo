// content.js — TafsirLingo content script (source)
// This file is the development source. esbuild bundles it together with
// lib/*.js into Resources/content.bundle.js (an IIFE), which is what the
// manifest actually loads. Safari content scripts do not support static or
// dynamic imports, so bundling is the only way to ship multi-file modules.
//
// Phase 1: selection pipeline (bubble + payload build).
// Phase 2/3: connect to background for AI streaming, render Liquid Glass card.

import { extractContext } from "./lib/context.js";
import { showBubble, hideBubble, positionBubble, bubbleHost } from "./lib/bubble.js";
import { mountCard, getCardHost } from "./lib/card.js";

const STATE = {
  card: null,
  activePort: null,
  lastRange: null,
};

const SELECTION_DEBOUNCE_MS = 120;
const MIN_TEXT_LENGTH = 1;
const MAX_SELECTION_CHARS = 600;

document.addEventListener("selectionchange", debounce(onSelectionChange, SELECTION_DEBOUNCE_MS));
document.addEventListener("mousedown", maybeDismiss, true);
document.addEventListener("scroll", onScroll, true);
window.addEventListener("keydown", onKeydown, true);

if (browser.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SHORTCUT_TRIGGER") {
      startExplain();
    }
  });
}

function onSelectionChange() {
  if (STATE.card) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) { hideBubble(); return; }
  const text = sel.toString().trim();
  if (text.length < MIN_TEXT_LENGTH) { hideBubble(); return; }
  const range = sel.getRangeAt(0);
  if (range.collapsed) { hideBubble(); return; }
  STATE.lastRange = range.cloneRange();
  showBubble(range.getBoundingClientRect(), () => startExplain());
}

async function startExplain() {
  const payload = buildPayload();
  if (!payload) return;
  hideBubble();
  STATE.lastRange = null;

  const anchorRect = payload.anchorRect;
  const card = await mountCard(anchorRect, {
    dir: payload.dir,
    title: payload.text,
  });
  STATE.card = card;

  const port = browser.runtime.connect({ name: "explain" });
  STATE.activePort = port;

  let retryCount = 0;
  const start = () => {
    card.setLoading();
    port.postMessage({ type: "START", payload });
  };

  port.onMessage.addListener((m) => {
    switch (m.type) {
      case "OPEN":     card.open(); break;
      case "DELTA":    card.appendDelta(m.text || ""); break;
      case "DONE":     card.done(); break;
      case "NOT_CONFIGURED": card.notConfigured(); break;
      case "ERROR":    card.error(m.kind, m.message); break;
    }
  });

  card.onRetry = () => { retryCount += 1; start(); };
  card.onClose = () => {
    try { port.disconnect(); } catch (_) { /* already closed */ }
    STATE.activePort = null;
    STATE.card = null;
    card.dismiss();
  };

  start();
}

function buildPayload() {
  const sel = window.getSelection();
  const range = STATE.lastRange || (sel && sel.rangeCount ? sel.getRangeAt(0) : null);
  if (!range) return null;
  const text = (sel?.toString() || "").trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  const { context, dir } = extractContext(range, text);
  const pageLang = (document.documentElement.lang || "").trim();
  return {
    text,
    context,
    pageLang,
    dir,
    pageUrl: location.href,
    selectionLen: text.length,
    tooLong: text.length > MAX_SELECTION_CHARS,
    anchorRect: range.getBoundingClientRect(),
  };
}

function maybeDismiss(e) {
  if (STATE.card) return;
  const host = bubbleHost();
  if (!host || host.dataset.visible !== "1") return;
  if (e.composedPath && e.composedPath().includes(host)) return;
  hideBubble();
}

function onScroll() {
  // Bubble follows selection while visible.
  const host = bubbleHost();
  if (host && host.dataset.visible === "1" && STATE.lastRange) {
    const rect = STATE.lastRange.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      hideBubble();
    } else if (host._bubble) {
      positionBubble(host, host._bubble, rect);
    }
  }
  // Auto-close the card when the selection scrolls out of view.
  if (STATE.card && STATE.lastRange) {
    const r = STATE.lastRange.getBoundingClientRect();
    if (r.bottom < -200 || r.top > window.innerHeight + 200) {
      STATE.card.onClose && STATE.card.onClose();
    }
  }
}

function onKeydown(e) {
  if (e.key === "Escape") {
    if (STATE.card) {
      STATE.card.onClose && STATE.card.onClose();
    } else {
      hideBubble();
    }
  }
}

function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}