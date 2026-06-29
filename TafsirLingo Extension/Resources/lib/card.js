// lib/card.js — Liquid Glass explanation card state machine.
// Spec: docs/03-UI-UX-SPEC.md §4 + docs/04-IMPLEMENTATION-PLAN.md §3.2
//
// All rendering happens inside an open shadow root attached to a fixed host
// element on documentElement, so the host page's CSS cannot reach in.
// card.css is adopted as a Constructable Stylesheet to keep the shadow
// isolated from document style.

// card.js — Liquid Glass explanation card state machine.
// CSS is loaded at runtime via browser.runtime.getURL("card.css"); the actual
// stylesheet lives at Resources/card.css and is declared as web-accessible in
// manifest.json. No static import — Safari MV3 content scripts have no bundler.

import { renderMarkdown } from "./markdown.js";

const HOST_ID = "tafsirlingo-card-host";
const SVG_ID  = "tafsirlingo-svg-defs";
const REFRACT_FILTER_ID = "lg-refract";

const COPY = {
  loading:       { en: "Thinking…",          zh: "正在解释…" },
  copy:          { en: "Copy",               zh: "复制" },
  retry:         { en: "Retry",              zh: "重新解释" },
  close:         { en: "Close",              zh: "关闭" },
  openSettings:  { en: "Open Settings",      zh: "打开设置" },
  notCfgTitle:   { en: "Set up your AI first",
                   zh: "先配置 AI" },
  notCfgBody:    { en: "Add your API key in Settings to start explaining.",
                   zh: "在设置里填入 API key 即可开始解释。" },
  err: {
    network:   { en: "Network error. Check your connection.",
                 zh: "网络连接失败，请检查网络。" },
    auth:      { en: "Invalid API key. Check Settings.",
                 zh: "API key 无效或无权限，请到设置检查。" },
    notfound:  { en: "Model or endpoint not found. Check Settings.",
                 zh: "找不到该模型或接口地址，请检查设置。" },
    ratelimit: { en: "Rate limited. Try again shortly.",
                 zh: "请求过于频繁，请稍后再试。" },
    timeout:   { en: "Request timed out. Try again.",
                 zh: "请求超时，请重试。" },
    server:    { en: "The AI service is unavailable. Try again later.",
                 zh: "AI 服务暂不可用，请稍后再试。" },
    url:       { en: "Invalid base URL. Check Settings.",
                 zh: "接口地址格式有误，请检查设置。" },
    http:      { en: "Something went wrong.", zh: "出错了，请稍后再试。" },
    native:    { en: "Could not reach the TafsirLingo app. Make sure it is installed.",
                 zh: "无法连接 TafsirLingo，请确认已安装。" }
  }
};

let cardSheet = null;        // Constructable Stylesheet shared across cards

async function ensureStylesheet() {
  if (cardSheet) return cardSheet;
  if (typeof CSSStyleSheet === "undefined") return null;
  try {
    const text = await fetch(browser.runtime.getURL("card.css")).then((r) => r.text());
    cardSheet = new CSSStyleSheet();
    cardSheet.replaceSync(text);
  } catch (_) {
    // Safari MV3 should support Constructable Stylesheets; if not, fall back
    // to a plain <style> element appended into the shadow root.
    cardSheet = null;
  }
  return cardSheet;
}

async function loadInlineCss() {
  try {
    return await fetch(browser.runtime.getURL("card.css")).then((r) => r.text());
  } catch (_) {
    return "";
  }
}

function ensureSvgDefs() {
  if (document.getElementById(SVG_ID)) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = SVG_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none;";
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.id = REFRACT_FILTER_ID;
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", "100%");
  filter.setAttribute("height", "100%");
  const noise = document.createElementNS("http://www.w3.org/2000/svg", "feTurbulence");
  noise.setAttribute("type", "fractalNoise");
  noise.setAttribute("baseFrequency", "0.008 0.012");
  noise.setAttribute("numOctaves", "2");
  noise.setAttribute("seed", "7");
  noise.setAttribute("result", "noise");
  const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  blur.setAttribute("in", "noise");
  blur.setAttribute("stdDeviation", "1.5");
  blur.setAttribute("result", "soft");
  const map = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
  map.setAttribute("in", "SourceGraphic");
  map.setAttribute("in2", "soft");
  map.setAttribute("scale", "42");
  map.setAttribute("xChannelSelector", "R");
  map.setAttribute("yChannelSelector", "G");
  filter.append(noise, blur, map);
  defs.appendChild(filter);
  svg.appendChild(defs);
  document.documentElement.appendChild(svg);
}

function getHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("aria-hidden", "true");
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  host._shadow = shadow;
  return host;
}

function t(key, params) {
  const lang = (params && params.lang) || detectLang();
  const table = COPY[key];
  if (!table) return key;
  return table[lang] || table.en || key;
}

function detectLang() {
  const langs = (navigator.languages || [navigator.language || "en"]).map((l) => l.toLowerCase());
  if (langs.some((l) => l.startsWith("zh"))) return "zh";
  return "en";
}

export async function mountCard(anchorRect, opts = {}) {
  const host = getHost();
  const shadow = host._shadow;
  await ensureStylesheet();
  ensureSvgDefs();

  // Build card DOM
  const card = document.createElement("div");
  card.className = "lg-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("dir", opts.dir === "rtl" ? "rtl" : "ltr");

  const inner = document.createElement("div");
  inner.className = "lg-card__inner";

  const title = document.createElement("p");
  title.className = "lg-card__title";
  title.textContent = truncate(opts.title || "", 140);

  const body = document.createElement("div");
  body.className = "lg-card__md";

  const actions = document.createElement("div");
  actions.className = "lg-card__actions";
  actions.hidden = true;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "lg-card__close";
  closeBtn.setAttribute("aria-label", t("close"));
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => api._close && api._close());

  card.append(closeBtn, inner);
  inner.append(title, body, actions);

  // Apply stylesheet
  if (cardSheet) {
    shadow.adoptedStyleSheets = [cardSheet];
  } else {
    const css = await loadInlineCss();
    if (!shadow.querySelector("style[data-lg-card]")) {
      const style = document.createElement("style");
      style.setAttribute("data-lg-card", "1");
      style.textContent = css;
      shadow.appendChild(style);
    }
  }
  shadow.appendChild(card);

  positionCard(card, anchorRect, opts.dir === "rtl");

  // Card API
  const api = {
    el: card,
    body,
    title,
    actions,
    setLoading() {
      card.classList.remove("lg-card--error");
      body.innerHTML = "";
      const wrap = document.createElement("span");
      wrap.className = "lg-card__loading";
      wrap.textContent = t("loading") + " ";
      const d1 = document.createElement("span");
      const d2 = d1.cloneNode();
      const d3 = d1.cloneNode();
      wrap.append(d1, d2, d3);
      body.appendChild(wrap);
    },
    open() {
      body.innerHTML = "";
      body._streamText = "";
    },
    appendDelta(text) {
      if (body._streamText === undefined) this.open();
      body._streamText += text;
      // During streaming the source text is still being assembled, so any
      // unclosed construct (e.g. a still-arriving ```fence) renders as plain
      // text. The next chunk's re-render fixes the previous block.
      renderMarkdown(body, body._streamText);
      // Restore the trailing caret so the user sees the response still typing.
      let cursor = body._cursor;
      if (!cursor) {
        cursor = document.createElement("span");
        cursor.className = "lg-card__cursor";
        body._cursor = cursor;
      }
      body.appendChild(cursor);
      autoFollow(body);
    },
    done() {
      // Final pass on the fully assembled text so we drop the trailing caret
      // and let the renderer close any blocks that became complete only when
      // the stream ended (e.g. a final ``` closing fence).
      renderMarkdown(body, body._streamText || body.textContent || "");
      body._streamText = undefined;
      body._cursor = null;
      showActions(card, api, actions, opts);
    },
    notConfigured() {
      card.classList.add("lg-card--error");
      body.innerHTML = "";
      const t1 = document.createElement("div");
      t1.style.fontWeight = "600";
      t1.style.marginBottom = "4px";
      t1.textContent = t("notCfgTitle");
      const t2 = document.createElement("div");
      t2.textContent = t("notCfgBody");
      body.append(t1, t2);
      actions.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lg-card__btn lg-card__btn--primary";
      btn.textContent = t("openSettings");
      btn.addEventListener("click", () => browser.runtime.sendMessage({ type: "OPEN_SETTINGS" }));
      actions.appendChild(btn);
      actions.hidden = false;
    },
    error(kind, message) {
      card.classList.add("lg-card--error");
      body.innerHTML = "";
      const table = COPY.err[kind] || COPY.err.http;
      const text = (table && (table[detectLang()] || table.en)) || kind || "error";
      const head = document.createElement("div");
      head.style.fontWeight = "600";
      head.textContent = text;
      body.appendChild(head);
      if (message && message !== text) {
        const sub = document.createElement("div");
        sub.style.opacity = "0.7";
        sub.style.marginTop = "4px";
        sub.style.fontSize = "12px";
        sub.textContent = message;
        body.appendChild(sub);
      }
      actions.innerHTML = "";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "lg-card__btn";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => api.onRetry && api.onRetry());
      actions.appendChild(retry);
      if (kind === "auth" || kind === "notfound" || kind === "url") {
        const cfg = document.createElement("button");
        cfg.type = "button";
        cfg.className = "lg-card__btn lg-card__btn--primary";
        cfg.textContent = t("openSettings");
        cfg.addEventListener("click", () => browser.runtime.sendMessage({ type: "OPEN_SETTINGS" }));
        actions.appendChild(cfg);
      }
      actions.hidden = false;
    },
    dismiss() {
      card.style.animation = "lg-card-out 160ms ease-in forwards";
      setTimeout(() => {
        card.remove();
        if (!host.firstElementChild) {
          host.remove();
        }
      }, 170);
    },
    onRetry: null,
    onClose: null,
    onOpenSettings: null,
    _close() { if (api.onClose) api.onClose(); else api.dismiss(); }
  };

  api.setLoading();
  return api;
}

function showActions(card, api, actions, opts) {
  actions.innerHTML = "";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "lg-card__btn";
  copy.textContent = t("copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(api.body.innerText.trim());
      copy.textContent = "✓";
      setTimeout(() => (copy.textContent = t("copy")), 1200);
    } catch (_) { /* clipboard may be blocked; silent */ }
  });
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "lg-card__btn";
  retry.textContent = t("retry");
  retry.addEventListener("click", () => api.onRetry && api.onRetry());
  actions.append(copy, retry);
  actions.hidden = false;
}

function positionCard(card, anchorRect, isRTL) {
  const margin = 12;
  const offset = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = card.getBoundingClientRect();
  const w = r.width || 360;
  const h = r.height || 200;

  let top = anchorRect.bottom + offset;
  let left = isRTL ? (anchorRect.right - w) : anchorRect.left;
  if (left + w + margin > vw) left = vw - w - margin;
  if (left < margin) left = margin;
  if (top + h + margin > vh && anchorRect.top - h - offset > margin) {
    top = anchorRect.top - h - offset;
  }
  if (top < margin) top = margin;

  // Drive position via CSS variables so the stylesheet's base `transform`
  // (consumed by the entry animation's fill-mode forwards) is the single
  // source of truth. Setting inline `transform` would be overridden by the
  // animation's last keyframe.
  card.style.setProperty("--tx", `${Math.round(left)}px`);
  card.style.setProperty("--ty", `${Math.round(top)}px`);
}

function autoFollow(body) {
  // auto-scroll body to bottom unless the user has scrolled up
  const card = body.closest(".lg-card");
  if (!card) return;
  if (body._userScrolledUp) return;
  body.scrollTop = body.scrollHeight;
}

function truncate(s, n) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function getCardHost() {
  return document.getElementById(HOST_ID);
}