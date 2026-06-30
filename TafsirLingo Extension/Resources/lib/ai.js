// lib/ai.js — URL normalization, prompt templates, error mapping.
// Spec: docs/01-ARCHITECTURE.md §5.

export function normalizeBaseURL(input, append = "/chat/completions") {
  if (!input || typeof input !== "string") {
    throw new Error("baseURL is empty");
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch (_) {
    throw new Error("baseURL is not a valid URL");
  }
  if (url.protocol !== "https:" && !isLoopbackHost(url.hostname)) {
    throw new Error("baseURL must use https (or http for localhost)");
  }

  // Strip trailing slash on the path.
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith(append)) {
    // already a full endpoint URL — nothing to do
  } else if (path === "" || path === "/") {
    // bare origin — add standard /v1 prefix
    path = "/v1";
  } else if (/(^|\/)v\d+/i.test(path)) {
    // path already contains a version segment somewhere (e.g. /v1, /v1beta/openai, /api/paas/v4)
    // just append the endpoint without adding another /v1
  } else {
    // generic path without version info — add /v1
    path = path + "/v1";
  }
  url.pathname = path.replace(/\/+$/, "") + append;
  return url.toString();
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const LANG_NAME = {
  en: "English",
  zh: "Simplified Chinese (简体中文)",
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh-Hans": "Simplified Chinese (简体中文)",
  "zh-Hant": "Traditional Chinese (繁體中文)",
  ar: "Arabic (العربية)",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  ru: "Russian (Русский)",
  pt: "Portuguese (Português)",
  it: "Italian (Italiano)",
  tr: "Turkish (Türkçe)",
  vi: "Vietnamese (Tiếng Việt)",
  th: "Thai (ภาษาไทย)",
  id: "Indonesian (Bahasa Indonesia)",
};

function resolveLang(raw) {
  return LANG_NAME[(raw || "English").trim().toLowerCase()] || raw;
}

/**
 * System prompt — instructs the model to ONLY explain the selected text,
 * using the page content purely as reference background.
 */
export function systemPrompt(targetLang) {
  const lang = resolveLang(targetLang);
  return [
    "You are a friendly assistant helping a user understand selected text on a webpage.",
    "",
    "Your job is to explain the SELECTED TEXT only. The page content provided is just",
    "background to help you give a contextually accurate explanation — do NOT summarize",
    "or explain the page itself. Focus solely on what the selected text means.",
    "",
    `Respond in ${lang}.`,
    "",
    "Explain naturally as if helping a friend, using examples and analogies when helpful.",
  ].join("\n");
}

/**
 * User prompt — physically separates the selected text (anchoring the model's
 * attention) from the page context (background reference only).
 *
 * @param {string} text   - The exact text the user selected.
 * @param {string} context- Cleaned page content with 【【】】 marking the selection.
 * @param {object} [meta] - Optional page metadata: { title, url, description }.
 */
export function userPrompt(text, context, meta = {}) {
  const parts = [
    "── Selected text to explain ──",
    text,
    "",
    "── Page content for reference (【【】】 marks the selection below) ──",
  ];
  if (meta.title) parts.push(`Page: ${meta.title}`);
  if (meta.url)    parts.push(`URL: ${meta.url}`);
  parts.push("", context);
  return parts.join("\n");
}

export function mapHttpStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notfound";
  if (status === 429) return "ratelimit";
  if (status >= 500) return "server";
  if (status >= 400) return "http";
  return "http";
}

export function extractErrorMessage(body) {
  if (!body) return "";
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.message;
    if (typeof m === "string" && m.trim()) return m.trim();
  } catch (_) { /* not JSON */ }
  return body.slice(0, 240);
}