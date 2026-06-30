// lib/context.js — context extraction around a user selection.
//
// Strategy:
//   1. Extract page-level metadata (title, URL, description) so the model
//      knows what page the user is on.
//   2. Identify the page's main content area via heuristics (<main>,
//      <article>, common id/class names) and extract its cleaned text.
//      This gives the model much richer context than just the nearest
//      block element — critical for local models that can handle 100K+
//      tokens but benefit from focused input.
//   3. Strip clearly useless elements (nav, sidebar, comments, ads,
//      cookie notices, footer) so the model's attention stays on
//      substantive content.
//   4. Wrap the selected text with MARK_L / MARK_R so the model knows
//      which part to explain.
//   5. Fall back to the original nearest-block approach when the
//      selection doesn't appear inside the main content (edge case:
//      user selected text from a sidebar, nav, etc.).

const BLOCK = new Set([
  "P", "LI", "BLOCKQUOTE", "TD", "TH", "DIV", "SECTION",
  "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6", "DD", "DT"
]);

const MAX = 8000;
const MIN = 400;
const MARK_L = "【【";
const MARK_R = "】】";

const NOISE = [
  "nav",
  "aside", ".sidebar",
  ".comments", "#comments", ".comment", ".comment-list",
  ".ad", ".advertisement",
  ".cookie", ".cookie-notice", ".cookie-banner",
  ".popup", ".modal", ".overlay",
  "footer", ".footer",
  "script", "style", "noscript",
].join(",");

/** Extract page-level metadata for the AI prompt. */
export function extractPageMeta() {
  const metaDesc = document.querySelector('meta[name="description"]');
  return {
    title: (document.title || "").trim(),
    url: location.href,
    description: metaDesc
      ? (metaDesc.getAttribute("content") || "").trim()
      : "",
  };
}

/**
 * Extract surrounding page context for the selected text.
 *
 * Returns { context, dir } where `context` is the cleaned text of the
 * page's main content area with the selection wrapped in 【【】】.
 */
export function extractContext(range, text) {
  // Phase 1 — try to extract from the page's main content area
  const main = findMainContent();
  if (main) {
    const clean = getCleanText(main);
    if (clean.includes(text)) {
      let marked = clean.replace(text, MARK_L + text + MARK_R);
      if (marked.length > MAX) marked = clampAroundMark(marked, MAX);
      return { context: marked, dir: detectDirection(range) };
    }
  }

  // Phase 2 — fallback: nearest-block approach (original algorithm)
  return extractContextLegacy(range, text);
}

// ── Heuristic main content detection ────────────────────────────────

function findMainContent() {
  // Prefer semantic / ARIA landmarks.
  const semantic = document.querySelector('main, [role="main"]');
  if (semantic) return semantic;

  // Try <article> — used by most news / blog pages.
  const article = document.querySelector("article");
  if (article) return article;

  // Try common content-container selectors.
  const candidates = [
    "#content", "#main-content", "#main", "#post",
    ".content", ".post-content", ".article-content", ".article-body",
    ".entry-content", ".story-body", "#story-body",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  return document.body;
}

/** Get cleaned text from an element — strip noise, normalise whitespace. */
function getCleanText(el) {
  const clone = el.cloneNode(true);
  try {
    clone.querySelectorAll(NOISE).forEach((n) => n.remove());
  } catch (_) { /* ignore invalid selectors */ }
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

// ── Direction detection ─────────────────────────────────────────────

function detectDirection(range) {
  let node = range.startContainer;
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && !BLOCK.has(el.tagName)) el = el.parentElement;
  el = el || document.body;
  return getComputedStyle(el).direction === "rtl" || el.closest("[dir=rtl]")
    ? "rtl"
    : "ltr";
}

// ── Mark clamping ────────────────────────────────────────────────────

function clampAroundMark(s, max) {
  const i = s.indexOf(MARK_L);
  if (i < 0) return s.slice(0, max);
  const half = Math.floor(max / 2);
  return s.slice(Math.max(0, i - half), i + half);
}

// ── Legacy fallback (original algorithm) ────────────────────────────

function extractContextLegacy(range, text) {
  let node = range.startContainer;
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && !BLOCK.has(el.tagName)) el = el.parentElement;
  el = el || document.body;

  let base = (el.textContent || "").replace(/\s+/g, " ").trim();
  let marked = base.includes(text)
    ? base.replace(text, MARK_L + text + MARK_R)
    : `${MARK_L}${text}${MARK_R} … ${base}`;

  let cur = el;
  while (marked.length < MIN && cur.parentElement) {
    cur = cur.parentElement;
    const more = (cur.textContent || "").replace(/\s+/g, " ").trim();
    if (more.length > marked.length) {
      marked = more.includes(text)
        ? more.replace(text, MARK_L + text + MARK_R)
        : marked;
    }
    if (cur === document.body) break;
  }

  if (marked.length > MAX) marked = clampAroundMark(marked, MAX);

  return { context: marked, dir: detectDirection(range) };
}
