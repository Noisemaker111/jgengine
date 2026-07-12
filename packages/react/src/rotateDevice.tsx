/**
 * Engine-owned rotate-device screen. A polished, non-dismissible full-viewport
 * gate shown when a game requires an orientation the device isn't in. It owns
 * the visible viewport (visualViewport-sized), respects safe areas, blocks all
 * pointer/touch input to the game beneath, and is themeable through `--jg-*`
 * tokens. Reduced-motion respected. This is game UI, not a website toast.
 */

import type { CSSProperties, ReactNode } from "react";
import type { LayoutOrientation } from "@jgengine/core/ui/orientation";

const STYLE_ID = "jg-rotate-device-style";

const ROTATE_CSS = `
.jg-rotate-root {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--jg-visual-viewport-width, 100vw);
  height: var(--jg-visual-viewport-height, 100dvh);
  min-height: var(--jg-visual-viewport-height, 100vh);
  padding: calc(env(safe-area-inset-top, 0px) + 24px) calc(env(safe-area-inset-right, 0px) + 24px)
    calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 24px);
  color: var(--jg-text, #f4f4f6);
  background:
    radial-gradient(120% 120% at 50% 0%, var(--jg-accent-dim, rgba(120, 130, 160, 0.18)), transparent 60%),
    var(--jg-surface, #0b0d13);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  overflow: hidden;
}
.jg-rotate-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  text-align: center;
  max-width: 22rem;
}
.jg-rotate-phone {
  transform-origin: 50% 50%;
}
.jg-rotate-title {
  margin: 0;
  font: 700 clamp(1.25rem, 5vw, 1.75rem) / 1.15 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.01em;
}
.jg-rotate-desc {
  margin: 0;
  font: 400 clamp(0.9rem, 3.4vw, 1.05rem) / 1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--jg-text-dim, rgba(244, 244, 246, 0.66));
}
@media (prefers-reduced-motion: no-preference) {
  .jg-rotate-phone--to-landscape { animation: jg-rotate-to-landscape 2.6s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
  .jg-rotate-phone--to-portrait { animation: jg-rotate-to-portrait 2.6s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
}
@keyframes jg-rotate-to-landscape {
  0%, 22% { transform: rotate(0deg); }
  55%, 78% { transform: rotate(-90deg); }
  100% { transform: rotate(-90deg); }
}
@keyframes jg-rotate-to-portrait {
  0%, 22% { transform: rotate(-90deg); }
  55%, 78% { transform: rotate(0deg); }
  100% { transform: rotate(0deg); }
}
`;

function ensureStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = ROTATE_CSS;
  document.head.appendChild(el);
}

function PhoneGlyph({ accent }: { accent: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden focusable="false">
      <rect x="34" y="10" width="28" height="52" rx="6" stroke={accent} strokeWidth="3" fill="none" />
      <rect x="39" y="18" width="18" height="34" rx="2" fill={accent} opacity="0.22" />
      <circle cx="48" cy="57.5" r="1.8" fill={accent} />
      <path
        d="M22 74a30 30 0 0 1 52 0"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <path d="M70 68l6 8-10 1z" fill={accent} opacity="0.5" />
    </svg>
  );
}

/** Full-viewport, non-dismissible rotate-device gate shown when a game requires an orientation the device isn't in. */
export function RotateDeviceScreen({
  title = "Turn your device",
  description,
  requiredOrientation = "landscape",
  accent = "var(--jg-accent, #8ea2ff)",
  icon,
  className,
  style,
}: {
  /** Short headline. */
  title?: string;
  /** One concise explanatory line. Defaults from `requiredOrientation`. */
  description?: string;
  /** Orientation the game needs. Drives the rotation animation direction. */
  requiredOrientation?: LayoutOrientation;
  /** Illustration/token color. */
  accent?: string;
  /** Custom illustration; defaults to an animated phone glyph. */
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  ensureStyle();
  const line =
    description ??
    (requiredOrientation === "landscape"
      ? "Rotate to landscape to play."
      : "Rotate to portrait to play.");
  const spin = requiredOrientation === "landscape" ? "jg-rotate-phone--to-landscape" : "jg-rotate-phone--to-portrait";
  return (
    <div
      className={className === undefined ? "jg-rotate-root" : `jg-rotate-root ${className}`}
      style={style}
      data-jg-orientation-gate={requiredOrientation}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onTouchStartCapture={(e) => e.stopPropagation()}
    >
      <div className="jg-rotate-inner">
        <div className={`jg-rotate-phone ${spin}`}>{icon ?? <PhoneGlyph accent={accent} />}</div>
        <h2 className="jg-rotate-title">{title}</h2>
        <p className="jg-rotate-desc">{line}</p>
      </div>
    </div>
  );
}
