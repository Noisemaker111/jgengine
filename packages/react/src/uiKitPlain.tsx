import type { ReactNode } from "react";

import {
  meterFraction,
  meterSegmentsLit,
  type KitButtonProps,
  type KitMenuProps,
  type KitMeterProps,
  type KitMinimapFrameProps,
  type KitPanelProps,
  type KitPromptProps,
  type KitToastProps,
  type UiKit,
} from "./uiKit";

const P = "jgk-plain";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
  return (
    <button {...rest} type={type} aria-pressed={pressed} className={cx(`${P}-btn`, className)} data-variant={variant} data-size={size} data-tone={tone} data-pressed={pressed === true ? "" : undefined}>
      {icon}
      <span>{children}</span>
      {glyph === undefined ? null : <kbd className={`${P}-glyph`}>{glyph}</kbd>}
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      {title === undefined && eyebrow === undefined && aside === undefined ? null : (
        <header className={`${P}-head`}>
          <span>
            {eyebrow === undefined ? null : <span className={`${P}-eyebrow`}>{eyebrow}</span>}
            {title === undefined ? null : <span className={`${P}-title`}>{title}</span>}
          </span>
          {aside}
        </header>
      )}
      {children}
      {footer === undefined ? null : <footer className={`${P}-foot`}>{footer}</footer>}
    </Tag>
  );
}

function Meter({ value, max = 1, label, readout, tone = "accent", variant = "bar", segments = 10, size = "md", className, style }: KitMeterProps): ReactNode {
  const fraction = meterFraction(value, max);
  const text = readout === true ? `${Math.round(value)} / ${Math.round(max)}` : readout === false ? null : readout;
  const lit = meterSegmentsLit(value, max, segments);
  return (
    <div className={cx(`${P}-meter`, className)} data-tone={tone} data-size={size} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {label === undefined && (text === null || text === undefined) ? null : (
        <span className={`${P}-meter-text`}>
          <span>{label}</span>
          <span>{text}</span>
        </span>
      )}
      {variant === "segments" ? (
        <span className={`${P}-cells`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} data-lit={index < lit ? "" : undefined} />
          ))}
        </span>
      ) : (
        <span className={`${P}-track`} data-ring={variant === "ring" ? "" : undefined}>
          <span style={{ width: `${fraction * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function Prompt({ glyph, label, device, tone, onActivate, className, style }: KitPromptProps): ReactNode {
  const Tag = onActivate === undefined ? "div" : "button";
  return (
    <Tag className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={style} onClick={onActivate} type={onActivate === undefined ? undefined : "button"}>
      <kbd className={`${P}-glyph`}>{glyph}</kbd>
      <span>{label}</span>
    </Tag>
  );
}

function Toast({ tone, title, icon, count, leaving, className, style, children }: KitToastProps): ReactNode {
  return (
    <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      {icon}
      <span>
        {title === undefined ? null : <strong>{title} </strong>}
        {children}
      </span>
      {count === undefined || count < 2 ? null : <span className={`${P}-count`}>×{count}</span>}
    </div>
  );
}

function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
  return (
    <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => onSelect(item.id)}
          {...itemProps(item.id)}
          className={`${P}-item`}
          data-active={item.id === activeId ? "" : undefined}
          data-secondary={item.secondary === true ? "" : undefined}
        >
          <span>{item.label}</span>
          {item.badge}
          {item.hint === undefined ? null : <small>{item.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function MinimapFrame({ children, size, shape = "square", label, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      {children}
      {label === undefined ? null : <span className={`${P}-map-label`}>{label}</span>}
    </div>
  );
}

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 16px; border: 1px solid var(--kit-line); border-radius: 8px; background: var(--kit-surface-alt); color: var(--kit-ink); font: 600 calc(14px * var(--kit-text)) / 1 var(--kit-font-body); cursor: pointer; }
.${P}-btn[data-variant="primary"] { background: var(--kit-accent); color: var(--kit-accent-ink); border-color: transparent; }
.${P}-btn[data-variant="ghost"] { background: transparent; border-color: transparent; }
.${P}-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border: 1px solid var(--kit-line); border-radius: 5px; font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-mono); }
.${P}-panel { padding: 12px; border: 1px solid var(--kit-line); border-radius: 10px; background: var(--kit-surface); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.${P}-eyebrow { display: block; font-size: calc(12px * var(--kit-text)); opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }
.${P}-title { display: block; font: 700 calc(16px * var(--kit-text)) / 1.2 var(--kit-font-display); }
.${P}-foot { margin-top: 10px; display: flex; gap: 8px; }
.${P}-meter { display: grid; gap: 4px; min-width: 120px; font-size: calc(12px * var(--kit-text)); }
.${P}-meter-text { display: flex; justify-content: space-between; }
.${P}-track { display: block; height: 8px; border-radius: 4px; background: var(--kit-surface-alt); overflow: hidden; }
.${P}-track > span { display: block; height: 100%; background: var(--kit-accent); }
.${P}-meter[data-tone="good"] .${P}-track > span { background: var(--kit-good); }
.${P}-meter[data-tone="warn"] .${P}-track > span { background: var(--kit-warn); }
.${P}-meter[data-tone="bad"] .${P}-track > span { background: var(--kit-bad); }
.${P}-cells { display: flex; gap: 3px; }
.${P}-cells > span { flex: 1; height: 8px; border-radius: 2px; background: var(--kit-surface-alt); }
.${P}-cells > span[data-lit] { background: var(--kit-accent); }
.${P}-prompt { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid var(--kit-line); border-radius: 999px; background: var(--kit-surface); color: var(--kit-ink); font: 600 calc(13px * var(--kit-text)) / 1 var(--kit-font-body); }
.${P}-toast { display: flex; align-items: center; gap: 8px; max-width: 340px; padding: 9px 14px; border: 1px solid var(--kit-line); border-left: 3px solid var(--kit-accent); border-radius: 8px; background: var(--kit-surface); font-size: calc(13px * var(--kit-text)); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-toast[data-tone="good"] { border-left-color: var(--kit-good); }
.${P}-toast[data-tone="warn"] { border-left-color: var(--kit-warn); }
.${P}-toast[data-tone="bad"] { border-left-color: var(--kit-bad); }
.${P}-toast[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-count { margin-left: auto; opacity: 0.7; }
.${P}-menu { display: grid; gap: 6px; }
.${P}-item { display: flex; align-items: baseline; gap: 10px; min-height: 44px; padding: 0 16px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--kit-ink); font: 600 calc(16px * var(--kit-text)) / 1 var(--kit-font-body); text-align: left; cursor: pointer; }
.${P}-item[data-active] { background: var(--kit-surface-alt); border-color: var(--kit-accent); }
.${P}-item[data-secondary] { opacity: 0.75; font-size: calc(14px * var(--kit-text)); }
.${P}-item:disabled { opacity: 0.4; }
.${P}-map { position: relative; overflow: hidden; border: 1px solid var(--kit-line); border-radius: 10px; background: var(--kit-surface-alt); }
.${P}-map[data-shape="circle"] { border-radius: 50%; }
.${P}-map-label { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; border-radius: 4px; background: var(--kit-surface); font-size: calc(12px * var(--kit-text)); }
@keyframes ${P}-in { from { opacity: 0; translate: 0 6px; } }
@keyframes ${P}-out { to { opacity: 0; translate: 0 6px; } }
`;

/**
 * The fallback kit outside any `UiKitRoot`: quiet, neutral parts so kit components always render.
 * Games pick a real kit with `defineGame({ uiKit })`.
 */
export const plainKit: UiKit = {
  id: "plain",
  name: "Plain",
  description: "Neutral fallback parts used when no kit is chosen.",
  tokens: {
    // Corner of engine controls (settings rows, tabs) drawn on this kit's panes.
    radius: "10px",
    ink: "#f5f7fa",
    surface: "rgba(12, 15, 21, 0.9)",
    surfaceAlt: "rgba(255, 255, 255, 0.1)",
    accent: "#38bdf8",
    accentInk: "#0a0c10",
    good: "#4ade80",
    warn: "#fbbf24",
    bad: "#f87171",
    line: "rgba(255, 255, 255, 0.16)",
    scrim: "rgba(6, 8, 12, 0.6)",
    fontDisplay: "system-ui, sans-serif",
    fontBody: "system-ui, sans-serif",
    fontMono: "ui-monospace, monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 160, exitMs: 120, ease: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  sounds: {},
};
