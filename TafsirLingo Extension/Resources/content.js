// content.js — TafsirLingo content script (source)
// This file is the development source. esbuild bundles it together with
// lib/*.js into Resources/content.bundle.js (an IIFE), which is what the
// manifest actually loads. Safari content scripts do not support static or
// dynamic imports, so bundling is the only way to ship multi-file modules.
//
// Phase 1: selection pipeline (bubble + payload build).
// Phase 2/3: connect to background for AI streaming, render Liquid Glass card.

import { extractContext, extractPageMeta } from "./lib/context.js";
import { showBubble, hideBubble, positionBubble, bubbleHost } from "./lib/bubble.js";
import { mountCard, getCardHost } from "./lib/card.js";

const STATE = {
  card: null,
  activePort: null,
  followUpPort: null,
  lastRange: null,
  anchorRange: null,   // the Range the card is anchored to (for scroll-follow)
  messages: [], // conversation history: [{role, text}]
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

  // Capture selection rects BEFORE clearing STATE.lastRange
  const selRects = captureSelectionRects();

  hideBubble();
  // Save the anchor range *before* clearing STATE.lastRange so the card
  // can follow this selection on scroll.
  if (STATE.lastRange) STATE.anchorRange = STATE.lastRange.cloneRange();
  STATE.lastRange = null;

  // Show glass-bubble highlight over the selected text
  showSelectionHighlight(selRects);

  const anchorRect = payload.anchorRect;
  const card = await mountCard(anchorRect, {
    dir: payload.dir,
    title: payload.text,
    originalText: payload.text,
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
    hideSelectionHighlight();
    try { port.disconnect(); } catch (_) { /* already closed */ }
    STATE.activePort = null;
    STATE.card = null;
    STATE.anchorRange = null;
    card.dismiss();
  };

  // Set up follow-up callback
  card.onFollowUp = (text) => {
    sendFollowUp(text, payload, card);
  };

  start();
}

function sendFollowUp(text, payload, card) {
  // Build full conversation history
  const history = [
    { role: "user", text: payload.text },
    { role: "assistant", text: card._initialResponse || "" },
  ];
  // Add prior conversation messages
  for (const msg of STATE.messages) {
    history.push({ role: msg.role, text: msg.text });
  }
  // Add current user message
  history.push({ role: "user", text });

  // Open follow-up port
  if (STATE.followUpPort) {
    try { STATE.followUpPort.disconnect(); } catch (_) {}
  }
  const port = browser.runtime.connect({ name: "followup" });
  STATE.followUpPort = port;

  card.open(); // start streaming in chat mode
  port.postMessage({ type: "FOLLOW_UP", payload, history });

  let responseText = "";
  port.onMessage.addListener((m) => {
    switch (m.type) {
      case "OPEN":     card.open(); break;
      case "DELTA":
        responseText += (m.text || "");
        card.appendDelta(m.text || "");
        break;
      case "DONE":
        card.done();
        // Save to conversation history
        STATE.messages.push({ role: "user", text });
        STATE.messages.push({ role: "assistant", text: responseText });
        break;
      case "NOT_CONFIGURED": card.notConfigured(); break;
      case "ERROR":    card.error(m.kind, m.message); break;
    }
  });

  port.onDisconnect.addListener(() => {
    if (STATE.followUpPort === port) STATE.followUpPort = null;
  });
}

function buildPayload() {
  const sel = window.getSelection();
  const range = STATE.lastRange || (sel && sel.rangeCount ? sel.getRangeAt(0) : null);
  if (!range) return null;
  const text = (sel?.toString() || "").trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  const { context, dir } = extractContext(range, text);
  const { title, description } = extractPageMeta();
  const pageLang = (document.documentElement.lang || "").trim();
  return {
    text,
    context,
    pageLang,
    dir,
    pageTitle: title,
    pageDescription: description,
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

let scrollRaf = 0;
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
  // Card follows the anchor selection on scroll (rAF-throttled).
  if (STATE.card && STATE.anchorRange) {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!STATE.card || !STATE.anchorRange) return;
      const r = STATE.anchorRange.getBoundingClientRect();
      // Auto-close when the selection is scrolled far out of view.
      if (r.bottom < -200 || r.top > window.innerHeight + 200) {
        STATE.card.onClose && STATE.card.onClose();
        return;
      }
      STATE.card.reposition(r);
    });
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

// ── Selection glass-bubble highlight ──

/** Capture client rects for each line of the current selection. */
function captureSelectionRects() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = STATE.lastRange || sel.getRangeAt(0);
  if (!range) return null;
  const rects = range.getClientRects();
  if (!rects || rects.length === 0) {
    // Fallback: single bounding rect
    const br = range.getBoundingClientRect();
    if (br.width === 0 || br.height === 0) return null;
    return [br];
  }
  return Array.from(rects).filter((r) => r.width > 0 && r.height > 0);
}

/** Create glass-bead overlay segments over each line of selected text. */
function showSelectionHighlight(rects) {
  hideSelectionHighlight();
  if (!rects || rects.length === 0) return;

  const pad = 2;
  rects.forEach((r, i) => {
    const seg = document.createElement("div");
    seg.className = "lg-sel-segment";
    const radius = Math.max(3, Math.min((r.height + pad * 2) / 2, 8));
    seg.style.cssText = [
      `top:${r.top - pad}px`,
      `left:${r.left - pad}px`,
      `width:${r.width + pad * 2}px`,
      `height:${r.height + pad * 2}px`,
      `border-radius:${radius}px`,
      `animation-delay:${i * 25}ms`,
    ].join(";");
    document.documentElement.appendChild(seg);
  });
}

/** Remove the glass-bead highlight overlay. */
function hideSelectionHighlight() {
  document.querySelectorAll(".lg-sel-segment").forEach((el) => el.remove());
}

function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}