# 02 · Liquid Glass Design Specification

> **This is the most important document in the set.** The product owner has seen multiple AI agents (including Claude) mess up the same point: asked for Liquid Glass, got Glassmorphism. Must read this document and understand the criterion in §1 before construction. Use the checklist in §6 for acceptance.

---

## 1. Liquid Glass ≠ Glassmorphism (Must Understand First)

| | Glassmorphism / Frosted Glass ❌ | Liquid Glass ✅ |
|---|---|---|
| Core action | **Blur** the background | **Refract and bend** the background (like looking through a water droplet / convex lens) |
| CSS signature | `backdrop-filter: blur(20px)` all at once | `feDisplacementMap` displacement + specular highlight, blur minimal or none |
| Visual feel | Background becomes a blurry white mess | Background is clearly visible but **bent**, edges have **traveling highlights** |
| Edges | A plain semi-transparent stroke | **Specular rim**: top bright, bottom secondary, like light hitting a glass prism |
| Color | Fixed semi-transparent white | **Color-adaptive** to background (content-aware tint) |
| Dynamic | Static | **Reacts in real time** to scroll/motion/interaction; highlights move with it |
| One-liner | "A frosted plastic sheet" | "A drop of water that refracts light" |

**Apple's official words (WWDC25 / Newsroom, verified)**: Liquid Glass "**dynamically bends, shapes, and concentrates light in real time**", "**reflects and refracts its surroundings**", "**dynamically reacts to movement with specular highlights**". Keywords are **bend / refract / specular highlight**, not blur.

**Criterion (ask yourself at acceptance)**:
- If you see the background as "blurred" → it's wrong, it's Glassmorphism.
- If you see the background as "bent through a lens, with light traveling along the edges" → it's right, it's Liquid Glass.

---

## 2. Two Surfaces, Two Implementations (Critical Architecture Fact)

This product has two surfaces that need Liquid Glass, **their implementation is completely different** due to browser limitations:

| Surface | Where | Can use true Liquid Glass? | Implementation |
|------|------|------|------|
| **Settings UI** | Native SwiftUI host app (macOS 26) | ✅ Yes, system native | Use `glassEffect` / `GlassEffectContainer` directly, see §3 |
| **Web explanation card + bubble** | Safari content script (webpage DOM) | ❌ No, WebKit limitation | CSS high-fidelity **approximation**, see §4 |

### Why can't the web achieve "true" Liquid Glass? (Verified hard constraints)
True refraction depends on `backdrop-filter: url(#svgFilter)` (SVG `feDisplacementMap` as a backdrop filter). **This feature is currently only implemented in Chromium; Safari / WebKit do not support it** (consistent confirmation from multiple 2025–2026 implementation articles). Our extension runs in Safari, so the web card **cannot get true refraction**.

Therefore the strategy for the web card is: **use what Safari supports to maximize the "feel" of Liquid Glass** — strong specular rim + top sheen + minimal blur + adaptive tint + highlights that move on interaction. **Focus on "highlights and refractive edges", not "blur"**, which is exactly what separates it from Glassmorphism.

> One-liner for subsequent AI: **The web card must NOT fake glass by piling up `blur`.** Blur max 2–4px, the main effect comes from specular rim + sheen + edge highlight line + tint.

---

## 3. Settings UI: Native SwiftUI True Liquid Glass

### 3.1 Verified APIs (macOS 26 / Xcode 26 / Swift 6, verified)

```swift
// Basic: wrap any custom view with Liquid Glass
SomeView()
    .glassEffect()                       // default .regular
    .glassEffect(.regular)
    .glassEffect(.clear)                 // more transparent, more "watery" variant
    .glassEffect(.regular, in: .rect(cornerRadius: 20))  // specify shape
    .glassEffect(.regular.tint(.accentColor).interactive()) // tint + interaction response

// Buttons: use built-in glass button styles, don't hand-craft
Button("Test Connection") { }.buttonStyle(.glass)
Button("Save") { }.buttonStyle(.glassProminent)   // high-emphasis filled glass

// Multiple glass elements: must wrap in a container ("glass cannot sample other glass")
GlassEffectContainer(spacing: 20) {
    HStack(spacing: 16) {
        ChipA().glassEffect()
        ChipB().glassEffect()
    }
}

// Morph/fusion animation: same container + shared namespace glassEffectID
@Namespace private var ns
GlassEffectContainer(spacing: 24) {
    if expanded {
        Panel().glassEffect().glassEffectID("panel", in: ns)
            .glassEffectTransition(.matchedGeometry)
    }
}
// When toggling, pair with withAnimation(.bouncy) { expanded.toggle() }
```

### 3.2 Official Best Practices (Must Follow, verified)
1. When multiple glass views coexist, **must** use `GlassEffectContainer` (glass cannot sample glass, without wrapping it gets blurry).
2. `.glassEffect()` goes **after layout and appearance modifiers** (wrap it last).
3. Container `spacing` and internal layout spacing should align for natural morphing.
4. `.interactive()` **only** on truly tappable/focusable elements.
5. Buttons **prefer** `.buttonStyle(.glass)` / `.glassProminent`, don't hand-craft.
6. **Restraint**: reserve Liquid Glass for key functional elements (navigation, primary actions, card containers), don't铺 the full screen. Background content is the protagonist.
7. Even though the minimum OS is 26, still **recommend** wrapping with `if #available(macOS 26, *)` and provide a `.background(.regularMaterial)` fallback branch (to guard against early 26.0 minor version differences / preview rendering). This is engineering robustness, does not violate D1.
8. Test `Reduce Transparency` and `Reduce Motion` (see §5).

### 3.3 Settings UI Structure Recommendation
- Full window background: a soft, color-graded wallpaper or mesh gradient (**give the glass something to refract** — without background content, Liquid Glass has nothing to show).
- Main config area: a glass card wrapping the form inside a `GlassEffectContainer`.
- Primary action buttons (Save / Test Connection): use `.glassProminent`.

> ⚠️ Anti-pattern: set the full window background to pure gray then wrap with glassEffect → Liquid Glass is invisible. **Glass needs rich background content to show refraction and tint.**

---

## 4. Web Card & Bubble: CSS High-Fidelity Approximation

Goal: under Safari constraints, make a card that **makes people immediately think Liquid Glass, not Glassmorphism**. All within Shadow DOM to prevent host page pollution.

### 4.1 Design Tokens (CSS custom properties, centrally managed)
```css
:host {
  /* Shape */
  --lg-radius: 22px;
  --lg-pad: 14px 16px;

  /* Minimal blur — this is the line between Liquid Glass and Glassmorphism, never exceeds 4px */
  --lg-blur: 3px;
  --lg-saturate: 180%;
  --lg-brightness: 1.08;

  /* Adaptive base color: low alpha, let the background show through and be "refracted" */
  --lg-tint: rgba(255, 255, 255, 0.10);
  --lg-tint-dark: rgba(28, 28, 30, 0.18);

  /* Specular rim (the soul of Liquid Glass) — top strong, bottom secondary, sides weak */
  --lg-rim-top: rgba(255, 255, 255, 0.65);
  --lg-rim-bottom: rgba(255, 255, 255, 0.30);
  --lg-rim-side: rgba(255, 255, 255, 0.18);

  /* Top-diagonal sheen (luster) */
  --lg-sheen: rgba(255, 255, 255, 0.45);

  /* Shadow: let the card float above the page */
  --lg-shadow: 0 10px 40px rgba(0, 0, 0, 0.22);
}
```

### 4.2 Card Body (Core Recipe)
```css
.lg-card {
  position: relative;
  border-radius: var(--lg-radius);
  padding: var(--lg-pad);
  color: #1c1c1e;

  /* Note: blur is minimal, emphasis on saturate + brightness to make the background "brighter and richer" not blurry */
  background: var(--lg-tint);
  -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(var(--lg-saturate)) brightness(var(--lg-brightness));
  backdrop-filter: blur(var(--lg-blur)) saturate(var(--lg-saturate)) brightness(var(--lg-brightness));

  /* Specular rim = multiple inset shadows, simulating light hitting glass edges */
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow:
    var(--lg-shadow),
    inset 0 1px 1px var(--lg-rim-top),     /* top edge brightest */
    inset 0 -1px 1px var(--lg-rim-bottom), /* bottom edge secondary */
    inset 1px 0 1px var(--lg-rim-side),
    inset -1px 0 1px var(--lg-rim-side);
}

/* Top-diagonal sheen: a highlight sweeping across the surface, making it "look like glass" not "like frosted plastic" */
.lg-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg,
    var(--lg-sheen) 0%,
    rgba(255,255,255,0.08) 28%,
    transparent 58%);
  mix-blend-mode: screen;
  z-index: 1;
}

/* Content sits above the sheen */
.lg-card > .lg-content { position: relative; z-index: 2; }
```

### 4.3 Make It "Flow / Refract" (Animation is the Key Differentiator)
Glassmorphism is dead; Liquid Glass is alive. Give the card a **sheen sweep** on appearance, and let the sheen slightly offset with pointer/selection position:

```css
@keyframes lg-sheen-sweep {
  from { background-position: -60% 0; }
  to   { background-position: 160% 0; }
}
.lg-card::before {
  background-size: 220% 100%;
  animation: lg-sheen-sweep 1.1s cubic-bezier(0.22, 1, 0.36, 1) 1;
}
```
- Card **entry**: `scale(0.96) → 1` + `opacity 0 → 1`, easing `cubic-bezier(0.22,1,0.36,1)`, ~260ms, paired with the sheen sweep above — this "water droplet forming" feel is the essence of Liquid Glass.
- Optional enhancement (only when `@supports` matches): see §4.4.

### 4.4 Progressive Enhancement for True Refraction (Only on Chromium, auto-degrade on Safari)
Even though the main battlefield is Safari, write this section — if it runs in a Chromium environment in the future (or if Apple opens it up later), it auto-upgrades to true refraction; Safari stays at the §4.2 approximation:

```html
<!-- Inject once, hidden SVG filter -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="lg-refract" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012"
                  numOctaves="2" seed="7" result="noise"/>
    <feGaussianBlur in="noise" stdDeviation="1.5" result="soft"/>
    <feDisplacementMap in="SourceGraphic" in2="soft" scale="42"
                       xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
```
```css
@supports (backdrop-filter: url(#lg-refract)) {
  .lg-card {
    /* Chromium: truly "bend" the background, blur further reduced to 1px */
    -webkit-backdrop-filter: blur(1px) url(#lg-refract);
    backdrop-filter: blur(1px) url(#lg-refract);
  }
}
```
> This is "same styles, browsers with more capability auto-approach true Liquid Glass". Safari goes through the §4.2 approximation, no errors, no degradation to Glassmorphism.

### 4.5 Trigger Bubble (Small Glass Button)
- Rounded capsule, ~28–32px tall.
- Same rim + sheen from §4.2, but more compact; on hover, the sheen angle slightly rotates with the pointer, giving a "glass reflecting light" alive feel.
- Icon: a clean "explain / bulb / translate" SF-Symbols style stroke icon (inline SVG).

### 4.6 Dark Mode
- `@media (prefers-color-scheme: dark)`: `--lg-tint` switches to `--lg-tint-dark`, text color goes light, rim highlights slightly reduce alpha (too bright on dark background is jarring), sheen drops to 0.3.

---

## 5. Accessibility & Degradation (Mandatory)

| System Setting | Behavior |
|---------|------|
| `Reduce Motion` (CSS: `prefers-reduced-motion: reduce`) | Disable sheen sweep / entry scale, keep only 120ms fade-in. On SwiftUI side, use `.animation(nil)` or check `accessibilityReduceMotion`. |
| `Reduce Transparency` (`prefers-reduced-transparency: reduce`) | Card background goes near-opaque (`rgba(250,250,250,0.96)`), disable backdrop-filter, keep rim stroke. On SwiftUI side, the system auto-fallback to opaque materials. |
| Insufficient contrast | Card text-to-background contrast ≥ 4.5:1; if needed, add a faint solid-color underlay on the text layer to ensure readability. |
| Keyboard reachability | Bubble and card operations are Tab-focusable with a visible focus ring. |

> Full WCAG compliance requires assistive technology testing and expert review; this spec provides the engineering baseline.

---

## 6. Acceptance Checklist

Check item-by-item after completion. **If any item fails, it has not reached Liquid Glass.**

Settings UI (native):
- [ ] Window has a rich colored background; the glass card shows it "refracting/tinting" the background, not sitting on a solid color.
- [ ] Multiple glass elements are wrapped in `GlassEffectContainer`, edges don't blur into each other.
- [ ] Primary button is `.glassProminent`, secondary button `.glass`.
- [ ] `Reduce Transparency` on → auto-switches to opaque material, still readable.

Web card & bubble:
- [ ] **blur ≤ 4px**. If the background is a blurry mess → fail.
- [ ] Edges have a clear **specular rim** (top bright, bottom secondary).
- [ ] Entry animation has **sheen sweep + water droplet forming**.
- [ ] Background content is **still discernible through the card** (clarity), not milky frosted.
- [ ] Not glaring on dark pages, not gray on light pages.
- [ ] Under `prefers-reduced-motion`, degrades to pure fade-in, no sweep.
- [ ] All within Shadow DOM, host page CSS can't reach it.

Universal anti-patterns (fail on sight):
- [ ] ❌ Only `backdrop-filter: blur(20px)` with no rim/sheen.
- [ ] ❌ Card looks like "a frosted glass sticker" not "a drop of water refracting light".
- [ ] ❌ Static and dead, no light flow whatsoever.