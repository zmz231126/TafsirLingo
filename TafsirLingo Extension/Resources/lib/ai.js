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

  // Strip trailing slash on the path; if it doesn't already end with /v1 (or
  // already ends with /chat/completions), insert /v1 before appending the route.
  let path = url.pathname.replace(/\/+$/, "");
  if (path === append) {
    // already a full endpoint URL
  } else if (/(^|\/)v\d+$/i.test(path)) {
    // path already ends in /vN — keep as is
  } else {
    path = path + "/v1";
  }
  url.pathname = path.replace(/\/+$/, "") + append;
  return url.toString();
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function systemPrompt(targetLang) {
  // Resolve the language code into a name the model understands. Locale codes
  // like "zh", "ar", "en" are ambiguous (zh = Mandarin? Cantonese?); mapping
  // them avoids the model defaulting to English when it cannot tell.
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
  const raw = (targetLang || "English").trim();
  const lang = LANG_NAME[raw.toLowerCase()] || raw;

  return [
    "You are a language learning assistant. The user selects text on a webpage and you explain it in context.",
    `Respond in ${lang}.`,
    "",
    "Rule: Your entire response must be ONLY the explanation. First sentence is the answer. No introductions, no meta-commentary, no analysis of what the user is asking. Act as if the user already knows what they selected — just tell them what it means.",
    "",
    "Correct examples:",
    "  User selected \"ribbon\" → \"A ribbon diagram is a 3D schematic that uses colored ribbons and arrows to show how a protein chain folds.\"",
    "  User selected \"the quick brown fox\" → \"This is a pangram — a sentence containing every letter of the English alphabet, used for typing practice.\"",
    "  User selected \"structure\" → \"Here it refers to the 3D arrangement of atoms in the protein — how the chain folds in space.\"",
    "",
    "Incorrect examples (never output these):",
    "  \"The user is asking about...\"",
    "  \"The user selected...\"",
    "  \"In this context...\"",
    "  \"This means that...\"",
    "  \"Let me explain...\"",
    "",
    "Also forbidden: metadata labels (Part of speech:, Root:, Type:, Synonyms:), any form of list or enumeration, <think> blocks, chain-of-thought.",
  ].join("\n");
}

export function userPrompt(text, context) {
  return [
    "Context (selected part marked with 【【】】):",
    context,
    "",
    `Please explain: ${text} in 【【】】`
  ].join("\n");
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