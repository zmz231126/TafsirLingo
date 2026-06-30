// lib/bubbleCss.js — Liquid Glass recipe for the trigger bubble.
// Mirrors docs/02-LIQUID-GLASS-DESIGN.md §4.5 (compact capsule variant of §4.2).
// Hard constraints: blur ≤ 4px, strong specular rim, top sheen, no glassmorphism pile-up.

export const BUBBLE_CSS = `
:host { all: initial; }
.lg-bubble {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483646;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  font: 600 12px/1 -apple-system, "SF Pro Text", system-ui, sans-serif;
  color: #1c1c1e;
  background: rgba(255, 255, 255, 0.12);
  -webkit-backdrop-filter: blur(3px) saturate(180%) brightness(1.06);
  backdrop-filter: blur(3px) saturate(180%) brightness(1.06);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.18),
    inset 0 1px 1px rgba(255, 255, 255, 0.6),
    inset 0 -1px 1px rgba(255, 255, 255, 0.25);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  opacity: 0;
  transform-origin: 50% 50%;
  /* Base translate driven by --tx/--ty; entry animation slides from
     --entry-ox/--entry-oy into place via @keyframes. */
  transform: translate(var(--tx, 0), var(--ty, 0));
  animation: lg-bubble-in 160ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  transition: transform 120ms ease;
}
.lg-bubble:hover { transform: translate(var(--tx, 0), calc(var(--ty, 0) - 1px)) scale(1.02); }
.lg-bubble:active { transform: translate(var(--tx, 0), var(--ty, 0)) scale(0.98); }
.lg-bubble__label { letter-spacing: 0.01em; }
.lg-bubble svg { color: #0a84ff; }

@keyframes lg-bubble-in {
  from {
    opacity: 0;
    transform: translate(calc(var(--tx, 0) + var(--entry-ox, 0)), calc(var(--ty, 0) + var(--entry-oy, 0)));
  }
  to {
    opacity: 1;
    transform: translate(var(--tx, 0), var(--ty, 0));
  }
}

@media (prefers-color-scheme: dark) {
  .lg-bubble {
    color: #f2f2f7;
    background: rgba(28, 28, 30, 0.28);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.45),
      inset 0 1px 1px rgba(255, 255, 255, 0.18),
      inset 0 -1px 1px rgba(255, 255, 255, 0.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lg-bubble { animation: lg-bubble-fade 120ms ease-out forwards; }
  .lg-bubble:hover { transform: translate(var(--tx, 0), var(--ty, 0)); }
}
@keyframes lg-bubble-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-transparency: reduce) {
  .lg-bubble {
    background: rgba(250, 250, 250, 0.96);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    color: #1c1c1e;
  }
  @media (prefers-color-scheme: dark) {
    .lg-bubble { background: rgba(28, 28, 30, 0.96); color: #f2f2f7; }
  }
}
`;