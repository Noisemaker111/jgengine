import type { CSSProperties, ReactNode } from "react";

import {
  kitCueSound,
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

const P = "jgk-arcade";

/** Cells in the chunky block bar. */
const BAR_CELLS = 20;
/** Segments in the crisp pixel ring. */
const RING_SEGMENTS = 16;
/** Ring radius, in the 44-unit ring viewBox. */
const RING_R = 16;

/** An 8x8 pixel circle as a stepped polygon: no smooth curves anywhere. */
const PIXEL_CIRCLE =
  "polygon(25% 0, 75% 0, 75% 12.5%, 87.5% 12.5%, 87.5% 25%, 100% 25%, 100% 75%, 87.5% 75%, 87.5% 87.5%, 75% 87.5%, 75% 100%, 25% 100%, 25% 87.5%, 12.5% 87.5%, 12.5% 75%, 0 75%, 0 25%, 12.5% 25%, 12.5% 12.5%, 25% 12.5%)";
/** A stepped pixel arrow pointing up, for the north marker. */
const PIXEL_ARROW =
  "polygon(37.5% 0, 62.5% 0, 62.5% 12.5%, 75% 12.5%, 75% 25%, 87.5% 25%, 87.5% 37.5%, 62.5% 37.5%, 62.5% 100%, 37.5% 100%, 37.5% 37.5%, 12.5% 37.5%, 12.5% 25%, 25% 25%, 25% 12.5%, 37.5% 12.5%)";
/** Notched 4px ends for the pixel banner. */
const PIXEL_BANNER =
  "polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 4px 4px)";
/** Hard 2px dark outline for every label. */
const OUTLINE = "2px 0 0 var(--kit-shade), -2px 0 0 var(--kit-shade), 0 2px 0 var(--kit-shade), 0 -2px 0 var(--kit-shade)";

/** A pixel border drawn with stacked box-shadows: `w` px on each side, corners left notched. */
function frame(w: number): string {
  return `0 -${w}px 0 0 var(--kit-line), 0 ${w}px 0 0 var(--kit-line), -${w}px 0 0 0 var(--kit-line), ${w}px 0 0 0 var(--kit-line)`;
}

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={pressed}
      className={cx(`${P}-btn`, className)}
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      data-pressed={pressed === true ? "" : undefined}
    >
      {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
      <span className={`${P}-btn-label`}>{children}</span>
      {glyph === undefined ? null : <span className={`${P}-glyph`}>{glyph}</span>}
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      {head ? (
        <header className={`${P}-panel-head`}>
          {eyebrow === undefined ? null : <span className={`${P}-eyebrow`}>{eyebrow}</span>}
          {title === undefined ? null : <span className={`${P}-title`}>{title}</span>}
          {aside === undefined ? null : <span className={`${P}-aside`}>{aside}</span>}
        </header>
      ) : null}
      {children === undefined ? null : <div className={`${P}-panel-body`}>{children}</div>}
      {footer === undefined ? null : <footer className={`${P}-panel-foot`}>{footer}</footer>}
    </Tag>
  );
}

function Meter({ value, max = 1, label, readout, tone = "accent", variant = "bar", segments = 10, size = "md", className, style }: KitMeterProps): ReactNode {
  const fraction = meterFraction(value, max);
  const text = readout === true ? `${Math.round(value)} / ${Math.round(max)}` : readout === false || readout === undefined ? null : readout;
  const head =
    label === undefined && text === null ? null : (
      <span className={`${P}-meter-text`}>
        {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
        {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
      </span>
    );
  if (variant === "ring") {
    const length = 2 * Math.PI * RING_R;
    const lit = meterSegmentsLit(value, max, RING_SEGMENTS);
    const seg = length / RING_SEGMENTS;
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span className={`${P}-ring`}>
          <svg className={`${P}-ring-svg`} viewBox="0 0 44 44" shapeRendering="crispEdges" aria-hidden="true">
            <circle cx="22" cy="22" r="20" className={`${P}-ring-disc`} />
            {Array.from({ length: RING_SEGMENTS }, (_, index) => (
              <circle
                key={index}
                cx="22"
                cy="22"
                r={RING_R}
                className={`${P}-ring-seg`}
                data-lit={index < lit ? "" : undefined}
                strokeDasharray={`${seg - 1.5} ${length}`}
                strokeDashoffset={-index * seg}
                transform="rotate(-90 22 22)"
              />
            ))}
          </svg>
          <span className={`${P}-ring-pct`}>{Math.round(fraction * 100)}%</span>
        </span>
        {head}
      </div>
    );
  }
  if (variant === "segments") {
    const hearts = Math.max(1, Math.floor(segments));
    const lit = meterSegmentsLit(value, max, hearts);
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="segments" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        {head}
        <span className={`${P}-hearts`} aria-hidden="true">
          {Array.from({ length: hearts }, (_, index) => (
            <span key={index} className={`${P}-heart`} data-lit={index < lit ? "" : undefined}>
              ♥
            </span>
          ))}
        </span>
      </div>
    );
  }
  const lit = meterSegmentsLit(value, max, BAR_CELLS);
  return (
    <div className={cx(`${P}-meter`, className)} data-variant="bar" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {head}
      <span className={`${P}-blocks`} aria-hidden="true">
        {Array.from({ length: BAR_CELLS }, (_, index) => (
          <span key={index} className={`${P}-cell`} data-lit={index < lit ? "" : undefined} />
        ))}
      </span>
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const fill = progress === undefined ? undefined : ({ "--jgk-arcade-progress": `${Math.round(clamp01(progress) * 100)}%` } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-prompt-glyph`} data-device={device}>
        <span className={`${P}-prompt-glyph-text`}>{glyph}</span>
      </span>
      <span className={`${P}-prompt-label`} style={fill}>
        {label}
      </span>
    </>
  );
  if (onActivate !== undefined) {
    return (
      <button type="button" className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={style} onClick={onActivate}>
        {body}
      </button>
    );
  }
  return (
    <div className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={style}>
      {body}
    </div>
  );
}

function Toast({ tone, title, icon, count, leaving, className, style, children }: KitToastProps): ReactNode {
  return (
    <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      {icon === undefined ? null : <span className={`${P}-toast-icon`}>{icon}</span>}
      <span className={`${P}-toast-text`}>
        {title === undefined ? null : <span className={`${P}-toast-title`}>{title}</span>}
        <span className={`${P}-toast-body`}>{children}</span>
      </span>
      {count === undefined || count < 2 ? null : <span className={`${P}-toast-count`}>x{count}</span>}
    </div>
  );
}

function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
  const primary = items.filter((item) => item.secondary !== true);
  const secondary = items.filter((item) => item.secondary === true);
  const row = (item: KitMenuProps["items"][number]) => (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled}
      onClick={() => onSelect(item.id)}
      {...itemProps(item.id)}
      className={`${P}-menu-item`}
      data-active={item.id === activeId ? "" : undefined}
      data-secondary={item.secondary === true ? "" : undefined}
    >
      <span className={`${P}-menu-label`}>{item.label}</span>
      {item.badge === undefined ? null : <span className={`${P}-menu-badge`}>{item.badge}</span>}
      {item.hint === undefined ? null : <span className={`${P}-menu-hint`}>{item.hint}</span>}
    </button>
  );
  return (
    <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
      {primary.map(row)}
      {secondary.length === 0 ? null : <span className={`${P}-menu-rule`} aria-hidden="true" />}
      {secondary.map(row)}
    </div>
  );
}

function MinimapFrame({ children, size, shape = "square", label, heading = 0, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-heading}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {label === undefined ? null : <span className={`${P}-map-label`}>{label}</span>}
    </div>
  );
}

const TONED = `:is(.${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-btn)`;

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn *, .${P}-panel *, .${P}-toast *, .${P}-menu *, .${P}-map *, .${P}-prompt * { box-sizing: border-box; }
${TONED}[data-tone="good"] { --jgk-arcade-tone: var(--kit-good); --jgk-arcade-cap: var(--kit-good); }
${TONED}[data-tone="warn"] { --jgk-arcade-tone: var(--kit-warn); --jgk-arcade-cap: var(--kit-warn); }
${TONED}[data-tone="bad"] { --jgk-arcade-tone: var(--kit-bad); --jgk-arcade-cap: var(--kit-bad); }
${TONED}[data-tone="accent"] { --jgk-arcade-tone: var(--kit-accent); }
${TONED}[data-tone="neutral"] { --jgk-arcade-tone: var(--kit-surface-alt); }

.${P}-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; margin: 8px 12px 16px 8px; padding: 12px 18px 10px; border: 0; background: var(--kit-surface-alt); color: var(--kit-ink); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: ${OUTLINE}; cursor: pointer; box-shadow: 0 -4px 0 0 var(--kit-line), -4px 0 0 0 var(--kit-line), 4px 0 0 0 var(--kit-line), 0 4px 0 0 var(--jgk-arcade-depth, var(--kit-shade)), 0 8px 0 0 var(--kit-line); }
.${P}-btn[data-variant="primary"] { --jgk-arcade-depth: #b08f00; background: var(--kit-accent); color: var(--kit-accent-ink); text-shadow: none; }
.${P}-btn[data-variant="ghost"] { background: transparent; box-shadow: none; text-shadow: ${OUTLINE}; }
.${P}-btn:not([data-variant="ghost"])[data-tone="good"] { --jgk-arcade-depth: #008a24; background: var(--kit-good); color: var(--kit-accent-ink); text-shadow: none; }
.${P}-btn:not([data-variant="ghost"])[data-tone="warn"] { --jgk-arcade-depth: #b86f00; background: var(--kit-warn); color: var(--kit-accent-ink); text-shadow: none; }
.${P}-btn:not([data-variant="ghost"])[data-tone="bad"] { --jgk-arcade-depth: #a3002f; background: var(--kit-bad); color: var(--kit-ink); }
.${P}-btn[data-variant="ghost"][data-tone="good"] { color: var(--kit-good); }
.${P}-btn[data-variant="ghost"][data-tone="warn"] { color: var(--kit-warn); }
.${P}-btn[data-variant="ghost"][data-tone="bad"] { color: var(--kit-bad); }
.${P}-btn[data-variant="ghost"] { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 6px; }
.${P}-btn[data-size="sm"] { min-height: 34px; padding: 8px 12px 6px; font-size: calc(12px * var(--kit-text)); }
.${P}-btn[data-size="lg"] { min-height: 62px; padding: 16px 26px 14px; font-size: calc(18px * var(--kit-text)); }
.${P}-btn-icon { display: inline-flex; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; background: var(--kit-shade); color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: none; box-shadow: ${frame(2)}; }
/* Lit with an overlay instead of a CSS filter, which re-renders every frame over a live 3D scene. */
@media (hover: hover) { .${P}-btn:not(:disabled):not([data-variant="ghost"]):hover { background-image: linear-gradient(rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.14)); } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: translateY(4px); box-shadow: 0 -4px 0 0 var(--kit-line), -4px 0 0 0 var(--kit-line), 4px 0 0 0 var(--kit-line), 0 4px 0 0 var(--kit-line); }
.${P}-btn[data-variant="ghost"]:not(:disabled):active, .${P}-btn[data-variant="ghost"][data-pressed] { box-shadow: none; }
.${P}-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.${P}-btn:focus-visible { outline: none; }
.${P}-btn:focus-visible::before { content: "►"; position: absolute; left: -24px; top: 50%; margin-top: -0.6em; color: var(--kit-accent); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; animation: ${P}-blink calc(700ms * var(--kit-motion)) steps(1, end) infinite; }

.${P}-panel { position: relative; margin: 22px 12px 14px 8px; padding: 20px 18px 16px; background: var(--kit-surface); color: var(--kit-ink); font: 700 calc(14px * var(--kit-text)) / 1.5 var(--kit-font-body); letter-spacing: 0.04em; text-transform: uppercase; text-shadow: ${OUTLINE}; box-shadow: ${frame(4)}, inset 0 0 0 2px var(--kit-shade), 8px 8px 0 0 var(--kit-shade); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(4, end) both; }
.${P}-panel[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) steps(3, end) both; pointer-events: none; }
.${P}-panel-head { position: absolute; top: -14px; left: 14px; z-index: 2; display: flex; align-items: center; gap: 10px; max-width: calc(100% - 28px); }
.${P}-eyebrow { padding: 5px 8px 3px; background: var(--kit-shade); color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: none; white-space: nowrap; box-shadow: ${frame(2)}; }
.${P}-title { padding: 7px 12px 5px; background: var(--jgk-arcade-tone, var(--kit-accent)); color: var(--kit-accent-ink); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: ${frame(4)}; }
.${P}-panel[data-tone="neutral"] > .${P}-panel-head .${P}-title { color: var(--kit-ink); }
.${P}-panel[data-tone="bad"] > .${P}-panel-head .${P}-title { color: var(--kit-ink); text-shadow: ${OUTLINE}; }
.${P}-aside { margin-left: auto; color: var(--kit-accent); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; }
.${P}-panel-body { position: relative; }
.${P}-panel-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 16px; }
.${P}-panel[data-variant="hud"] { margin: 16px 8px 10px 6px; padding: 16px 12px 10px; font-size: calc(12px * var(--kit-text)); box-shadow: ${frame(4)}, inset 0 0 0 2px var(--kit-shade), 6px 6px 0 0 var(--kit-shade); }
.${P}-panel[data-variant="card"] { padding: 24px 22px 18px; }
.${P}-panel[data-variant="pane"] { margin: 22px 12px 14px 8px; padding: 28px 26px 22px; font-size: calc(14px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"] { margin: 26px 12px 16px 8px; padding: 32px 30px 40px; font-size: calc(15px * var(--kit-text)); box-shadow: ${frame(4)}, inset 0 0 0 2px var(--kit-shade), 10px 10px 0 0 var(--kit-shade); }
.${P}-panel[data-variant="dialog"] .${P}-title { padding: 10px 16px 8px; font-size: calc(16px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"]::after { content: "▼"; position: absolute; right: 14px; bottom: 10px; color: var(--kit-accent); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; animation: ${P}-blink calc(600ms * var(--kit-motion)) steps(1, end) infinite; }
.${P}-panel[data-variant="strip"] { display: flex; align-items: center; gap: 16px; margin: 0; padding: 10px 24px; background: var(--kit-surface-alt); box-shadow: none; clip-path: ${PIXEL_BANNER}; border-top: 4px solid var(--kit-line); border-bottom: 4px solid var(--kit-line); font-size: calc(14px * var(--kit-text)); }
.${P}-panel[data-variant="strip"] > .${P}-panel-head { position: static; }
.${P}-panel[data-variant="strip"] .${P}-title { padding: 0; background: none; box-shadow: none; color: var(--jgk-arcade-tone, var(--kit-accent)); }
.${P}-panel[data-variant="strip"] .${P}-eyebrow { box-shadow: none; }

.${P}-meter { display: grid; gap: 8px; min-width: 170px; color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1.2 var(--kit-font-display); text-shadow: ${OUTLINE}; }
.${P}-meter[data-size="lg"] { font-size: calc(14px * var(--kit-text)); }
.${P}-meter-text { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; text-transform: uppercase; letter-spacing: 0.06em; }
.${P}-meter-readout { color: var(--kit-accent); }
.${P}-blocks { display: flex; gap: 2px; margin: 2px; padding: 3px; background: var(--kit-shade); box-shadow: ${frame(2)}; }
.${P}-cell { flex: 1 1 0; height: 16px; background: rgba(0, 0, 0, 0.5); }
.${P}-cell[data-lit] { background: var(--jgk-arcade-tone, var(--kit-accent)); box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.6), inset 0 -3px 0 rgba(0, 0, 0, 0.25); }
.${P}-hearts { display: inline-flex; gap: 4px; font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-heart { color: var(--kit-surface-alt); -webkit-text-stroke: 1px var(--kit-shade); text-shadow: 2px 2px 0 var(--kit-shade); }
.${P}-heart[data-lit] { color: var(--jgk-arcade-tone, var(--kit-bad)); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 12px; min-width: 0; }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 4px; }
.${P}-ring { position: relative; display: grid; place-items: center; width: 60px; height: 60px; }
.${P}-meter[data-size="lg"] .${P}-ring { width: 80px; height: 80px; }
.${P}-ring-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.${P}-ring-disc { fill: var(--kit-surface); }
.${P}-ring-seg { fill: none; stroke: var(--kit-shade); stroke-width: 6; }
.${P}-ring-seg[data-lit] { stroke: var(--jgk-arcade-tone, var(--kit-accent)); }
.${P}-ring-pct { position: relative; font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; }

.${P}-prompt { display: inline-flex; align-items: center; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; text-align: left; cursor: default; animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(4, end) both; }
button.${P}-prompt { cursor: pointer; }
.${P}-prompt-glyph { position: relative; z-index: 1; display: grid; place-items: center; width: 46px; height: 46px; background: var(--kit-line); clip-path: ${PIXEL_CIRCLE}; color: var(--kit-ink); }
.${P}-prompt-glyph::before { content: ""; position: absolute; inset: 4px; background: var(--jgk-arcade-cap, var(--kit-bad)); clip-path: ${PIXEL_CIRCLE}; }
.${P}-prompt-glyph::after { content: ""; position: absolute; left: 22%; top: 18%; z-index: 1; width: 9px; height: 6px; background: rgba(255, 255, 255, 0.85); }
.${P}-prompt-glyph-text { position: relative; z-index: 2; font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; }
.${P}-prompt[data-device="touch"] .${P}-prompt-glyph { width: 64px; height: 64px; }
.${P}-prompt[data-device="touch"] .${P}-prompt-glyph-text { font-size: calc(13px * var(--kit-text)); }
.${P}-prompt-label { position: relative; z-index: 0; margin-left: -8px; padding: 9px 14px 7px 18px; background: linear-gradient(90deg, var(--kit-accent) var(--jgk-arcade-progress, 0%), transparent 0) bottom / 100% 5px no-repeat, linear-gradient(var(--kit-shade), var(--kit-shade)) bottom / 100% 5px no-repeat, var(--kit-surface); color: var(--kit-ink); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: ${OUTLINE}; box-shadow: ${frame(3)}; }
.${P}-prompt[data-device="touch"] .${P}-prompt-label { font-size: calc(16px * var(--kit-text)); }

.${P}-toast { position: relative; display: inline-flex; align-items: center; gap: 12px; max-width: 360px; padding: 6px 8px; color: var(--kit-ink); transform-origin: center; animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(4, end) both; }
.${P}-toast[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) steps(3, end) both; pointer-events: none; }
.${P}-toast-icon { font-size: calc(18px * var(--kit-text)); text-shadow: ${OUTLINE}; }
.${P}-toast-text { display: grid; gap: 6px; }
.${P}-toast-title { color: var(--jgk-arcade-tone, var(--kit-accent)); font: 700 calc(20px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 2px 0 0 var(--kit-shade), -2px 0 0 var(--kit-shade), 0 2px 0 var(--kit-shade), 0 -2px 0 var(--kit-shade), 4px 4px 0 var(--kit-shade); }
.${P}-toast-body { font: 700 calc(12px * var(--kit-text)) / 1.3 var(--kit-font-display); letter-spacing: 0.04em; text-transform: uppercase; text-shadow: ${OUTLINE}; }
.${P}-toast-count { position: relative; padding: 4px 7px 3px; background: var(--kit-bad); color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: none; box-shadow: ${frame(2)}; }

.${P}-menu { display: grid; gap: 14px; justify-items: center; padding: 10px 14px; }
.${P}-menu-item { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-width: 240px; margin: 0; padding: 8px 14px 6px; border: 0; background: transparent; color: var(--kit-ink); font: 700 calc(14px * var(--kit-text)) / 1.2 var(--kit-font-display); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: ${OUTLINE}; cursor: pointer; }
.${P}-menu[data-variant="title"] .${P}-menu-item { min-width: 320px; padding: 12px 18px 10px; font-size: calc(26px * var(--kit-text)); letter-spacing: 0.1em; text-shadow: ${OUTLINE}, 5px 5px 0 var(--kit-shade); }
.${P}-menu-item[data-active] { background: var(--kit-surface-alt); color: var(--kit-accent); box-shadow: ${frame(2)}; margin: 2px 0; }
.${P}-menu-item[data-active]::before { content: "►"; position: absolute; left: -26px; top: 50%; margin-top: -0.6em; color: var(--kit-accent); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: ${OUTLINE}; animation: ${P}-blink calc(700ms * var(--kit-motion)) steps(1, end) infinite; }
.${P}-menu-item:not([data-active]):not(:disabled):hover { color: var(--kit-sky); }
.${P}-menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-menu-item:focus-visible { outline: none; }
.${P}-menu-item[data-secondary] { min-width: 0; padding: 4px 10px 2px; font-size: calc(12px * var(--kit-text)); }
.${P}-menu-hint { color: var(--kit-sky); font-size: calc(12px * var(--kit-text)); text-transform: none; text-shadow: ${OUTLINE}; }
.${P}-menu-badge { padding: 3px 6px 2px; background: var(--kit-bad); color: var(--kit-ink); font-size: calc(12px * var(--kit-text)); text-shadow: none; box-shadow: ${frame(2)}; }
.${P}-menu-rule { display: block; width: 70%; height: 4px; margin: 6px 0; background: repeating-linear-gradient(90deg, var(--kit-line) 0 4px, transparent 4px 12px); }

.${P}-map { position: relative; flex: none; margin: 40px 16px 40px 16px; }
.${P}-map::before { content: ""; position: absolute; inset: 0; background: var(--kit-line); clip-path: ${PIXEL_CIRCLE}; display: none; }
.${P}-map[data-shape="circle"]::before { display: block; }
.${P}-map-window { position: absolute; inset: 4px; overflow: hidden; background: var(--kit-surface-alt); box-shadow: inset 0 0 0 2px var(--kit-shade); }
.${P}-map[data-shape="square"] .${P}-map-window { box-shadow: ${frame(4)}, inset 0 0 0 2px var(--kit-shade); }
.${P}-map-window > * { display: block; width: 100%; height: 100%; }
.${P}-map[data-shape="circle"] .${P}-map-window { clip-path: ${PIXEL_CIRCLE}; }
.${P}-map-window::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(var(--kit-shade), var(--kit-shade)) center / 2px 100% no-repeat, linear-gradient(var(--kit-shade), var(--kit-shade)) center / 100% 2px no-repeat; opacity: 0.5; }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; transition: transform calc(120ms * var(--kit-motion)) steps(4, end); }
.${P}-map-north > span { position: absolute; left: 50%; top: -38px; width: 24px; height: 40px; margin-left: -12px; color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); text-align: center; text-shadow: ${OUTLINE}; }
.${P}-map-north > span::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: var(--kit-accent); clip-path: ${PIXEL_ARROW}; }
.${P}-map-label { position: absolute; left: 50%; bottom: -40px; padding: 6px 10px 4px; transform: translateX(-50%); background: var(--kit-surface); color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: ${OUTLINE}; white-space: nowrap; box-shadow: ${frame(2)}; }

@keyframes ${P}-in { 0% { scale: 0; } 60% { scale: 1.2; } 100% { scale: 1; } }
@keyframes ${P}-out { from { scale: 1; } to { scale: 0; } }
@keyframes ${P}-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
`;

/**
 * Cabinet: a retro 8-bit arcade and JRPG. Stepped pixel borders, JRPG windows with title tabs, chunky depth buttons, heart meters, score-popup toasts and chiptune blips.
 *
 * @capability ui-kit-arcade retro 8-bit arcade UI kit: stepped pixel frames, JRPG windows, depth buttons, hearts, score popups, chiptune cues
 */
export const arcadeKit: UiKit = {
  id: "arcade",
  name: "Cabinet",
  description: "Retro 8-bit arcade and JRPG: stepped pixel frames, JRPG windows, depth buttons, hearts and score-popup toasts.",
  tokens: {
    // Corner of engine controls (settings rows, tabs) drawn on this kit's panes.
    radius: "0px",
    ink: "#fff1e8",
    surface: "#1d2b53",
    surfaceAlt: "#29366f",
    accent: "#ffec27",
    accentInk: "#1d2b53",
    good: "#00e436",
    warn: "#ffa300",
    bad: "#ff004d",
    line: "#fff1e8",
    scrim: "rgba(0, 0, 20, 0.72)",
    shade: "#000000",
    sky: "#29adff",
    fontDisplay: "\"Press Start 2P\", \"Lucida Console\", \"Courier New\", monospace",
    fontBody: "\"Press Start 2P\", \"Lucida Console\", \"Courier New\", monospace",
    fontMono: "\"Press Start 2P\", \"Lucida Console\", \"Courier New\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 240, exitMs: 150, ease: "steps(4, end)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.45, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 1320, slideTo: 880, duration: 0.04, gain: 0.18 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 1000, duration: 0.02, gain: 0.12 }] } }),
    open: kitCueSound("open", { gain: 0.45, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 260, slideTo: 880, duration: 0.16, gain: 0.16 }] } }),
    close: kitCueSound("close", { gain: 0.45, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 880, slideTo: 260, duration: 0.14, gain: 0.14 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.45, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 988, duration: 0.08, gain: 0.16 }, { kind: "tone", wave: "square", freq: 1319, duration: 0.26, gain: 0.16, delay: 0.08 }] } }),
    deny: kitCueSound("deny", { gain: 0.5, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "square", freq: 140, slideTo: 90, duration: 0.24, gain: 0.2, attack: 0.003 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 523, duration: 0.08, gain: 0.18 }, { kind: "tone", wave: "triangle", freq: 659, duration: 0.08, gain: 0.18, delay: 0.07 }, { kind: "tone", wave: "triangle", freq: 784, duration: 0.08, gain: 0.18, delay: 0.14 }, { kind: "tone", wave: "triangle", freq: 1047, duration: 0.14, gain: 0.18, delay: 0.21 }] } }),
  },
};
