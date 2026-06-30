// lib/bubble.js — small Liquid Glass "Explain" trigger button.
// Shown near the user's selection; click → invoke onTrigger().
// Rendering logic only. Selection / state lives in content.js.

import { BUBBLE_CSS } from "./bubbleCss.js";

const HOST_ID = "tafsirlingo-bubble-host";

function getHost() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BUBBLE_CSS;
    shadow.appendChild(style);
    host._shadow = shadow;
  }
  return host;
}

export function showBubble(rect, onTrigger) {
  const host = getHost();
  const shadow = host._shadow;
  hideBubble();

  // Detect text direction from the current selection.
  let isRTL = false;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const node = sel.getRangeAt(0).startContainer;
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (el) isRTL = getComputedStyle(el).direction === "rtl";
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lg-bubble";
  btn.setAttribute("aria-label", "Explain selection");
  btn.innerHTML = `
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
            d="M8 1.5 9.6 5l3.7.4-2.8 2.5.8 3.7L8 9.7 4.7 11.6l.8-3.7L2.7 5.4 6.4 5z"/>
    </svg>
    <span class="lg-bubble__label">Explain</span>
  `;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onTrigger();
  }, true);

  shadow.appendChild(btn);
  host._bubble = btn;
  positionBubble(host, btn, rect);

  // Entry animation: slide from the direction the text reads toward.
  // LTR → slide in from the right (+x), RTL → slide in from the left (-x).
  const entryX = isRTL ? -14 : 14;
  btn.style.setProperty("--entry-ox", `${entryX}px`);
  btn.style.setProperty("--entry-oy", "0px");

  host.dataset.visible = "1";
}

export function positionBubble(host, btn, rect) {
  if (!btn || !host) return;
  const offset = 8;
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = btn.getBoundingClientRect();
  const w = r.width || 92;
  const h = r.height || 32;

  let top = rect.bottom + offset;
  let left = rect.right - w;
  if (left + w + margin > vw) left = vw - w - margin;
  if (left < margin) left = margin;
  if (top + h + margin > vh) {
    top = rect.top - h - offset;
    if (top < margin) top = margin;
  }

  // Drive position via CSS variables so the base `transform` in the stylesheet
  // (which is referenced by :hover / :active) is the single source of truth.
  // Setting inline `transform` here would fight both the entry animation's
  // fill-mode forwards and the :hover/:active rules.
  btn.style.setProperty("--tx", `${Math.round(left)}px`);
  btn.style.setProperty("--ty", `${Math.round(top)}px`);
}

export function hideBubble() {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  if (host._bubble) {
    host._bubble.remove();
    host._bubble = null;
  }
  delete host.dataset.visible;
}

export function bubbleHost() {
  return getHost();
}