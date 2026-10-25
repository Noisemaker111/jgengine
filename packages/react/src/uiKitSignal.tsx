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

const P = "jgk-signal";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function readoutText(value: number, max: number, readout: KitMeterProps["readout"]): ReactNode {
  if (readout === true) return `${Math.round(value)} / ${Math.round(max)}`;
  return readout === false || readout === undefined ? null : readout;
}

/** Corner rivets: one dot in each corner of an enamel plate, as background layers. */
const RIVET = "radial-gradient(circle, #eef2ef 0 1.6px, rgba(0, 0, 0, 0.4) 2px 2.8px, transparent 3.2px)";
const RIVETS = `${RIVET} 4px 4px / 14px 14px no-repeat, ${RIVET} right 4px top 4px / 14px 14px no-repeat, ${RIVET} left 4px bottom 4px / 14px 14px no-repeat, ${RIVET} right 4px bottom 4px / 14px 14px no-repeat`;
/** Enamel sheen: a soft light top and a darker lower edge. */
const SHEEN = "linear-gradient(180deg, rgba(255, 255, 255, 0.17), rgba(255, 255, 255, 0) 42%, rgba(0, 0, 0, 0.12))";
/** Split-flap seam across the middle of a board. */
const SEAM = "linear-gradient(180deg, transparent calc(50% - 1px), rgba(0, 0, 0, 0.45) 50%, transparent calc(50% + 1px))";

const SHIELD = "polygon(0 0, 100% 0, 100% 58%, 50% 100%, 0 58%)";

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
  const text = readoutText(value, max, readout);
  const caption =
    label === undefined && text === null ? null : (
      <span className={`${P}-meter-text`}>
        {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
        {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
      </span>
    );
  const common = {
    className: cx(`${P}-meter`, className),
    "data-variant": variant,
    "data-size": size,
    "data-tone": tone,
    style,
    role: "meter",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max,
  };
  if (variant === "ring") {
    const dots = 30;
    return (
      <div {...common}>
        <svg className={`${P}-ring`} viewBox="0 0 50 50" aria-hidden="true">
          {Array.from({ length: dots }, (_, index) => {
            const angle = (index / dots) * 2 * Math.PI - Math.PI / 2;
            return <circle key={index} className={`${P}-dot`} data-lit={index / dots < fraction ? "" : undefined} cx={25 + Math.cos(angle) * 19} cy={25 + Math.sin(angle) * 19} r={1.9} />;
          })}
          <circle cx="25" cy="25" r="9" className={`${P}-ring-core`} />
        </svg>
        {caption}
      </div>
    );
  }
  if (variant === "segments") {
    const lit = meterSegmentsLit(value, max, segments);
    return (
      <div {...common}>
        {caption}
        <span className={`${P}-lamps`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} className={`${P}-lamp`} data-lit={index < lit ? "" : undefined} />
          ))}
        </span>
      </div>
    );
  }
  return (
    <div {...common}>
      {caption}
      <span className={`${P}-housing`}>
        <span className={`${P}-track`}>
          <span className={`${P}-lit`} style={{ width: `${fraction * 100}%` }} />
        </span>
      </span>
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const fill = progress === undefined ? undefined : ({ "--jgk-signal-progress": String(Math.min(1, Math.max(0, progress))) } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-shield`} data-device={device}>
        <span className={`${P}-shield-glyph`}>{glyph}</span>
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
  const warning = tone === "bad" || tone === "warn";
  const mark = icon ?? (warning ? <span className={`${P}-toast-tri`} aria-hidden="true">!</span> : null);
  return (
    <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      {mark === null ? null : <span className={`${P}-toast-icon`}>{mark}</span>}
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
      <span className={`${P}-menu-arrow`} aria-hidden="true" />
      <span className={`${P}-menu-plate`}>{String(items.indexOf(item) + 1).padStart(2, "0")}</span>
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
  const square = shape !== "circle";
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      <span className={`${P}-map-frame`} aria-hidden="true" />
      {square && label !== undefined ? <span className={`${P}-map-header`}>{label}</span> : null}
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-(heading ?? 0)}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {!square && label !== undefined ? <span className={`${P}-map-plaque`}>{label}</span> : null}
    </div>
  );
}

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn *, .${P}-panel *, .${P}-meter *, .${P}-toast *, .${P}-menu *, .${P}-map * { box-sizing: border-box; }

/* Buttons: an arrow sign (primary), a keyline plate (secondary), or underlined text (ghost). Shapes sit in ::before so focus rings stay unclipped. */
.${P}-btn { --jgk-signal-sign: var(--kit-surface); position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; padding: 8px 24px; border: 0; background: none; color: var(--kit-ink); font: 600 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.01em; white-space: nowrap; cursor: pointer; transition: transform calc(120ms * var(--kit-motion)) ease-out; }
.${P}-btn::before { content: ""; position: absolute; inset: 0; z-index: -1; background: ${SHEEN}, var(--jgk-signal-sign); border-radius: 4px; box-shadow: inset 0 0 0 3px var(--jgk-signal-sign), inset 0 0 0 4.5px var(--kit-line); }
.${P}-btn::after { content: ""; position: absolute; inset: 0; z-index: -2; background: rgba(0, 0, 0, 0.4); border-radius: 4px; transform: translate(3px, 4px); }
.${P}-btn[data-tone="good"] { --jgk-signal-sign: var(--kit-good); color: var(--kit-accent-ink); }
.${P}-btn[data-tone="warn"] { --jgk-signal-sign: var(--kit-warn); color: var(--kit-accent-ink); }
.${P}-btn[data-tone="bad"] { --jgk-signal-sign: color-mix(in srgb, var(--kit-bad) 72%, #000); color: #ffffff; }
.${P}-btn[data-size="sm"] { min-height: 34px; padding: 4px 16px; font-size: calc(14px * var(--kit-text)); }
.${P}-btn[data-size="lg"] { min-height: 60px; padding: 10px 34px; font-size: calc(22px * var(--kit-text)); }
.${P}-btn[data-variant="primary"] { --jgk-signal-sign: var(--kit-accent); color: var(--kit-accent-ink); padding-right: 40px; }
.${P}-btn[data-variant="primary"]::before { border-radius: 0; clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 0 100%); box-shadow: inset 0 0 0 2px rgba(17, 17, 17, 0.35); }
.${P}-btn[data-variant="primary"]::after { border-radius: 0; clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 0 100%); }
.${P}-btn[data-variant="primary"][data-tone="bad"] { color: #ffffff; }
.${P}-btn[data-variant="ghost"]::before, .${P}-btn[data-variant="ghost"]::after { display: none; }
.${P}-btn[data-variant="ghost"] { padding-left: 4px; padding-right: 4px; color: var(--kit-ink); text-decoration: underline; text-decoration-thickness: 3px; text-decoration-color: var(--kit-accent); text-underline-offset: 7px; }
.${P}-btn-icon { display: inline-flex; }
.${P}-btn:not(:disabled):hover { transform: translate(-1px, -2px); }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: translate(2px, 3px); }
.${P}-btn:not(:disabled):active::after, .${P}-btn[data-pressed]::after { transform: translate(1px, 1px); }
.${P}-btn:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-btn:disabled:hover, .${P}-btn:disabled:active { transform: none; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 26px; height: 24px; padding: 0 6px; border: 2px solid currentColor; border-radius: 3px; font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-mono); }

/* Panels: enamel sign plates with a white keyline 4px in, corner rivets and a sheen. Tone sets the plate colour. */
.${P}-panel { --jgk-signal-sign: var(--kit-surface); --jgk-signal-ink: var(--kit-ink); position: relative; isolation: isolate; display: grid; gap: 10px; padding: 16px 20px 16px; border-radius: 6px; background: ${RIVETS}, ${SHEEN}, var(--jgk-signal-sign); box-shadow: inset 0 0 0 4px var(--jgk-signal-sign), inset 0 0 0 6px var(--kit-line), 0 4px 0 rgba(0, 0, 0, 0.3); color: var(--jgk-signal-ink); font: 400 calc(14px * var(--kit-text)) / 1.4 var(--kit-font-body); animation: ${P}-flip calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel[data-tone="accent"] { --jgk-signal-sign: var(--kit-accent); --jgk-signal-ink: var(--kit-accent-ink); }
.${P}-panel[data-tone="good"] { --jgk-signal-sign: var(--kit-good); --jgk-signal-ink: var(--kit-accent-ink); }
.${P}-panel[data-tone="warn"] { --jgk-signal-sign: var(--kit-warn); --jgk-signal-ink: var(--kit-accent-ink); }
.${P}-panel[data-tone="bad"] { --jgk-signal-sign: color-mix(in srgb, var(--kit-bad) 72%, #000); --jgk-signal-ink: #ffffff; }
.${P}-panel[data-state="closed"] { animation: ${P}-flip-out calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; pointer-events: none; }
.${P}-panel[data-variant="hud"] { gap: 6px; padding: 11px 16px 12px 18px; border-radius: 4px; }
.${P}-panel[data-variant="hud"] .${P}-title { font-size: calc(17px * var(--kit-text)); }
.${P}-panel[data-variant="card"] { padding: 20px 24px 20px; }
.${P}-panel[data-variant="card"] .${P}-title { font-size: calc(22px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"] { margin-bottom: 58px; padding: 26px 32px 24px; border-radius: 8px; box-shadow: inset 0 0 0 4px var(--jgk-signal-sign), inset 0 0 0 6px var(--kit-line), 0 6px 0 rgba(0, 0, 0, 0.3); }
.${P}-panel[data-variant="dialog"] .${P}-title { font-size: calc(30px * var(--kit-text)); }
.${P}-panel[data-variant="dialog"]::before, .${P}-panel[data-variant="dialog"]::after { content: ""; position: absolute; bottom: -58px; width: 10px; height: 58px; background: linear-gradient(90deg, #4b545c, #dfe5ea 45%, #5d666e); }
.${P}-panel[data-variant="dialog"]::before { left: 16%; }
.${P}-panel[data-variant="dialog"]::after { right: 16%; }
.${P}-panel[data-variant="pane"] { gap: 12px; padding: 0 22px 20px; }
.${P}-panel[data-variant="pane"] .${P}-panel-head { margin: 0 -22px 0; padding: 12px 22px; background: var(--kit-ink); color: var(--kit-accent-ink); }
.${P}-panel[data-variant="pane"] .${P}-title { font-size: calc(20px * var(--kit-text)); color: var(--kit-accent-ink); }
.${P}-panel[data-variant="pane"] .${P}-eyebrow { color: var(--kit-accent-ink); opacity: 0.7; }
.${P}-panel[data-variant="strip"]:not([data-tone]) { --jgk-signal-sign: var(--kit-plate); }
.${P}-panel[data-variant="strip"] { display: flex; align-items: center; gap: 14px; margin-left: 30px; padding: 7px 18px; border-radius: 4px; }
.${P}-panel[data-variant="strip"]::before { content: ""; position: absolute; left: -32px; top: 50%; width: 34px; height: 7px; margin-top: -4px; border-radius: 2px; background: linear-gradient(180deg, #eef2f5, #6f7880); }
.${P}-panel[data-variant="strip"] .${P}-panel-head { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; }
.${P}-panel[data-variant="strip"] .${P}-title { font-size: calc(18px * var(--kit-text)); }
.${P}-panel-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; align-items: end; min-width: 0; }
.${P}-eyebrow { grid-column: 1; grid-row: 1; font: 600 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; opacity: 0.92; }
.${P}-title { grid-column: 1; grid-row: 2; font: 600 calc(19px * var(--kit-text)) / 1.05 var(--kit-font-display); letter-spacing: 0.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-aside { grid-column: 2; grid-row: 1 / span 2; align-self: center; padding: 3px 8px 2px; border-radius: 3px; background: var(--jgk-signal-ink); color: var(--jgk-signal-sign); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-mono); }
.${P}-panel-body { font: 400 calc(14px * var(--kit-text)) / 1.4 var(--kit-font-body); }
.${P}-panel-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-top: 4px; }

/* Meters: a dot-matrix LED bar in a dark housing, lamp bulbs, or a ring of LED dots. */
.${P}-meter { --jgk-signal-led: var(--kit-accent); display: grid; gap: 6px; min-width: 150px; color: var(--kit-ink); }
.${P}-meter[data-tone="good"] { --jgk-signal-led: var(--kit-good); }
.${P}-meter[data-tone="warn"] { --jgk-signal-led: var(--kit-warn); }
.${P}-meter[data-tone="bad"] { --jgk-signal-led: var(--kit-bad); }
.${P}-meter-text { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.${P}-meter-label { font: 600 calc(13px * var(--kit-text)) / 1 var(--kit-font-body); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35); }
.${P}-meter-readout { padding: 3px 6px 2px; border-radius: 2px; background: var(--kit-housing); box-shadow: inset 0 0 0 1px #2b2b2b; color: var(--jgk-signal-led); font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; text-shadow: 0 0 8px color-mix(in srgb, var(--jgk-signal-led) 75%, transparent); }
.${P}-housing { display: block; padding: 4px; border-radius: 3px; background: var(--kit-housing); box-shadow: inset 0 0 0 1px #2b2b2b; }
.${P}-track { position: relative; display: block; height: 14px; background: radial-gradient(circle, rgba(255, 255, 255, 0.13) 0 1.1px, transparent 1.7px) 0 0 / 5px 5px, #0c0c0c; }
.${P}-meter[data-size="sm"] .${P}-track { height: 9px; }
.${P}-meter[data-size="lg"] .${P}-track { height: 22px; }
.${P}-lit { position: absolute; left: 0; top: 0; bottom: 0; background: radial-gradient(circle, var(--jgk-signal-led) 0 1.6px, transparent 2.2px) 0 0 / 5px 5px; box-shadow: 0 0 12px color-mix(in srgb, var(--jgk-signal-led) 40%, transparent); transition: width calc(260ms * var(--kit-motion)) ease-out; }
.${P}-lamps { display: flex; gap: 6px; padding: 5px 6px; border-radius: 999px; background: var(--kit-housing); box-shadow: inset 0 0 0 1px #2b2b2b; }
.${P}-lamp { flex: 1; aspect-ratio: 1; max-width: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #3b3b3b, #141414 72%); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.${P}-lamp[data-lit] { background: radial-gradient(circle at 35% 30%, #ffffff 0 9%, var(--jgk-signal-led) 38%, color-mix(in srgb, var(--jgk-signal-led) 55%, #000) 100%); box-shadow: 0 0 10px color-mix(in srgb, var(--jgk-signal-led) 55%, transparent); }
.${P}-ring { width: 52px; height: 52px; overflow: visible; }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 10px; min-width: 0; }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 3px; }
.${P}-dot { fill: #2b2b2b; }
.${P}-dot[data-lit] { fill: var(--jgk-signal-led); }
.${P}-ring-core { fill: var(--kit-housing); stroke: #2b2b2b; stroke-width: 1; }

/* Prompts: a route-marker shield holds the glyph; a blade sign carries the label. The bar under the label is progress. */
.${P}-prompt { display: inline-flex; align-items: center; gap: 0; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; cursor: default; animation: ${P}-flip calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
button.${P}-prompt { cursor: pointer; }
button.${P}-prompt:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-shield { position: relative; isolation: isolate; display: grid; place-items: center; flex: none; width: 46px; height: 52px; clip-path: ${SHIELD}; background: #ffffff; }
.${P}-shield::before { content: ""; position: absolute; inset: 3px; z-index: -1; clip-path: ${SHIELD}; background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 45%), var(--kit-plate); }
.${P}-shield[data-device="touch"] { width: 56px; height: 62px; }
.${P}-shield-glyph { position: relative; margin-top: -5px; color: #ffffff; font: 600 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-prompt-label { --jgk-signal-sign: var(--kit-surface); position: relative; isolation: isolate; margin-left: -4px; padding: 9px 18px 10px 14px; border-radius: 3px; background: ${SHEEN}, var(--jgk-signal-sign); box-shadow: inset 0 0 0 3px var(--jgk-signal-sign), inset 0 0 0 4.5px var(--kit-line), 0 3px 0 rgba(0, 0, 0, 0.3); color: var(--kit-ink); font: 600 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); white-space: nowrap; overflow: hidden; }
.${P}-prompt[data-tone="good"] .${P}-prompt-label { --jgk-signal-sign: var(--kit-good); color: var(--kit-accent-ink); }
.${P}-prompt[data-tone="warn"] .${P}-prompt-label { --jgk-signal-sign: var(--kit-warn); color: var(--kit-accent-ink); }
.${P}-prompt[data-tone="bad"] .${P}-prompt-label { --jgk-signal-sign: color-mix(in srgb, var(--kit-bad) 72%, #000); color: #ffffff; }
.${P}-prompt-label::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--kit-accent); transform-origin: 0 50%; transform: scaleX(var(--jgk-signal-progress, 0)); transition: transform calc(120ms * var(--kit-motion)) linear; }

/* Toasts: a departure-board line with a black housing, amber LED text under a dot-matrix overlay. Bad is a red LED. */
.${P}-toast { --jgk-signal-led: var(--kit-accent); position: relative; isolation: isolate; display: flex; align-items: center; gap: 12px; min-width: 220px; max-width: 360px; padding: 12px 18px 12px 16px; border-radius: 4px; background: ${SEAM}, var(--kit-housing); box-shadow: inset 0 0 0 2px #2b2b2b, 0 4px 0 rgba(0, 0, 0, 0.35); color: var(--jgk-signal-led); font-family: var(--kit-font-mono); animation: ${P}-flip calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-toast::after { content: ""; position: absolute; inset: 0; z-index: 2; border-radius: inherit; pointer-events: none; background: radial-gradient(circle, rgba(0, 0, 0, 0.6) 0 1px, transparent 1.5px) 0 0 / 3px 3px; }
.${P}-toast[data-tone="good"] { --jgk-signal-led: var(--kit-good); }
.${P}-toast[data-tone="warn"] { --jgk-signal-led: var(--kit-warn); }
.${P}-toast[data-tone="bad"] { --jgk-signal-led: var(--kit-bad); }
.${P}-toast[data-state="closed"] { animation: ${P}-flip-out calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; }
.${P}-toast-icon { position: relative; display: inline-grid; place-items: center; flex: none; }
.${P}-toast-tri { display: grid; place-items: end center; width: 28px; height: 25px; padding-bottom: 1px; clip-path: polygon(50% 0, 100% 100%, 0 100%); background: var(--jgk-signal-led); color: #111111; font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-mono); }
.${P}-toast-text { display: grid; gap: 4px; min-width: 0; }
.${P}-toast-title { font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--jgk-signal-led); text-shadow: 0 0 8px color-mix(in srgb, var(--jgk-signal-led) 60%, transparent); }
.${P}-toast-body { font: 700 calc(15px * var(--kit-text)) / 1.3 var(--kit-font-mono); letter-spacing: 0.02em; text-transform: uppercase; color: var(--jgk-signal-led); text-shadow: 0 0 6px color-mix(in srgb, var(--jgk-signal-led) 45%, transparent); }
.${P}-toast-count { position: relative; z-index: 3; flex: none; padding: 3px 8px 2px; border: 2px solid var(--jgk-signal-led); border-radius: 3px; background: #0a0a0a; color: var(--jgk-signal-led); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-mono); text-shadow: 0 0 8px color-mix(in srgb, var(--jgk-signal-led) 70%, transparent); }

/* Menus: departure board rows. The active row is lit amber with a play arrow; secondary rows sit under a rule. */
.${P}-menu { --jgk-signal-led: var(--kit-accent); position: relative; isolation: isolate; display: grid; gap: 2px; justify-items: stretch; min-width: 260px; padding: 6px; border-radius: 4px; background: var(--kit-housing); box-shadow: inset 0 0 0 2px #2b2b2b, 0 4px 0 rgba(0, 0, 0, 0.35); font-family: var(--kit-font-mono); }
.${P}-menu::after { content: ""; position: absolute; inset: 0; z-index: 3; border-radius: inherit; pointer-events: none; background: radial-gradient(circle, rgba(0, 0, 0, 0.45) 0 1px, transparent 1.5px) 0 0 / 3px 3px; }
.${P}-menu[data-variant="title"] { min-width: 330px; }
.${P}-menu-item { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 6px 14px 6px 8px; border: 0; border-radius: 2px; background: transparent; color: color-mix(in srgb, var(--jgk-signal-led) 82%, #000); font: 700 calc(18px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.05em; text-transform: uppercase; text-align: left; cursor: pointer; }
.${P}-menu[data-variant="title"] .${P}-menu-item { min-height: 50px; font-size: calc(24px * var(--kit-text)); }
.${P}-menu[data-variant="pause"] .${P}-menu-item { font-size: calc(20px * var(--kit-text)); }
.${P}-menu-item:not(:disabled):hover { color: var(--jgk-signal-led); }
.${P}-menu-item:disabled { opacity: 0.35; cursor: not-allowed; }
.${P}-menu-item:focus-visible { outline: 2px solid var(--kit-accent); outline-offset: 2px; }
.${P}-menu-item[data-active] { background: var(--jgk-signal-led); color: var(--kit-accent-ink); }
.${P}-menu-arrow { flex: none; width: 12px; height: 16px; background: var(--kit-accent-ink); clip-path: polygon(0 0, 100% 50%, 0 100%); visibility: hidden; }
.${P}-menu-item[data-active] .${P}-menu-arrow { visibility: visible; }
.${P}-menu-plate { flex: none; display: grid; place-items: center; min-width: 32px; height: 24px; padding: 0 5px; border-radius: 2px; background: #f4f4f0; color: #111111; font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0; }
.${P}-menu-item[data-active] .${P}-menu-plate { background: #111111; color: var(--jgk-signal-led); }
.${P}-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${P}-menu-hint { flex: none; margin-left: auto; padding-left: 10px; font: 600 calc(13px * var(--kit-text)) / 1.2 var(--kit-font-mono); letter-spacing: 0.01em; text-transform: none; white-space: nowrap; }
.${P}-menu-badge { margin-left: auto; padding: 2px 6px; border: 2px solid currentColor; border-radius: 3px; font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-mono); }
.${P}-menu-item[data-secondary] { min-height: 30px; font-size: calc(14px * var(--kit-text)); }
.${P}-menu-rule { height: 0; margin: 6px 4px; border-top: 1px solid rgba(255, 176, 0, 0.5); }

/* Minimap: a transit-blue sign with a white keyline and a header band (square) or a round sign (circle), with a north sign that turns with heading. */
.${P}-map { --jgk-signal-sign: var(--kit-plate); position: relative; flex: none; isolation: isolate; }
.${P}-map-frame { position: absolute; inset: 0; border-radius: 4px; background: ${SHEEN}, var(--kit-plate); box-shadow: inset 0 0 0 4px var(--kit-plate), inset 0 0 0 6px var(--kit-line), 0 4px 0 rgba(0, 0, 0, 0.3); }
.${P}-map[data-shape="circle"] .${P}-map-frame { border-radius: 50%; }
.${P}-map-header { position: absolute; left: 10px; right: 10px; top: 10px; z-index: 2; display: flex; align-items: center; height: 26px; padding: 0 10px; background: var(--kit-ink); color: var(--kit-accent-ink); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-map-window { position: absolute; inset: 42px 10px 10px; overflow: hidden; background: var(--kit-surface-alt); box-shadow: 0 0 0 2px var(--kit-ink); }
.${P}-map[data-shape="circle"] .${P}-map-window { inset: 14px; border-radius: 50%; box-shadow: 0 0 0 2px var(--kit-ink); }
.${P}-map-window > * { display: block; width: 100%; height: 100%; }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; }
.${P}-map-north > span { position: absolute; display: grid; place-items: center; width: 26px; height: 28px; background: var(--kit-ink); color: var(--kit-accent-ink); clip-path: polygon(50% 0, 100% 24%, 100% 100%, 0 100%, 0 24%); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-map[data-shape="square"] .${P}-map-north > span { right: -11px; top: 50%; margin-top: -14px; }
.${P}-map[data-shape="circle"] .${P}-map-north > span { left: 50%; top: -12px; margin-left: -13px; }
.${P}-map-plaque { position: absolute; left: 50%; bottom: -15px; z-index: 2; padding: 4px 12px 3px; border-radius: 3px; background: var(--kit-ink); color: var(--kit-accent-ink); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.02em; white-space: nowrap; transform: translateX(-50%); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3); }

@keyframes ${P}-flip { from { opacity: 0; transform: perspective(260px) rotateX(-90deg); } to { opacity: 1; transform: perspective(260px) rotateX(0deg); } }
@keyframes ${P}-flip-out { from { opacity: 1; transform: perspective(260px) rotateX(0deg); } to { opacity: 0; transform: perspective(260px) rotateX(90deg); } }
`;

/**
 * Wayfinder: in-world signage. Enamel road-sign plates with keylines and rivets, arrow and blade signs,
 * route-marker shields, LED departure boards and lamp bulbs, with split-flap flips and clacks.
 *
 * @capability ui-kit-signal in-world signage UI kit — enamel plates, arrow and blade signs, route shields, LED departure boards, split-flap motion and clacks
 */
export const signalKit: UiKit = {
  id: "signal",
  name: "Wayfinder",
  description: "Diegetic signage: enamel road-sign plates, arrow and blade signs, LED departure boards and split-flap motion.",
  tokens: {
    ink: "#ffffff",
    surface: "#00664f",
    surfaceAlt: "#0b1a14",
    accent: "#ffb000",
    accentInk: "#111111",
    good: "#2bd46b",
    warn: "#ffb000",
    bad: "#ff3b2f",
    line: "#ffffff",
    scrim: "rgba(5, 10, 8, 0.7)",
    led: "#ffb000",
    housing: "#121212",
    plate: "#1f4fa3",
    fontDisplay: "\"Bahnschrift SemiBold\", \"Bahnschrift\", \"Overpass\", \"DIN Alternate\", \"Arial Narrow\", sans-serif",
    fontBody: "\"Bahnschrift\", \"Segoe UI\", Roboto, sans-serif",
    fontMono: "\"Consolas\", \"Menlo\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 260, exitMs: 200, ease: "cubic-bezier(0.3, 0.1, 0.3, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1400, duration: 0.012, gain: 0.3 }, { kind: "tone", wave: "square", freq: 900, duration: 0.008, gain: 0.07 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 3000, duration: 0.01, gain: 0.05 }] } }),
    open: kitCueSound("open", {
      gain: 0.5,
      maxVoices: 2,
      synth: {
        voices: [
          { kind: "noise", filterType: "bandpass", filterFreq: 2200, duration: 0.02, gain: 0.22 },
          { kind: "noise", filterType: "bandpass", filterFreq: 2600, duration: 0.02, gain: 0.2, delay: 0.028 },
          { kind: "noise", filterType: "bandpass", filterFreq: 2000, duration: 0.02, gain: 0.2, delay: 0.056 },
          { kind: "noise", filterType: "bandpass", filterFreq: 2400, duration: 0.02, gain: 0.18, delay: 0.084 },
          { kind: "noise", filterType: "bandpass", filterFreq: 2200, duration: 0.02, gain: 0.16, delay: 0.112 },
        ],
      },
    }),
    close: kitCueSound("close", {
      gain: 0.5,
      maxVoices: 2,
      synth: {
        voices: [
          { kind: "noise", filterType: "bandpass", filterFreq: 1500, duration: 0.02, gain: 0.2 },
          { kind: "noise", filterType: "bandpass", filterFreq: 1300, duration: 0.02, gain: 0.18, delay: 0.03 },
          { kind: "noise", filterType: "bandpass", filterFreq: 1100, duration: 0.02, gain: 0.14, delay: 0.06 },
        ],
      },
    }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1400, duration: 0.012, gain: 0.26 }, { kind: "tone", wave: "square", freq: 1200, duration: 0.03, gain: 0.07, delay: 0.02 }, { kind: "noise", filterType: "bandpass", filterFreq: 1400, duration: 0.012, gain: 0.22, delay: 0.09 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 180, slideTo: 140, duration: 0.16, gain: 0.16, attack: 0.005 }, { kind: "noise", filterType: "bandpass", filterFreq: 900, duration: 0.16, gain: 0.06 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1320, duration: 0.16, gain: 0.2 }, { kind: "tone", wave: "sine", freq: 990, duration: 0.2, gain: 0.18, delay: 0.14 }] } }),
  },
};
