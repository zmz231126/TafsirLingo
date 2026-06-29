// lib/markdown.js — Tiny, streaming-friendly Markdown subset renderer.
// Scope is intentionally narrow: only what an LLM explanation card actually
// emits (headings, lists, blockquotes, code blocks, inline bold/italic/code,
// links, horizontal rules, hard line breaks).
//
// Hard rules:
//   - Never calls innerHTML. Every output node is built via document.createElement
//     with textContent. User input can never introduce new HTML elements.
//   - Per-call stateless. The stream accumulator drives a re-render of the
//     accumulated text on every chunk; cost is fine for the payload sizes
//     this card receives (a few KB at most).
//   - Unterminated constructs (e.g. ``` without closing fence) render as plain
//     text. The next chunk will fix it on the next re-render.

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^(\d+)\.\s+(.*)$/;
const HR_RE = /^---+\s*$/;
const BLOCK_BOUNDARY_RE = /^(#{1,6}\s|```|>\s?|[-*+]\s|\d+\.\s|---+)/;

// Append parsed inline markup to `parent`. Cursor walks left-to-right and
// emits either a text node (for a plain run) or a DOM node (for a matched
// construct) before advancing past it.
function inlineToNodes(parent, text) {
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    // Inline code: `code`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        const code = document.createElement("code");
        code.className = "md-inline-code";
        code.textContent = text.slice(i + 1, end);
        parent.appendChild(code);
        i = end + 1;
        continue;
      }
    }

    // Link: [label](url)
    if (ch === "[") {
      const closeLabel = text.indexOf("]", i + 1);
      if (closeLabel > i + 1 && text[closeLabel + 1] === "(") {
        const closeUrl = text.indexOf(")", closeLabel + 2);
        if (closeUrl > closeLabel + 2) {
          const label = text.slice(i + 1, closeLabel);
          const url = text.slice(closeLabel + 2, closeUrl).trim();
          if (/^(https?:|mailto:|\/)/i.test(url)) {
            const a = document.createElement("a");
            a.className = "md-link";
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            inlineToNodes(a, label);
            parent.appendChild(a);
            i = closeUrl + 1;
            continue;
          }
        }
      }
    }

    // Bold: **text**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        const strong = document.createElement("strong");
        inlineToNodes(strong, text.slice(i + 2, end));
        parent.appendChild(strong);
        i = end + 2;
        continue;
      }
    }

    // Italic: *text* (single asterisk, not adjacent to another *)
    if (ch === "*" && text[i + 1] !== "*" && text[i - 1] !== "*") {
      const end = findUnescaped(text, "*", i + 1);
      if (end > i + 1) {
        const em = document.createElement("em");
        inlineToNodes(em, text.slice(i + 1, end));
        parent.appendChild(em);
        i = end + 1;
        continue;
      }
    }

    // Hard line break: two trailing spaces before \n
    if (ch === " " && text[i + 1] === " " && text[i + 2] === "\n") {
      parent.appendChild(document.createElement("br"));
      i += 3;
      continue;
    }

    // Plain run: scan to the next markup char and emit as one text node.
    let j = i + 1;
    while (j < n) {
      const c = text[j];
      if (c === "`" || c === "[" || c === "*") break;
      if (c === " " && text[j + 1] === " " && text[j + 2] === "\n") break;
      j += 1;
    }
    parent.appendChild(document.createTextNode(text.slice(i, j)));
    i = j;
  }
}

function findUnescaped(text, ch, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === ch && text[i - 1] !== "\\") return i;
  }
  return -1;
}

// Render the full accumulated markdown into `parent`, replacing its existing
// children. Safe to call repeatedly during streaming.
export function renderMarkdown(parent, text) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  if (!text) return;

  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ``` ... ```
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const pre = document.createElement("pre");
      pre.className = "md-code-block";
      const inner = document.createElement("code");
      if (lang) inner.className = `md-code-lang md-lang-${cssEscape(lang)}`;
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      inner.textContent = buf.join("\n");
      pre.appendChild(inner);
      parent.appendChild(pre);
      if (i < lines.length) i += 1; // skip closing fence (if present)
      continue;
    }

    // Heading
    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length;
      const el = document.createElement(`h${level}`);
      el.className = `md-h md-h${level}`;
      inlineToNodes(el, h[2].trim());
      parent.appendChild(el);
      i += 1;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      parent.appendChild(document.createElement("hr"));
      i += 1;
      continue;
    }

    // Blockquote: collect consecutive `> ...` lines.
    if (/^>\s?/.test(line)) {
      const quote = document.createElement("blockquote");
      quote.className = "md-quote";
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      inlineToNodes(quote, buf.join("\n"));
      parent.appendChild(quote);
      continue;
    }

    // Unordered list: collect consecutive `-`/`*`/`+` items.
    const ul = line.match(UL_RE);
    if (ul) {
      const list = document.createElement("ul");
      list.className = "md-ul";
      while (i < lines.length) {
        const m = lines[i].match(UL_RE);
        if (!m) break;
        const li = document.createElement("li");
        inlineToNodes(li, m[1]);
        list.appendChild(li);
        i += 1;
      }
      parent.appendChild(list);
      continue;
    }

    // Ordered list.
    const ol = line.match(OL_RE);
    if (ol) {
      const list = document.createElement("ol");
      list.className = "md-ol";
      while (i < lines.length) {
        const m = lines[i].match(OL_RE);
        if (!m) break;
        const li = document.createElement("li");
        inlineToNodes(li, m[2]);
        list.appendChild(li);
        i += 1;
      }
      parent.appendChild(list);
      continue;
    }

    // Blank line: paragraph separator.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Plain paragraph: collect until blank line / block boundary.
    const para = document.createElement("p");
    para.className = "md-p";
    const buf = [line];
    i += 1;
    while (i < lines.length
           && lines[i].trim() !== ""
           && !BLOCK_BOUNDARY_RE.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    inlineToNodes(para, buf.join("\n"));
    parent.appendChild(para);
  }
}

// Build an empty body element ready for streaming markdown rendering.
export function newMarkdownBody() {
  const el = document.createElement("div");
  el.className = "lg-card__md";
  return el;
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
}