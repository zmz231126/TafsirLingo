// lib/context.js — context extraction around a user selection.
// Algorithm spec: docs/01-ARCHITECTURE.md §3
// 1. Use the full textContent of the containing block-level element as near context.
// 2. If shorter than MIN, walk up to parent blocks / siblings to pad up to ~MIN,
//    clamp to MAX so we never blow up the token budget.
// 3. Wrap the selected text with MARK_L / MARK_R so the model knows which part to explain.
// 4. Determine text direction (rtl / ltr) from computed style or closest [dir=rtl].

const BLOCK = new Set([
  "P", "LI", "BLOCKQUOTE", "TD", "TH", "DIV", "SECTION",
  "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6", "DD", "DT"
]);

const MAX = 1500;
const MIN = 400;
const MARK_L = "【【";
const MARK_R = "】】";

export function extractContext(range, text) {
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

  const dir = (getComputedStyle(el).direction === "rtl" || el.closest("[dir=rtl]"))
    ? "rtl"
    : "ltr";

  return { context: marked, dir };
}

function clampAroundMark(s, max) {
  const i = s.indexOf(MARK_L);
  if (i < 0) return s.slice(0, max);
  const half = Math.floor(max / 2);
  return s.slice(Math.max(0, i - half), i + half);
}