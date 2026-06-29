# TafsirLingo — Development Plan (Plan Set)

> One-line positioning: A macOS Safari extension. Select text on any webpage and ask your own AI (OpenAI-compatible interface) to **explain the meaning of the selected text in context**, designed specifically for language learning scenarios (author's primary use case: reading Arabic news from Al Jazeera). The UI follows Apple's **Liquid Glass** design language.

This document set is the complete construction blueprint for **subsequent AI developers**. Goal: with this documentation in hand, no further questions about product decisions should be needed — you can build the entire product from scratch, get it working, and submit it to the App Store.

---

## How to Use This Document Set

Read in order. Each document can be worked on independently, but earlier documents define the contracts that later documents depend on.

| Document | Content | For |
|------|------|--------|
| `00-OVERVIEW.md` | Product definition, scope, locked key decisions, roadmap, glossary | Everyone, read first |
| `01-ARCHITECTURE.md` | Component breakdown, data flow, Native Messaging, Keychain, AI request contract | Architecture / backend logic |
| `02-LIQUID-GLASS-DESIGN.md` | **Liquid Glass ≠ Glassmorphism** — hard distinction; native SwiftUI recipe + web CSS recipe; design tokens | Design / frontend, **most important** |
| `03-UI-UX-SPEC.md` | Per-screen, per-state, per-interaction, animation, copy specs | Design / frontend |
| `04-IMPLEMENTATION-PLAN.md` | Phased, per-file, with copy-pasteable code construction steps | Main development, follow along |
| `05-APPSTORE-RELEASE.md` | Signing, entitlements, Review Notes, excluding mainland China from App Store | Release |

---

## Locked Key Decisions (Do Not Change Unless the Product Owner Explicitly Reverses Them)

These decisions were confirmed by the product owner (Ken) during the planning phase. They are the foundation of this entire document set:

1. **Minimum OS: macOS 26 Tahoe only.** → Native settings UI uses Apple's true Liquid Glass system APIs (`glassEffect` / `GlassEffectContainer`) directly, **no fallback path**.
2. **AI protocol: OpenAI-compatible `/v1/chat/completions` (streaming).** User provides base URL + API key + model name. Covers OpenAI / DeepSeek / Moonshot / local Ollama / LM Studio / various proxy services.
3. **Execution scope: `<all_urls>` — all websites.** Works on any webpage upon text selection.
4. **Key storage: macOS Keychain.** Written by the native app, read by the extension via Native Messaging. **Keys never touch extension storage.**
5. **Pricing: Free.** No IAP, no subscription, no backend account system.
6. **Distribution: All regions except mainland China.**

---

## Product Name & Naming

- Product name: **TafsirLingo** (Tafsir = Arabic "exegesis/interpretation", aligning with the core function and the Arabic primary use case; Lingo = language).
- Bundle prefix: `top.bayanlistening.tafsirlingo` (placeholder; at release, replace with the actual Team ID, see `05`).
- Repository status: `/Users/ken/Coding/TafsirLingo/` is currently in Apple's **Safari Web Extension App template raw state** (host app is AppKit + WKWebView, extension is a hello-world echo, only `en` locale, content script matches `example.com`). The first step of construction is transforming it — see `04` for details.

---

## Design North Star: Liquid Glass, Not Glassmorphism

This is a point the product owner emphasized repeatedly, and multiple AI agents (including Claude) have messed up. **Document `02` explains this in detail — read it before construction.**

One-sentence criterion:

- **Glassmorphism / frosted glass** = blurring the background (`backdrop-filter: blur()`). ❌ This is the version that gets messed up.
- **Liquid Glass** = the background **refracts, bends, and flows** like looking through a water droplet, with **specular highlights** at the edges, color adapts to the background, and it is barely **blurred** — clear, transparent, flowing. ✅ This is what we want.

At acceptance: if you see "the background is a blurry mess", it's wrong. If you see "the background is bent through it, with light traveling along the edges", it's correct.