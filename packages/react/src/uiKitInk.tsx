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

const P = "jgk-ink";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
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
          <span className={`${P}-head-main`}>
            {eyebrow === undefined ? null : <span className={`${P}-eyebrow`}>{eyebrow}</span>}
            {title === undefined ? null : <span className={`${P}-title`}>{title}</span>}
          </span>
          {aside === undefined ? null : <span className={`${P}-aside`}>{aside}</span>}
        </header>
      ) : null}
      {children === undefined ? null : <div className={`${P}-panel-body`}>{children}</div>}
      {footer === undefined ? null : <footer className={`${P}-panel-foot`}>{footer}</footer>}
    </Tag>
  );
}

function readoutText(value: number, max: number, readout: KitMeterProps["readout"]): ReactNode {
  if (readout === true) return `${Math.round(value)} / ${Math.round(max)}`;
  return readout === false || readout === undefined ? null : readout;
}

function Meter({ value, max = 1, label, readout, tone = "accent", variant = "bar", segments = 10, size = "md", className, style }: KitMeterProps): ReactNode {
  const fraction = meterFraction(value, max);
  const text = readoutText(value, max, readout);
  if (variant === "ring") {
    const radius = 16;
    const length = 2 * Math.PI * radius;
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <svg className={`${P}-ring`} viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r={radius} className={`${P}-ring-track`} />
          <circle cx="22" cy="22" r={radius} className={`${P}-ring-fill`} strokeDasharray={`${length * fraction} ${length}`} transform="rotate(-90 22 22)" />
        </svg>
        {label === undefined && text === null ? null : (
          <span className={`${P}-meter-text`}>
            {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
            {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
          </span>
        )}
      </div>
    );
  }
  const lit = meterSegmentsLit(value, max, segments);
  return (
    <div className={cx(`${P}-meter`, className)} data-variant={variant} data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {label === undefined && text === null ? null : (
        <span className={`${P}-meter-text`}>
          {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
          {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
        </span>
      )}
      {variant === "segments" ? (
        <span className={`${P}-cells`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} className={`${P}-cell`} data-lit={index < lit ? "" : undefined} />
          ))}
        </span>
      ) : (
        <span className={`${P}-track`}>
          <span className={`${P}-fill`} style={{ width: `${fraction * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const ring = progress === undefined ? undefined : ({ "--jgk-ink-progress": `${Math.round(Math.min(1, Math.max(0, progress)) * 360)}deg` } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-prompt-glyph`} data-device={device} style={ring}>
        {glyph}
      </span>
      <span className={`${P}-prompt-label`}>{label}</span>
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
      {count === undefined || count < 2 ? null : <span className={`${P}-toast-count`}>×{count}</span>}
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

function MinimapFrame({ children, size, shape = "square", label, heading, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-(heading ?? 0)}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {label === undefined ? null : <span className={`${P}-map-label`}>{label}</span>}
    </div>
  );
}

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn *, .${P}-panel *, .${P}-toast *, .${P}-menu * { box-sizing: border-box; }

.${P}-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 6px 18px; border: 3px solid var(--kit-line); border-radius: 3px 9px 4px 8px / 8px 3px 9px 4px; background: var(--kit-surface); color: var(--kit-ink); font: 400 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; transform: skewX(-7deg); box-shadow: 4px 4px 0 var(--kit-line); transition: transform calc(120ms * var(--kit-motion)) var(--kit-ease), box-shadow calc(120ms * var(--kit-motion)) var(--kit-ease); }
.${P}-btn > * { transform: skewX(7deg); }
.${P}-btn[data-variant="primary"] { background: radial-gradient(var(--kit-halftone) 1.1px, transparent 1.5px) 0 0 / 6px 6px, var(--kit-accent); color: var(--kit-accent-ink); }
.${P}-btn[data-tone="bad"] { background: var(--kit-bad); color: var(--kit-surface); }
.${P}-btn[data-tone="good"] { background: var(--kit-good); }
.${P}-btn[data-size="sm"] { min-height: 30px; padding: 3px 12px; font-size: calc(14px * var(--kit-text)); box-shadow: 3px 3px 0 var(--kit-line); }
.${P}-btn[data-size="lg"] { min-height: 54px; padding: 8px 28px; font-size: calc(24px * var(--kit-text)); box-shadow: 6px 6px 0 var(--kit-line); }
.${P}-btn[data-variant="ghost"] { background: transparent; border-color: transparent; box-shadow: none; text-decoration: underline wavy var(--kit-accent) 2px; text-underline-offset: 5px; }
@media (hover: hover) { .${P}-btn:not(:disabled):hover { transform: skewX(-7deg) rotate(-1.5deg) scale(1.04); } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: skewX(-7deg) translate(3px, 3px); box-shadow: 1px 1px 0 var(--kit-line); }
.${P}-btn:focus-visible { outline: 3px dashed var(--kit-accent); outline-offset: 4px; }
.${P}-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 5px; border: 2px solid var(--kit-line); border-radius: 50%; background: var(--kit-surface); color: var(--kit-ink); font: 400 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0; }

.${P}-panel { position: relative; padding: 12px 14px; border: 3px solid var(--kit-line); border-radius: 2px 6px 3px 5px / 5px 2px 6px 3px; background: radial-gradient(var(--kit-halftone) 0.9px, transparent 1.3px) 0 0 / 5px 5px, var(--kit-surface); box-shadow: 5px 5px 0 var(--kit-line); transform: rotate(-0.4deg); animation: ${P}-pop calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; pointer-events: none; }
.${P}-panel[data-variant="hud"] { padding: 10px 12px 9px; }
.${P}-panel[data-variant="card"] { padding: 18px 20px; transform: rotate(0.5deg); }
.${P}-panel[data-variant="dialog"] { padding: 26px 30px 22px; border-width: 4px; box-shadow: 9px 9px 0 var(--kit-line); transform: rotate(-1deg); }
.${P}-panel[data-variant="pane"] { padding: 20px 22px; transform: none; }
.${P}-panel[data-variant="strip"] { display: flex; align-items: center; gap: 12px; padding: 6px 16px; transform: skewX(-10deg); background: var(--kit-accent); }
.${P}-panel[data-variant="strip"] > * { transform: skewX(10deg); }
/* The aside (distance, count) keeps its own column; the eyebrow and title share the rest, and a title that
   does not fit beside the eyebrow drops under it at full width, wrapping between words. */
.${P}-panel-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; margin: -24px 0 8px -4px; }
.${P}-head-main { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 10px; min-width: 0; }
.${P}-panel[data-variant="strip"] .${P}-panel-head { margin: 0; }
.${P}-eyebrow { font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 7px; border: 2px solid var(--kit-line); background: var(--kit-surface); transform: rotate(-3deg); }
.${P}-title { max-width: 100%; overflow-wrap: break-word; padding: 4px 10px 3px; border: 3px solid var(--kit-line); background: var(--kit-accent); color: var(--kit-accent-ink); font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; transform: skewX(-10deg) rotate(-1.5deg); box-shadow: 3px 3px 0 var(--kit-line); }
.${P}-panel[data-variant="dialog"] .${P}-title { font-size: calc(34px * var(--kit-text)); padding: 6px 16px 4px; color: var(--kit-surface); background: var(--kit-bad); -webkit-text-stroke: 1.5px var(--kit-line); paint-order: stroke fill; text-shadow: 3px 3px 0 var(--kit-line); }
.${P}-panel[data-tone="good"] .${P}-title { background: var(--kit-good); }
.${P}-panel[data-tone="warn"] .${P}-title { background: var(--kit-warn); }
.${P}-panel[data-tone="bad"] .${P}-title { background: var(--kit-bad); color: var(--kit-surface); }
.${P}-panel[data-tone="neutral"] .${P}-title { background: var(--kit-surface); color: var(--kit-ink); }
.${P}-aside { margin-left: 10px; white-space: nowrap; font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-panel-body { font: 700 calc(14px * var(--kit-text)) / 1.3 var(--kit-font-body); text-transform: uppercase; letter-spacing: 0.02em; }
.${P}-panel-foot { margin-top: 12px; padding-top: 8px; border-top: 3px dotted var(--kit-line); display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

.${P}-meter { display: grid; gap: 4px; min-width: 120px; }
.${P}-meter-text { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.${P}-meter-label { font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); text-transform: uppercase; letter-spacing: 0.06em; }
.${P}-meter-readout { font: 400 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; }
.${P}-track { position: relative; display: block; height: 16px; border: 3px solid var(--kit-line); background: var(--kit-surface-alt); transform: skewX(-14deg); overflow: hidden; box-shadow: 3px 3px 0 var(--kit-line); }
.${P}-meter[data-size="sm"] .${P}-track { height: 11px; border-width: 2px; }
.${P}-meter[data-size="lg"] .${P}-track { height: 24px; }
.${P}-fill { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(-45deg, transparent 0 5px, rgba(0,0,0,0.18) 5px 8px), var(--jgk-ink-tone, var(--kit-accent)); border-right: 3px solid var(--kit-line); transition: width calc(260ms * var(--kit-motion)) var(--kit-ease); }
.${P}-cells { display: flex; gap: 4px; }
.${P}-cell { flex: 1; height: 14px; border: 2.5px solid var(--kit-line); background: var(--kit-surface); transform: skewX(-14deg); }
.${P}-cell[data-lit] { background: var(--jgk-ink-tone, var(--kit-accent)); box-shadow: 2px 2px 0 var(--kit-line); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; min-width: 0; }
.${P}-ring { width: 46px; height: 46px; }
.${P}-meter[data-size="lg"] .${P}-ring { width: 64px; height: 64px; }
.${P}-ring-track { fill: var(--kit-surface); stroke: var(--kit-line); stroke-width: 9; }
.${P}-ring-fill { fill: none; stroke: var(--jgk-ink-tone, var(--kit-accent)); stroke-width: 5; transition: stroke-dasharray calc(260ms * var(--kit-motion)) var(--kit-ease); }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="good"] { --jgk-ink-tone: var(--kit-good); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="warn"] { --jgk-ink-tone: var(--kit-warn); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="bad"] { --jgk-ink-tone: var(--kit-bad); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="neutral"] { --jgk-ink-tone: var(--kit-surface); }

.${P}-prompt { display: inline-flex; align-items: center; gap: 0; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; cursor: default; animation: ${P}-pop calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
button.${P}-prompt { cursor: pointer; }
.${P}-prompt-glyph { position: relative; z-index: 1; display: grid; place-items: center; min-width: 42px; height: 42px; padding: 0 8px; border: 3px solid var(--kit-line); border-radius: 50%; background: conic-gradient(var(--jgk-ink-tone, var(--kit-accent)) var(--jgk-ink-progress, 0deg), var(--kit-surface) 0); font: 400 calc(19px * var(--kit-text)) / 1 var(--kit-font-display); box-shadow: 3px 3px 0 var(--kit-line); }
.${P}-prompt-glyph[data-device="touch"] { border-style: dashed; }
.${P}-prompt-label { margin-left: -8px; padding: 6px 14px 5px 18px; border: 3px solid var(--kit-line); background: var(--jgk-ink-tone, var(--kit-accent)); color: var(--kit-accent-ink); font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; transform: skewX(-10deg); box-shadow: 3px 3px 0 var(--kit-line); }

.${P}-toast { position: relative; display: flex; align-items: center; gap: 10px; max-width: 340px; padding: 10px 16px; border: 3px solid var(--kit-line); border-radius: 46% 54% 48% 52% / 58% 46% 54% 42%; background: var(--kit-surface); box-shadow: 4px 4px 0 var(--kit-line); animation: ${P}-pop calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-toast::after { content: ""; position: absolute; left: 22%; bottom: -14px; width: 18px; height: 16px; background: var(--kit-surface); border-right: 3px solid var(--kit-line); border-bottom: 3px solid var(--kit-line); transform: skewX(36deg); }
.${P}-toast[data-state="closed"] { animation: ${P}-out calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; }
.${P}-toast[data-tone="bad"], .${P}-toast[data-tone="warn"] { border-radius: 2px; clip-path: polygon(0 12%, 8% 0, 18% 10%, 30% 0, 42% 9%, 55% 0, 66% 10%, 78% 0, 90% 9%, 100% 0, 96% 50%, 100% 100%, 88% 90%, 76% 100%, 64% 90%, 50% 100%, 38% 90%, 26% 100%, 14% 90%, 0 100%, 4% 50%); padding: 16px 26px; background: var(--jgk-ink-tone); box-shadow: none; }
.${P}-toast[data-tone="bad"]::after, .${P}-toast[data-tone="warn"]::after { display: none; }
.${P}-toast[data-tone="bad"] .${P}-toast-body { color: var(--kit-surface); }
.${P}-toast-icon { font-size: calc(20px * var(--kit-text)); }
.${P}-toast-text { display: grid; gap: 2px; }
.${P}-toast-title { font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; }
.${P}-toast-body { font: 700 calc(13px * var(--kit-text)) / 1.25 var(--kit-font-body); text-transform: uppercase; }
.${P}-toast-count { position: absolute; top: -12px; right: -10px; padding: 3px 7px; border: 2px solid var(--kit-line); background: var(--kit-bad); color: var(--kit-surface); font: 400 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); transform: rotate(10deg); }

.${P}-menu { display: grid; gap: 10px; justify-items: start; }
.${P}-menu-item { position: relative; display: inline-flex; align-items: baseline; gap: 12px; min-width: 240px; padding: 9px 20px 7px; border: 3px solid var(--kit-line); background: var(--kit-surface); color: var(--kit-ink); font: 400 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; text-align: left; cursor: pointer; transform: skewX(-8deg); box-shadow: 4px 4px 0 var(--kit-line); transition: transform calc(140ms * var(--kit-motion)) var(--kit-ease), background-color calc(140ms * var(--kit-motion)) linear; }
.${P}-menu-item > * { transform: skewX(8deg); }
.${P}-menu[data-variant="title"] .${P}-menu-item { min-width: 300px; font-size: calc(28px * var(--kit-text)); }
.${P}-menu-item[data-active] { background: radial-gradient(var(--kit-halftone) 1.1px, transparent 1.5px) 0 0 / 6px 6px, var(--kit-accent); color: var(--kit-accent-ink); transform: skewX(-8deg) translateX(14px) rotate(-1deg); box-shadow: 7px 7px 0 var(--kit-line); }
.${P}-menu-item[data-active]::before { content: ""; position: absolute; left: -30px; top: 50%; width: 20px; height: 20px; margin-top: -10px; background: var(--kit-line); clip-path: polygon(0 0, 100% 50%, 0 100%, 25% 50%); transform: skewX(8deg); }
.${P}-menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-menu-item[data-secondary] { min-width: 0; padding: 5px 14px 4px; font-size: calc(16px * var(--kit-text)); box-shadow: 2px 2px 0 var(--kit-line); }
.${P}-menu-item:focus-visible { outline: 3px dashed var(--kit-accent); outline-offset: 5px; }
.${P}-menu-hint { font: 700 calc(12px * var(--kit-text)) / 1.2 var(--kit-font-body); letter-spacing: 0.02em; opacity: 0.8; }
.${P}-menu-badge { padding: 2px 6px; border: 2px solid var(--kit-line); background: var(--kit-bad); color: var(--kit-surface); font-size: calc(13px * var(--kit-text)); }
.${P}-menu-rule { width: 70%; height: 0; border-top: 3px dotted var(--kit-line); margin: 4px 0; }

.${P}-map { position: relative; flex: none; }
.${P}-map-window { position: absolute; inset: 0; overflow: hidden; border: 4px solid var(--kit-line); background: var(--kit-surface-alt); box-shadow: 5px 5px 0 var(--kit-line); }
.${P}-map[data-shape="circle"] .${P}-map-window { border-radius: 50%; }
.${P}-map[data-shape="square"] .${P}-map-window { border-radius: 2px 7px 3px 6px / 6px 2px 7px 3px; transform: rotate(-0.8deg); }
.${P}-map-north { position: absolute; top: -10px; right: -8px; display: grid; place-items: center; width: 30px; height: 30px; border: 3px solid var(--kit-line); border-radius: 50%; background: var(--kit-accent); font: 400 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-map-label { position: absolute; left: 50%; bottom: -14px; max-width: 92%; padding: 4px 10px 3px; border: 3px solid var(--kit-line); background: var(--kit-surface); font: 400 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transform: translateX(-50%) skewX(-8deg) rotate(-1deg); box-shadow: 3px 3px 0 var(--kit-line); }

@keyframes ${P}-pop { 0% { opacity: 0; scale: 0.6; rotate: -6deg; } 70% { opacity: 1; scale: 1.06; rotate: 1.5deg; } 100% { scale: 1; rotate: 0deg; } }
@keyframes ${P}-out { to { opacity: 0; scale: 0.7; rotate: 8deg; } }
`;

/**
 * Inkline: a comic-book caper. Heavy wobbly ink outlines, hard offset shadows, halftone dots,
 * skewed caption tabs, speech-balloon toasts and jagged shout bursts; panels pop in with overshoot.
 *
 * @capability ui-kit-ink comic ink UI kit — outlines, halftone, caption tabs, speech balloons, pop motion, marker sounds
 */
export const inkKit: UiKit = {
  id: "ink",
  name: "Inkline",
  description: "Comic-book ink: wobbly outlines, hard shadows, halftone, caption tabs and speech balloons.",
  tokens: {
    ink: "#141218",
    surface: "#fffaf0",
    surfaceAlt: "#efe2c4",
    accent: "#ffd23f",
    accentInk: "#141218",
    good: "#41d07a",
    warn: "#ff9f1c",
    bad: "#ef2b4a",
    line: "#141218",
    scrim: "rgba(20, 18, 24, 0.55)",
    halftone: "rgba(20, 18, 24, 0.2)",
    fontDisplay: "\"Bangers\", \"Luckiest Guy\", Impact, \"Haettenschweiler\", \"Arial Narrow Bold\", sans-serif",
    fontBody: "\"Comic Neue\", \"Comic Sans MS\", \"Chalkboard SE\", \"Marker Felt\", cursive",
    fontMono: "\"Courier New\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 280, exitMs: 180, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sine", freq: 880, slideTo: 330, duration: 0.07, gain: 0.34, attack: 0.002 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 3200, duration: 0.03, gain: 0.08 }] } }),
    open: kitCueSound("open", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 220, slideTo: 660, duration: 0.14, gain: 0.3 }, { kind: "noise", filterType: "highpass", filterFreq: 2800, duration: 0.06, gain: 0.05 }] } }),
    close: kitCueSound("close", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1800, duration: 0.09, gain: 0.12 }, { kind: "tone", wave: "triangle", freq: 520, slideTo: 200, duration: 0.1, gain: 0.2 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "square", freq: 523, duration: 0.08, gain: 0.12 }, { kind: "tone", wave: "square", freq: 659, duration: 0.08, gain: 0.12, delay: 0.07 }, { kind: "tone", wave: "triangle", freq: 1047, duration: 0.24, gain: 0.22, delay: 0.14 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "square", freq: 160, slideTo: 90, duration: 0.18, gain: 0.18, attack: 0.003 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 1568, duration: 0.18, gain: 0.2 }, { kind: "tone", wave: "triangle", freq: 2093, duration: 0.26, gain: 0.16, delay: 0.08 }] } }),
  },
};
