/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { deriveHudTheme } from "@jgengine/core/hud/hudTheme.view";
import {
  customizeKit,
  meterFraction,
  type KitButtonProps,
  type KitMeterProps,
  type KitPanelProps,
  type KitPromptProps,
  type KitToastProps,
  uiKitVars,
} from "@jgengine/core/ui/kit/uiKit.view";
import { ensureUiKitStyles } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { paperKit } from "@jgengine/core/ui/kit/uiKitPaper.view";

import { cn } from "./cn";
import { LLMVILLE_KIT_CSS } from "./llmvilleKitCss";

/** LLMville's warm-on-ink palette (docs/design/DESIGN.md §2): the one place its colours are written. */
export const LLMVILLE_PALETTE = {
  cream: "#f4ecdd",
  creamDim: "#c7bca9",
  coral: "#e8836b",
  coralDeep: "#c75d45",
  teal: "#5fc2a8",
  tealDeep: "#3c8c76",
  amber: "#e0a95c",
  wood: "#b07a4e",
  ink: "#16201e",
  ink2: "#1f2b28",
  destructive: "#d9544a",
} as const;

const P = LLMVILLE_PALETTE;

/**
 * Card and panel looks a {@link KitPanel} takes through `data-shell`: each kind of information has its
 * own object (an invoice page, a lab terminal, a pinned quest ticket).
 */
export type LlmvilleShell =
  | "glass"
  | "inset"
  | "terminal"
  | "blueprint"
  | "server-lcd"
  | "tablet"
  | "tablet-device"
  | "quest-ticket"
  | "invoice"
  | "sticky-note"
  | "spec-sheet"
  | "inventory-tray"
  | "model-report"
  | "redacted"
  | "polaroid";

/** Paper and tape details a card shell can carry through `data-deco`. */
export type LlmvilleDeco = "pin" | "tape" | "stamp" | "fold";

const SHELLS: ReadonlySet<string> = new Set<LlmvilleShell>([
  "glass", "inset", "terminal", "blueprint", "server-lcd", "tablet", "tablet-device", "quest-ticket", "invoice", "sticky-note",
  "spec-sheet", "inventory-tray", "model-report", "redacted", "polaroid",
]);
const DECOS: ReadonlySet<string> = new Set<LlmvilleDeco>(["pin", "tape", "stamp", "fold"]);

function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={pressed}
      className={cn("llm-btn", className)}
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      data-pressed={pressed === true ? "" : undefined}
    >
      {icon}
      {children}
      {glyph === undefined ? null : <kbd className="llm-glyph">{glyph}</kbd>}
    </button>
  );
}

interface LlmvillePanelProps extends KitPanelProps {
  "data-shell"?: string;
  "data-deco"?: string;
}

/**
 * Glass by default. `variant="card"` draws a themed card (`data-shell` picks the object, `data-deco` a pin,
 * tape, stamp or folded corner); any other variant is a surface whose `data-shell` picks its material.
 */
function Panel({
  eyebrow,
  title,
  aside,
  footer,
  tone,
  variant = "hud",
  as: Tag = "section",
  leaving,
  className,
  children,
  "data-shell": shellProp,
  "data-deco": decoProp,
  ...rest
}: LlmvillePanelProps): ReactNode {
  const shell = shellProp !== undefined && SHELLS.has(shellProp) ? shellProp : "glass";
  const deco = decoProp !== undefined && DECOS.has(decoProp) ? decoProp : undefined;
  const state = leaving === true ? "closed" : "open";
  if (variant === "card") {
    return (
      <Tag
        {...rest}
        className={cn("llm-card", `llm-card--${shell}`, (deco === "pin" || deco === "tape") && "llm-card--top-decoration", className)}
        data-variant={variant}
        data-tone={tone}
        data-state={state}
      >
        {title === undefined ? null : <div className="llm-card__header">{title}</div>}
        <div className="llm-card__body">{children}</div>
        {footer}
        {deco === "pin" ? <div className="llm-card__pin" aria-hidden /> : null}
        {deco === "tape" ? <div className="llm-card__tape" aria-hidden /> : null}
        {deco === "fold" ? <div className="llm-card__corner-fold" aria-hidden /> : null}
      </Tag>
    );
  }
  const hasHead = title !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={cn("llm-panel", `llm-panel--${shell}`, className)} data-variant={variant} data-tone={tone} data-state={state}>
      {hasHead ? (
        <header className="llm-panel__head">
          <span>
            {eyebrow === undefined ? null : <span className="llm-panel__label">{eyebrow}</span>}
            {title === undefined ? null : <span className="llm-panel__title">{title}</span>}
          </span>
          {aside}
        </header>
      ) : eyebrow === undefined ? null : (
        <p className="llm-panel__label">{eyebrow}</p>
      )}
      {children}
      {footer === undefined ? null : <footer className="llm-panel__foot">{footer}</footer>}
    </Tag>
  );
}

function Meter({ value, max = 1, label, readout, tone = "good", size = "md", className, style }: KitMeterProps): ReactNode {
  const fraction = meterFraction(value, max);
  const text = readout === true ? `${Math.round(value)} / ${Math.round(max)}` : readout === false ? null : readout;
  return (
    <div className={cn("llm-meter", className)} data-tone={tone} data-size={size} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {label === undefined ? null : <span className="llm-meter__label">{label}</span>}
      <span className="llm-meter__track">
        <span className="llm-meter__fill" style={{ width: `${fraction * 100}%` }} />
      </span>
      {text === null || text === undefined ? null : <span className="llm-meter__value">{text}</span>}
    </div>
  );
}

function Prompt({ glyph, label, device, tone, onActivate, className, style }: KitPromptProps): ReactNode {
  const body = (
    <>
      <kbd className="llm-glyph">{glyph}</kbd>
      <span>{label}</span>
    </>
  );
  if (onActivate === undefined) {
    return <div className={cn("llm-prompt", className)} data-tone={tone} data-device={device} style={style}>{body}</div>;
  }
  return (
    <button type="button" className={cn("llm-prompt", className)} data-tone={tone} data-device={device} style={style} onClick={onActivate}>
      {body}
    </button>
  );
}

function Toast({ tone, title, icon, count, leaving, className, style, children }: KitToastProps): ReactNode {
  return (
    <div className={cn("llm-toast", className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      <div className="llm-toast__inner">
        {icon === undefined ? null : <div className="llm-toast__avatar">{icon}</div>}
        <div className="llm-toast__content">
          {title === undefined ? null : (
            <div className="llm-toast__header">
              <span className="llm-toast__title">{title}</span>
              {count === undefined || count < 2 ? null : <span className="llm-toast__count">×{count}</span>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * LLMville's UI kit: the paper kit's menu and minimap frame, with LLMville's own glass panels, themed
 * card shells, flat buttons, pill meters and toasts drawn from its palette tokens.
 */
export const llmvilleKit = customizeKit(paperKit, {
  name: "LLMville",
  tokens: {
    ink: P.cream,
    inkDim: P.creamDim,
    surface: "rgba(27, 37, 34, 0.86)",
    surfaceStrong: "rgba(20, 28, 26, 0.92)",
    surfaceSoft: "rgba(244, 236, 221, 0.05)",
    surfaceAlt: P.ink2,
    ground: P.ink,
    accent: P.coral,
    accentDeep: P.coralDeep,
    accentInk: "#3a1b12",
    teal: P.teal,
    tealDeep: P.tealDeep,
    tealInk: "#0e231e",
    amber: P.amber,
    wood: P.wood,
    bezel: "#1a1a1e",
    good: P.teal,
    warn: P.amber,
    bad: P.destructive,
    line: "rgba(244, 236, 221, 0.1)",
    lineStrong: "rgba(244, 236, 221, 0.16)",
    scrim: "rgba(0, 0, 0, 0.5)",
    glowTeal: "0 0 24px rgba(95, 194, 168, 0.35)",
    glowAccent: "0 0 24px rgba(232, 131, 107, 0.35)",
    radius: "1rem",
    rSurface: "1.5rem",
    rControl: "0.85rem",
    rField: "0.6rem",
    rPill: "999px",
    fontDisplay: "\"Baloo 2\", \"Nunito\", system-ui, sans-serif",
    fontBody: "\"Nunito\", \"Inter Variable\", system-ui, sans-serif",
    fontMono: "ui-monospace, monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast },
  css: LLMVILLE_KIT_CSS,
  motion: { enterMs: 300, exitMs: 200, ease: "cubic-bezier(0.22, 1, 0.36, 1)" },
});

/** The shell's HUD theme (settings rows, keybinding menu, notices) seeded from the same palette. */
export const llmvilleHudTheme = deriveHudTheme({
  accent: P.teal,
  surface: P.ink2,
  text: P.cream,
  danger: P.destructive,
  warning: P.amber,
  fontDisplay: "\"Baloo 2\", \"Nunito\", system-ui, sans-serif",
});

/**
 * Puts the kit's tokens on `:root` and its stylesheet in the head, so pages outside the shell (menus,
 * auth) and portals read the same `--kit-*` palette the HUD does.
 */
export function applyLlmvilleKit(doc: Document): void {
  for (const [name, value] of Object.entries(uiKitVars(llmvilleKit))) {
    if (value !== undefined && value !== null) doc.documentElement.style.setProperty(name, String(value));
  }
  ensureUiKitStyles(llmvilleKit, doc);
}
