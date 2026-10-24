import { useInsertionEffect } from "react";

import { HUD_FONT_STACK } from "./hudTokens";

const ms = (speed: "fast" | "base" | "slow", fallback: number) =>
  `calc(var(--jg-motion-${speed}, ${fallback}ms) * var(--jg-motion-scale, 1))`;
const FAST = ms("fast", 120);
const BASE = ms("base", 180);
const SLOW = ms("slow", 320);
const EASE = "var(--jg-ease, cubic-bezier(0.2, 0, 0, 1))";
const EASE_OUT = "var(--jg-ease-out, cubic-bezier(0.16, 1, 0.3, 1))";
const SPRING = "var(--jg-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1))";
const HIGHLIGHT = "var(--jg-highlight, inset 0 1px 0 rgba(255,255,255,0.08))";
const RAISED = "var(--jg-elevation-raised, 0 1px 2px rgba(0,0,0,0.45), 0 4px 12px -2px rgba(0,0,0,0.4))";
const OVERLAY = "var(--jg-elevation-overlay, 0 2px 4px rgba(0,0,0,0.4), 0 10px 24px -4px rgba(0,0,0,0.5))";
const MODAL = "var(--jg-elevation-modal, 0 4px 8px rgba(0,0,0,0.35), 0 24px 56px -12px rgba(0,0,0,0.7))";
const FOCUS = "var(--jg-focus-ring, 0 0 0 2px #0a0c10, 0 0 0 4px var(--jg-accent, #38bdf8))";
const ENABLED = ':not(:disabled, [aria-disabled="true"])';
const KILL_MOTION =
  "animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; transition-delay: 0ms !important;";

/**
 * The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate
 * with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the
 * quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion
 * handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`).
 * Every rule sits in the `components.jgengine` cascade layer, so unlayered game CSS, a game's own
 * `components` rules and Tailwind utilities win without `!important`. It first declares
 * `theme, base, components, utilities` so Tailwind v4's preflight stays below engine controls even
 * when the engine sheet loads first. The shell injects it; games that mount outside the shell import
 * `@jgengine/react/styles.css`, which holds the same text.
 */
export const ENGINE_STYLESHEET = `/* @jgengine/react engine stylesheet */
@layer theme, base, components, utilities;
@layer components.jgengine {
:root { --jg-motion-scale: 1; }
@media (prefers-reduced-motion: reduce) { :root { --jg-motion-scale: 0; } }
[data-reduced-motion="true"] { --jg-motion-scale: 0; }
@media (prefers-reduced-motion: reduce) {
  [data-jg-hud] *, [data-jg-hud] *::before, [data-jg-hud] *::after { ${KILL_MOTION} }
}
[data-reduced-motion="true"] *, [data-reduced-motion="true"] *::before, [data-reduced-motion="true"] *::after { ${KILL_MOTION} }

@keyframes jg-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes jg-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes jg-panel-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes jg-panel-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(4px) scale(0.98); } }
@keyframes jg-slide-up { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes jg-slide-down { from { transform: translateY(-18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes jg-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes jg-flash { 0% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes jg-sheen { from { background-position: -160px 0; } to { background-position: 260px 0; } }
@keyframes jg-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes jg-ready-glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.45); } }
@keyframes jg-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }
@keyframes jg-float-up { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-46px); opacity: 0; } }
@keyframes jg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes jg-delta-up { 0% { color: var(--jg-success, #3fa34d); text-shadow: 0 0 10px var(--jg-success, #3fa34d); scale: 1.12; } 100% { scale: 1; } }
@keyframes jg-delta-down { 0% { color: var(--jg-danger, #e5484d); text-shadow: 0 0 10px var(--jg-danger, #e5484d); scale: 0.94; } 100% { scale: 1; } }
@keyframes jg-menu-drift { from { transform: scale(1.06) translate3d(-1.4%, -1%, 0); } to { transform: scale(1.12) translate3d(1.6%, 1.2%, 0); } }
@keyframes jg-menu-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes jg-menu-pane-in { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
[data-jg-game-menu] * { scrollbar-width: none; }
[data-jg-game-menu] *::-webkit-scrollbar { width: 0; height: 0; }

[data-jg-hud] { font-family: var(--jg-font-body, ${HUD_FONT_STACK}); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
:where([data-jg-hud]) :where(button, [role="button"], a[href], summary, [data-jg-interactive]):focus-visible { outline: 2px solid var(--jg-accent, #38bdf8); outline-offset: 2px; }
:where([data-jg-hud]) :where(button, [role="button"]) { transition: scale ${FAST} ${EASE}, filter ${FAST} ${EASE}; }
@media (hover: hover) {
  :where([data-jg-hud]) :where(button, [role="button"]):where(${ENABLED}):hover { filter: brightness(1.08); }
}
:where([data-jg-hud]) :where(button, [role="button"]):where(${ENABLED}):active { scale: var(--jg-press-scale, 0.97); }

[data-jg-button] { appearance: none; box-sizing: border-box; position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: var(--jg-space-sm, 8px); min-height: 36px; padding: var(--jg-space-xs, 4px) var(--jg-space-lg, 16px); margin: 0; font-family: var(--jg-font-body, ${HUD_FONT_STACK}); font-size: var(--jg-type-md, 14px); font-weight: 600; line-height: 1.2; letter-spacing: 0.01em; text-align: center; white-space: normal; color: var(--jg-text, #f5f7fa); background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)), var(--jg-slot-bg, rgba(12,15,21,0.78)); border: var(--jg-slot-border, 1px solid rgba(255,255,255,0.13)); border-radius: var(--jg-slot-radius, 8px); box-shadow: ${HIGHLIGHT}, ${RAISED}; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; transition: translate ${FAST} ${EASE}, scale ${FAST} ${SPRING}, box-shadow ${FAST} ${EASE}, border-color ${FAST} ${EASE}, background-color ${FAST} ${EASE}; }
[data-jg-button]::after { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: var(--jg-hover-overlay, rgba(255,255,255,0.07)); opacity: 0; pointer-events: none; transition: opacity ${FAST} ${EASE}; }
@media (hover: hover) {
  [data-jg-button]${ENABLED}:hover { translate: 0 var(--jg-hover-lift, -1px); box-shadow: ${HIGHLIGHT}, ${OVERLAY}; }
  [data-jg-button]${ENABLED}:hover::after { opacity: 1; }
}
[data-jg-button]${ENABLED}:active { translate: 0 0; scale: var(--jg-press-scale, 0.97); box-shadow: ${HIGHLIGHT}, ${RAISED}; transition-duration: calc(60ms * var(--jg-motion-scale, 1)); }
[data-jg-button]${ENABLED}:active::after { opacity: 1; background: var(--jg-press-overlay, rgba(0,0,0,0.14)); }
[data-jg-button]:focus-visible { outline: none; box-shadow: ${FOCUS}, ${RAISED}; }
[data-jg-button]:is(:disabled, [aria-disabled="true"]) { opacity: var(--jg-disabled-opacity, 0.45); cursor: not-allowed; box-shadow: none; }
[data-jg-button][data-variant="primary"] { color: var(--jg-surface-deep, #0a0c10); background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%), var(--jg-accent, #38bdf8); border: 1px solid rgba(255,255,255,0.28); }
[data-jg-button][data-variant="danger"] { color: #fff; background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 60%), var(--jg-danger, #e5484d); border: 1px solid rgba(255,255,255,0.22); }
[data-jg-button][data-variant="ghost"] { background: transparent; border-color: transparent; box-shadow: none; }
[data-jg-button][data-variant="ghost"]${ENABLED}:hover { box-shadow: none; }
[data-jg-button][data-size="sm"] { min-height: 28px; padding-inline: var(--jg-space-md, 12px); font-size: var(--jg-type-sm, 13px); }
[data-jg-button][data-size="lg"] { min-height: 44px; padding-inline: var(--jg-space-xl, 24px); font-size: var(--jg-type-lg, 16px); }
[data-jg-button][data-size="icon"] { min-height: 0; width: 28px; height: 28px; padding: 0; font-size: var(--jg-type-sm, 13px); }
[data-jg-button][data-block] { display: flex; width: 100%; }

[data-jg-panel] { box-sizing: border-box; padding: var(--jg-panel-padding, 12px); color: var(--jg-text, #f5f7fa); font-family: var(--jg-font-body, ${HUD_FONT_STACK}); background: var(--jg-frame-bg, rgba(12,15,21,0.9)); border: var(--jg-frame-border, 1px solid rgba(255,255,255,0.13)); border-radius: var(--jg-frame-radius, 10px); box-shadow: var(--jg-frame-glow, ${HIGHLIGHT}, ${RAISED}); }
[data-jg-panel][data-elevation="overlay"] { box-shadow: var(--jg-frame-glow, ${HIGHLIGHT}), ${OVERLAY}; }
[data-jg-panel][data-elevation="modal"] { box-shadow: var(--jg-frame-glow, ${HIGHLIGHT}), ${MODAL}; }
[data-jg-panel][data-state="open"] { animation: jg-panel-in ${BASE} ${EASE_OUT} both; }
[data-jg-panel][data-state="closed"] { animation: jg-panel-out ${FAST} ${EASE} both; pointer-events: none; }
[data-jg-window][data-state="open"] { animation: jg-panel-in ${BASE} ${EASE_OUT} both; }
[data-jg-window][data-state="closed"] { animation: jg-panel-out ${FAST} ${EASE} both; pointer-events: none !important; }
[data-jg-panel-header] { display: flex; align-items: center; justify-content: space-between; gap: var(--jg-space-sm, 8px); font-size: var(--jg-type-xs, 12px); font-weight: 650; letter-spacing: var(--jg-tracking-label, 0.08em); text-transform: uppercase; color: var(--jg-text-dim, #94a3b8); }

[data-modal-backdrop] { animation: jg-fade-in ${BASE} ${EASE_OUT} both; -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
[data-modal-host] > [role="dialog"] { animation: jg-panel-in ${BASE} ${EASE_OUT} both; }
[data-toast] { animation: jg-slide-up ${BASE} ${EASE_OUT} both; }
[data-levelup] { animation: jg-pop ${SLOW} ${SPRING} both; }
[data-jg-delta="up"] { display: inline-block; animation: jg-delta-up ${SLOW} ${EASE_OUT}; }
[data-jg-delta="down"] { display: inline-block; animation: jg-delta-down ${SLOW} ${EASE_OUT}; }
[data-action-id] { transition: translate ${FAST} ${EASE}, scale ${FAST} ${SPRING}, border-color ${FAST} ${EASE}, box-shadow ${FAST} ${EASE}; }
@media (hover: hover) { [data-action-id][data-enabled]:hover { translate: 0 var(--jg-hover-lift, -1px); } }
[data-action-id][data-enabled]:active { translate: 0 0; scale: var(--jg-press-scale, 0.97); }
[data-action-id]:focus-visible { outline: none; box-shadow: ${FOCUS}; }
}
`;

const STYLE_ID = "jg-engine-styles";

/** Injects {@link ENGINE_STYLESHEET} into `doc` once. Safe to call repeatedly and during SSR (no-op). */
export function ensureEngineStyles(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (doc === undefined || doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-jg-engine-styles", "");
  style.textContent = ENGINE_STYLESHEET;
  doc.head.prepend(style);
}

/**
 * Ensures the engine stylesheet is in the document before the calling component paints. Engine
 * primitives call it, so they animate and show interaction states even outside the shell.
 *
 * @capability engine-styles inject the engine stylesheet (jg-* keyframes, interaction states, reduced motion) once
 */
export function useEngineStyles(): void {
  useInsertionEffect(() => {
    ensureEngineStyles();
  }, []);
}
