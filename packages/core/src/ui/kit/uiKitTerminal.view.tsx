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
  type KitTone,
  type UiKit,
} from "./uiKit.view";

const P = "jgk-terminal";

/** Cells in the ASCII bar meter. */
const BAR_CELLS = 20;
/** Cells in a prompt's progress row. */
const PROGRESS_CELLS = 12;
/** Radius of the radar ring track, in the 44-unit ring viewBox. */
const RING_R = 17;

const TOAST_TAG: Record<KitTone, string> = { good: "[ OK ]", warn: "[WARN]", bad: "[ERR!]", neutral: "[INFO]", accent: "[INFO]" };

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** Zero-padded `value/max` readout, like `072/100`. */
function readoutFor(value: number, max: number): string {
  const width = String(Math.round(max)).length;
  const shown = String(Math.max(0, Math.round(value))).padStart(width, "0");
  return `${shown}/${String(Math.round(max)).padStart(width, "0")}`;
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
  const text = readout === true ? readoutFor(value, max) : readout === false || readout === undefined ? null : readout;
  const head =
    label === undefined && text === null ? null : (
      <span className={`${P}-meter-text`}>
        {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
        {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
      </span>
    );
  if (variant === "ring") {
    const length = 2 * Math.PI * RING_R;
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span className={`${P}-ring`}>
          <svg className={`${P}-ring-svg`} viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="20" className={`${P}-ring-rim`} />
            <path d="M22 2V42M2 22H42" className={`${P}-ring-cross`} />
            <circle cx="22" cy="22" r={RING_R} className={`${P}-ring-track`} />
            <circle cx="22" cy="22" r={RING_R} className={`${P}-ring-fill`} strokeDasharray={`${length * fraction} ${length}`} transform="rotate(-90 22 22)" />
          </svg>
          <span className={`${P}-ring-pct`}>{Math.round(fraction * 100)}%</span>
        </span>
        {head}
      </div>
    );
  }
  if (variant === "segments") {
    const cells = Math.max(1, Math.floor(segments));
    const lit = meterSegmentsLit(value, max, cells);
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="segments" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        {head}
        <span className={`${P}-cells`} aria-hidden="true">
          {Array.from({ length: cells }, (_, index) => (
            <span key={index} className={`${P}-cell`} data-lit={index < lit ? "" : undefined}>
              {index < lit ? "▮" : "▯"}
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
      <span className={`${P}-bar`} aria-hidden="true">
        {"["}
        <span className={`${P}-bar-lit`}>{"█".repeat(lit)}</span>
        <span className={`${P}-bar-rest`}>{"░".repeat(BAR_CELLS - lit)}</span>
        {"]"}
      </span>
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const lit = progress === undefined ? 0 : Math.round(Math.min(1, Math.max(0, progress)) * PROGRESS_CELLS);
  const body = (
    <>
      <span className={`${P}-prompt-caret`} aria-hidden="true">
        &gt;
      </span>
      {device === "touch" ? null : <span className={`${P}-prompt-verb`}>PRESS</span>}
      <span className={`${P}-prompt-key`} data-device={device}>
        <span className={`${P}-prompt-glyph`}>{glyph}</span>
      </span>
      <span className={`${P}-prompt-label`}>{label}</span>
      <span className={`${P}-prompt-cursor`} aria-hidden="true">
        _
      </span>
      {progress === undefined ? null : (
        <span className={`${P}-prompt-progress`} aria-hidden="true">
          <span className={`${P}-prompt-progress-lit`}>{"█".repeat(lit)}</span>
          <span className={`${P}-prompt-progress-rest`}>{"░".repeat(PROGRESS_CELLS - lit)}</span>
        </span>
      )}
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
      <span className={`${P}-toast-tag`}>{TOAST_TAG[tone]}</span>
      {icon === undefined ? null : <span className={`${P}-toast-icon`}>{icon}</span>}
      {title === undefined ? null : <span className={`${P}-toast-title`}>{title}</span>}
      <span className={`${P}-toast-body`}>{children}</span>
      {count === undefined || count < 2 ? null : <span className={`${P}-toast-count`}>(x{count})</span>}
    </div>
  );
}

function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
  const primary = items.filter((item) => item.secondary !== true);
  const secondary = items.filter((item) => item.secondary === true);
  const row = (item: KitMenuProps["items"][number]) => {
    const active = item.id === activeId;
    return (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        onClick={() => onSelect(item.id)}
        {...itemProps(item.id)}
        className={`${P}-menu-item`}
        data-active={active ? "" : undefined}
        data-secondary={item.secondary === true ? "" : undefined}
      >
        <span className={`${P}-menu-cursor`} aria-hidden="true">
          {active ? ">" : " "}
        </span>
        <span className={`${P}-menu-num`}>{items.indexOf(item) + 1}.</span>
        <span className={`${P}-menu-label`}>{item.label}</span>
        {item.badge === undefined ? null : <span className={`${P}-menu-badge`}>{item.badge}</span>}
        {item.hint === undefined ? null : <span className={`${P}-menu-hint`}>{item.hint}</span>}
      </button>
    );
  };
  return (
    <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
      {primary.map(row)}
      {secondary.length === 0 ? null : <span className={`${P}-menu-rule`} aria-hidden="true" />}
      {secondary.map(row)}
    </div>
  );
}

function MinimapFrame({ children, size, shape = "square", label, heading = 0, className, style }: KitMinimapFrameProps): ReactNode {
  const degrees = ((Math.round((heading * 180) / Math.PI) % 360) + 360) % 360;
  const frameStyle: CSSProperties = { width: size, height: size, ...style };
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={frameStyle}>
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-ticks`} aria-hidden="true" />
      <span className={`${P}-map-heading`}>HDG {String(degrees).padStart(3, "0")}°</span>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-heading}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {label === undefined ? null : <span className={`${P}-map-label`}>LOC: {label}</span>}
    </div>
  );
}

const TONED = `:is(.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast)`;

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-mono); }
.${P}-btn *, .${P}-panel *, .${P}-toast *, .${P}-menu *, .${P}-map *, .${P}-prompt * { box-sizing: border-box; }
${TONED}[data-tone="good"] { --jgk-terminal-tone: var(--kit-good); }
${TONED}[data-tone="warn"] { --jgk-terminal-tone: var(--kit-warn); }
${TONED}[data-tone="bad"] { --jgk-terminal-tone: var(--kit-bad); }
${TONED}[data-tone="accent"] { --jgk-terminal-tone: var(--kit-accent); }
${TONED}[data-tone="neutral"] { --jgk-terminal-tone: var(--kit-line); }

.${P}-btn { position: relative; display: inline-block; min-height: 40px; margin: 4px 6px 4px 0; padding: 6px 8px; border: 0; background: transparent; color: var(--kit-ink); font: 700 calc(16px * var(--kit-text)) / 1.2 var(--kit-font-display); letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 0 4px var(--kit-glow); white-space: pre; cursor: pointer; }
.${P}-btn::before { content: "[ "; }
.${P}-btn::after { content: " ]"; }
.${P}-btn[data-variant="ghost"]::before, .${P}-btn[data-variant="ghost"]::after { content: ""; }
.${P}-btn[data-variant="ghost"] { text-decoration: underline dotted; text-underline-offset: 5px; }
.${P}-btn[data-tone="good"] { color: var(--kit-good); }
.${P}-btn[data-tone="warn"] { color: var(--kit-warn); }
.${P}-btn[data-tone="bad"] { color: var(--kit-bad); }
.${P}-btn[data-variant="primary"] { background: var(--kit-accent); color: var(--kit-accent-ink); text-shadow: none; }
.${P}-btn[data-variant="primary"][data-tone="bad"] { background: var(--kit-bad); color: var(--kit-surface); }
.${P}-btn[data-variant="primary"][data-tone="warn"] { background: var(--kit-warn); color: var(--kit-surface); }
.${P}-btn[data-variant="primary"][data-tone="good"] { background: var(--kit-good); color: var(--kit-accent-ink); }
.${P}-btn[data-size="sm"] { min-height: 30px; padding: 4px 6px; font-size: calc(13px * var(--kit-text)); }
.${P}-btn[data-size="lg"] { min-height: 56px; padding: 10px 8px; font-size: calc(22px * var(--kit-text)); }
.${P}-btn-icon { margin-right: 0.5ch; }
.${P}-glyph { margin-left: 1ch; color: inherit; font-weight: 700; }
.${P}-glyph::before { content: "["; }
.${P}-glyph::after { content: "]"; }
.${P}-btn:not(:disabled):hover, .${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { background: var(--kit-ink); color: var(--kit-surface); text-shadow: none; }
.${P}-btn:not(:disabled):hover .${P}-glyph, .${P}-btn:not(:disabled):active .${P}-glyph, .${P}-btn[data-pressed] .${P}-glyph { color: var(--kit-surface); }
.${P}-btn[data-variant="primary"]:not(:disabled):hover { background: var(--kit-surface); color: var(--kit-accent); box-shadow: inset 0 0 0 1px var(--kit-accent); }
.${P}-btn[data-variant="ghost"]:not(:disabled):hover { background: transparent; color: var(--kit-accent); }
.${P}-btn:disabled { opacity: 0.4; cursor: not-allowed; text-shadow: none; }
.${P}-btn:focus-visible { outline: 1px dashed var(--kit-accent); outline-offset: 3px; }
.${P}-btn:focus-visible .${P}-btn-label::after { content: "▮"; margin-left: 0.12em; animation: ${P}-blink calc(900ms * var(--kit-motion)) step-end infinite; }

.${P}-panel { position: relative; margin: 16px 6px 8px 4px; padding: 20px 16px 12px; border: 3px double var(--jgk-terminal-tone, var(--kit-line)); background: var(--kit-surface); color: var(--kit-ink); font: 400 calc(14px * var(--kit-text)) / 1.45 var(--kit-font-body); text-shadow: 0 0 4px var(--kit-glow); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(6, end) both; }
.${P}-panel::after { content: ""; position: absolute; inset: 0; z-index: 3; pointer-events: none; background: repeating-linear-gradient(180deg, transparent 0 2px, rgba(157, 255, 138, 0.07) 2px 3px); }
.${P}-panel[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) steps(3, end) both; pointer-events: none; }
.${P}-panel-head { position: absolute; top: -2px; left: 12px; z-index: 4; display: inline-flex; align-items: center; gap: 10px; max-width: calc(100% - 24px); padding: 0 6px; background: var(--kit-surface); transform: translateY(-50%); white-space: nowrap; overflow: hidden; }
.${P}-eyebrow { font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
.${P}-title { color: var(--jgk-terminal-tone, var(--kit-ink)); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: pre; }
.${P}-title::before { content: "┤ "; }
.${P}-title::after { content: " ├"; }
.${P}-aside { font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; }
.${P}-panel-body { position: relative; z-index: 1; }
.${P}-panel-foot { position: relative; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--kit-line); }
.${P}-panel[data-variant="hud"] { padding: 18px 12px 10px; font-size: calc(13px * var(--kit-text)); }
.${P}-panel[data-variant="card"] { padding: 24px 22px 18px; }
.${P}-panel[data-variant="pane"] { padding: 26px 26px 20px; font-size: calc(15px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"] { margin: 16px 6px 8px 4px; min-width: 320px; padding: 0; border-width: 5px; font-size: calc(15px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"] > .${P}-panel-head { position: static; transform: none; max-width: none; overflow: visible; padding: 6px 12px; background: var(--jgk-terminal-tone, var(--kit-ink)); color: var(--kit-surface); text-shadow: none; }
.${P}-panel[data-variant="dialog"] > .${P}-panel-head .${P}-eyebrow { color: var(--kit-surface); opacity: 1; }
.${P}-panel[data-variant="dialog"] > .${P}-panel-head .${P}-title { color: var(--kit-surface); }
.${P}-panel[data-variant="dialog"] > .${P}-panel-head .${P}-title::before, .${P}-panel[data-variant="dialog"] > .${P}-panel-head .${P}-title::after { content: ""; }
.${P}-panel[data-variant="dialog"] > .${P}-panel-head .${P}-title { font-size: calc(16px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"] .${P}-panel-body { padding: 16px 18px 6px; }
.${P}-panel[data-variant="dialog"] .${P}-panel-foot { margin: 0; padding: 12px 18px 16px; border-top: 1px dashed var(--kit-line); }
.${P}-panel[data-variant="strip"] { display: flex; align-items: center; gap: 14px; margin: 0; padding: 4px 14px; border: 0; border-top: 3px double var(--jgk-terminal-tone, var(--kit-line)); border-bottom: 3px double var(--jgk-terminal-tone, var(--kit-line)); font-size: calc(14px * var(--kit-text)); }
.${P}-panel[data-variant="strip"] > .${P}-panel-head { position: static; transform: none; max-width: none; overflow: visible; padding: 0; background: none; }
.${P}-panel[data-variant="strip"] .${P}-title::before { content: "■ "; }
.${P}-panel[data-variant="strip"] .${P}-title::after { content: ""; }

.${P}-meter { display: grid; gap: 4px; min-width: 150px; font: 400 calc(14px * var(--kit-text)) / 1.2 var(--kit-font-mono); text-shadow: 0 0 4px var(--kit-glow); }
.${P}-meter[data-size="sm"] { font-size: calc(12px * var(--kit-text)); }
.${P}-meter[data-size="lg"] { font-size: calc(18px * var(--kit-text)); }
.${P}-meter-text { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.${P}-meter-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.${P}-meter-readout { font-variant-numeric: tabular-nums; }
.${P}-bar { display: block; overflow: hidden; white-space: pre; letter-spacing: 0; }
.${P}-bar-lit { color: var(--jgk-terminal-tone, var(--kit-accent)); }
.${P}-bar-rest { color: var(--kit-line); }
.${P}-cells { display: flex; gap: 0.3ch; white-space: pre; }
.${P}-cell { color: var(--kit-line); }
.${P}-cell[data-lit] { color: var(--jgk-terminal-tone, var(--kit-accent)); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto auto; align-items: center; justify-content: start; gap: 12px; min-width: 0; }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 2px; }
.${P}-ring { position: relative; display: block; width: 64px; height: 64px; }
.${P}-meter[data-size="sm"] .${P}-ring { width: 48px; height: 48px; }
.${P}-meter[data-size="lg"] .${P}-ring { width: 88px; height: 88px; }
.${P}-ring-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.${P}-ring-rim { fill: var(--kit-surface); stroke: var(--kit-line); stroke-width: 1; stroke-dasharray: 1 3; }
.${P}-ring-cross { fill: none; stroke: var(--kit-line); stroke-width: 0.6; }
.${P}-ring-track { fill: none; stroke: var(--kit-line); stroke-width: 1; stroke-dasharray: 1 2; }
.${P}-ring-fill { fill: none; stroke: var(--jgk-terminal-tone, var(--kit-accent)); stroke-width: 3; }
.${P}-ring-pct { position: absolute; inset: 0; display: grid; place-items: center; font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); }

.${P}-prompt { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0 0.6ch; max-width: 100%; margin: 2px 0; padding: 6px 10px; border: 1px solid var(--kit-line); border-left-width: 4px; background: var(--kit-surface); color: var(--kit-ink); font: inherit; text-align: left; text-shadow: 0 0 4px var(--kit-glow); cursor: default; animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(6, end) both; }
button.${P}-prompt { cursor: pointer; }
button.${P}-prompt:focus-visible { outline: 1px dashed var(--kit-accent); outline-offset: 3px; }
button.${P}-prompt:not(:disabled):hover { background: var(--kit-surface-alt); }
.${P}-prompt[data-device="touch"] { padding: 8px 12px; border: 3px double var(--kit-line); }
.${P}-prompt-caret { color: var(--jgk-terminal-tone, var(--kit-accent)); font-weight: 700; margin-right: 0.2ch; }
.${P}-prompt-verb { font-weight: 700; letter-spacing: 0.04em; }
.${P}-prompt-key { display: inline-block; white-space: pre; font-weight: 700; }
.${P}-prompt-key::before { content: "["; }
.${P}-prompt-key::after { content: "]"; }
.${P}-prompt-key[data-device="gamepad"]::before { content: "("; }
.${P}-prompt-key[data-device="gamepad"]::after { content: ")"; }
.${P}-prompt-key[data-device="touch"]::before { content: "[ "; }
.${P}-prompt-key[data-device="touch"]::after { content: " ]"; }
.${P}-prompt-glyph { display: inline-block; padding: 0 0.35ch; background: var(--jgk-terminal-tone, var(--kit-accent)); color: var(--kit-accent-ink); text-transform: uppercase; text-shadow: none; }
.${P}-prompt-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.${P}-prompt-cursor { color: var(--jgk-terminal-tone, var(--kit-accent)); font-weight: 700; }
.${P}-prompt-progress { flex-basis: 100%; white-space: pre; margin-top: 4px; letter-spacing: 0; }
.${P}-prompt-progress-lit { color: var(--jgk-terminal-tone, var(--kit-accent)); }
.${P}-prompt-progress-rest { color: var(--kit-line); }

.${P}-toast { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 10px; width: max-content; max-width: 440px; margin: 4px 0; padding: 7px 12px 7px 10px; border: 1px solid var(--jgk-terminal-tone, var(--kit-line)); border-left-width: 6px; background: var(--kit-surface); color: var(--kit-ink); font: 400 calc(14px * var(--kit-text)) / 1.35 var(--kit-font-body); text-shadow: 0 0 4px var(--kit-glow); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(6, end) both; }
.${P}-toast[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) steps(3, end) both; pointer-events: none; }
.${P}-toast[data-tone="bad"] { border-width: 3px; border-style: double; border-left-width: 3px; border-color: var(--kit-bad); }
.${P}-toast-tag { font-weight: 700; white-space: pre; color: var(--jgk-terminal-tone, var(--kit-accent)); }
.${P}-toast[data-tone="warn"] .${P}-toast-tag, .${P}-toast[data-tone="bad"] .${P}-toast-tag { background: var(--jgk-terminal-tone); color: var(--kit-surface); text-shadow: none; }
.${P}-toast-icon { margin-right: 0.4ch; }
.${P}-toast-title { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.${P}-toast-body { display: inline-block; animation: ${P}-type calc(360ms * var(--kit-motion)) steps(16, end) both; }
.${P}-toast[data-tone="bad"] .${P}-toast-body { color: var(--kit-bad); }
.${P}-toast-count { font-weight: 700; color: var(--jgk-terminal-tone, var(--kit-ink)); }

.${P}-menu { display: grid; gap: 0; min-width: 280px; padding: 6px; border: 3px double var(--kit-line); background: var(--kit-surface); text-shadow: 0 0 4px var(--kit-glow); animation: ${P}-in calc(var(--kit-enter-ms) * var(--kit-motion)) steps(6, end) both; }
.${P}-menu[data-variant="title"] { padding: 14px 6px 8px; }
.${P}-menu[data-variant="title"]::before { content: ""; display: block; margin: 0 6px 10px; border-top: 3px double var(--kit-line); }
.${P}-menu-item { position: relative; display: flex; align-items: baseline; gap: 1ch; width: 100%; min-width: 260px; margin: 0; padding: 6px 12px; border: 0; background: transparent; color: var(--kit-ink); font: 700 calc(16px * var(--kit-text)) / 1.2 var(--kit-font-display); letter-spacing: 0.04em; text-transform: uppercase; text-align: left; white-space: pre; cursor: pointer; }
.${P}-menu[data-variant="title"] .${P}-menu-item { font-size: calc(24px * var(--kit-text)); padding: 8px 14px; }
.${P}-menu-item[data-active] { background: var(--kit-ink); color: var(--kit-surface); text-shadow: none; }
.${P}-menu-item:not([data-active]):not(:disabled):hover { color: var(--kit-accent); }
.${P}-menu-item[data-secondary] { font-size: calc(14px * var(--kit-text)); font-weight: 400; }
.${P}-menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
.${P}-menu-item:focus-visible { outline: 1px dashed var(--kit-accent); outline-offset: -4px; }
.${P}-menu-cursor { display: inline-block; width: 1ch; font-weight: 700; }
.${P}-menu-num { display: inline-block; min-width: 3ch; }
.${P}-menu-label { flex: 1 1 auto; }
.${P}-menu-badge { color: var(--kit-bad); font-size: calc(12px * var(--kit-text)); font-weight: 700; }
.${P}-menu-badge::before { content: "["; }
.${P}-menu-badge::after { content: "]"; }
.${P}-menu-hint { margin-left: 2ch; font-size: calc(12px * var(--kit-text)); font-weight: 400; opacity: 0.8; text-transform: none; }
.${P}-menu-rule { display: block; height: 16px; margin: 4px 12px; overflow: hidden; white-space: nowrap; color: var(--kit-line); font-size: calc(12px * var(--kit-text)); line-height: 16px; }
.${P}-menu-rule::before { content: "----------------------------------------------------------------------------------------------------------------------------------------------------------------"; }

.${P}-map { position: relative; flex: none; margin: 30px 22px 34px 14px; }
.${P}-map-window { position: absolute; inset: 0; overflow: hidden; border: 3px double var(--kit-line); background: var(--kit-surface-alt); }
.${P}-map-window > * { display: block; width: 100%; height: 100%; }
.${P}-map-window::before { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: repeating-linear-gradient(0deg, transparent 0 17px, rgba(157, 255, 138, 0.2) 17px 18px), repeating-linear-gradient(90deg, transparent 0 17px, rgba(157, 255, 138, 0.2) 17px 18px); }
.${P}-map-window::after { content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none; background: linear-gradient(var(--kit-accent), var(--kit-accent)) center / 1px 100% no-repeat, linear-gradient(var(--kit-accent), var(--kit-accent)) center / 100% 1px no-repeat; opacity: 0.45; }
.${P}-map[data-shape="circle"] .${P}-map-window { border-radius: 50%; }
.${P}-map[data-shape="circle"] .${P}-map-ticks { display: none; }
.${P}-map-ticks { position: absolute; inset: -6px; pointer-events: none; background: linear-gradient(var(--kit-ink), var(--kit-ink)) left top / 14px 3px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) left top / 3px 14px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) right top / 14px 3px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) right top / 3px 14px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) left bottom / 14px 3px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) left bottom / 3px 14px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) right bottom / 14px 3px no-repeat, linear-gradient(var(--kit-ink), var(--kit-ink)) right bottom / 3px 14px no-repeat; }
.${P}-map-heading { position: absolute; left: 0; top: -24px; font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; white-space: nowrap; text-shadow: 0 0 4px var(--kit-glow); }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; transition: transform calc(200ms * var(--kit-motion)) steps(4, end); }
.${P}-map-north > span { position: absolute; left: 50%; top: -22px; padding: 0 4px; transform: translateX(-50%); background: var(--kit-ink); color: var(--kit-surface); font: 700 calc(12px * var(--kit-text)) / 1.4 var(--kit-font-display); text-shadow: none; }
.${P}-map-label { position: absolute; left: 50%; bottom: -30px; max-width: 100%; padding: 3px 8px 2px; transform: translateX(-50%); border: 1px solid var(--kit-line); background: var(--kit-surface); color: var(--kit-ink); font: 700 calc(12px * var(--kit-text)) / 1.2 var(--kit-font-display); letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 0 4px var(--kit-glow); }

@keyframes ${P}-in { from { clip-path: inset(-24px -24px 100% -24px); } to { clip-path: inset(-24px -24px -24px -24px); } }
@keyframes ${P}-out { 0% { opacity: 1; clip-path: inset(-24px -24px -24px -24px); } 34% { opacity: 0.25; clip-path: inset(-24px -24px -24px -24px); } 67% { opacity: 1; clip-path: inset(-24px -24px -24px -24px); } 100% { opacity: 0; clip-path: inset(48% -24px 48% -24px); } }
@keyframes ${P}-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes ${P}-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
`;

/**
 * Mainframe: a brutalist phosphor terminal. Monospace everywhere, uppercase labels, double-ruled frames with the title set into the rule, ASCII meters, log-line toasts and a block cursor.
 *
 * @capability ui-kit-terminal brutalist phosphor terminal UI kit: double rules, ASCII meters, log toasts, scanlines, stepped reveals, square-wave beeps
 */
export const terminalKit: UiKit = {
  id: "terminal",
  name: "Mainframe",
  description: "Brutalist phosphor terminal: monospace, double rules, ASCII meters, log-line toasts and a blinking block cursor.",
  tokens: {
    // Corner of engine controls (settings rows, tabs) drawn on this kit's panes.
    radius: "0px",
    ink: "#9dff8a",
    surface: "#050a05",
    surfaceAlt: "#0c1a0c",
    accent: "#9dff8a",
    accentInk: "#021002",
    good: "#9dff8a",
    warn: "#ffd25e",
    bad: "#ff5f56",
    line: "#3c8f34",
    scrim: "rgba(0, 6, 0, 0.78)",
    glow: "rgba(157, 255, 138, 0.45)",
    fontDisplay: "\"Consolas\", \"Lucida Console\", \"Menlo\", \"Courier New\", monospace",
    fontBody: "\"Consolas\", \"Lucida Console\", \"Menlo\", \"Courier New\", monospace",
    fontMono: "\"Consolas\", \"Lucida Console\", \"Menlo\", \"Courier New\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 200, exitMs: 120, ease: "steps(6, end)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.4, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "highpass", filterFreq: 2400, duration: 0.02, gain: 0.3 }, { kind: "tone", wave: "square", freq: 1500, duration: 0.012, gain: 0.08 }] } }),
    hover: kitCueSound("hover", { gain: 0.25, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "square", freq: 1800, duration: 0.012, gain: 0.07 }] } }),
    open: kitCueSound("open", { gain: 0.4, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 1200, duration: 0.05, gain: 0.14 }, { kind: "tone", wave: "square", freq: 1800, duration: 0.07, gain: 0.14, delay: 0.05 }] } }),
    close: kitCueSound("close", { gain: 0.4, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 1200, duration: 0.05, gain: 0.14 }, { kind: "tone", wave: "square", freq: 700, duration: 0.07, gain: 0.14, delay: 0.05 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.4, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 1200, duration: 0.06, gain: 0.14 }, { kind: "tone", wave: "square", freq: 1200, duration: 0.06, gain: 0.14, delay: 0.09 }, { kind: "tone", wave: "square", freq: 1600, duration: 0.1, gain: 0.16, delay: 0.18 }] } }),
    deny: kitCueSound("deny", { gain: 0.5, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 110, duration: 0.22, gain: 0.22, attack: 0.005 }] } }),
    notify: kitCueSound("notify", { gain: 0.4, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "square", freq: 1200, duration: 0.05, gain: 0.12 }, { kind: "tone", wave: "square", freq: 1200, duration: 0.05, gain: 0.12, delay: 0.1 }] } }),
  },
};
