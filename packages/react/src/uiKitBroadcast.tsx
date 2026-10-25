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

const P = "jgk-broadcast";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/**
 * Skew discipline: the outer slab carries the skew, text inside it is counter-skewed with `${P}-up`,
 * and boxes nested in a slab inherit its skew without their own transform.
 */
const UP = `${P}-up`;

function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
  const counter = variant === "ghost" ? undefined : UP;
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
      {icon === undefined ? null : <span className={cx(counter, `${P}-btn-icon`)}>{icon}</span>}
      <span className={cx(counter, `${P}-btn-label`)}>{children}</span>
      {glyph === undefined ? null : <span className={cx(counter, `${P}-glyph`)}>{glyph}</span>}
      {variant === "primary" ? (
        <span className={cx(UP, `${P}-chev`)} aria-hidden="true">
          ▶
        </span>
      ) : null}
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  const body = children !== undefined || footer !== undefined;
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      {head ? (
        <header className={`${P}-panel-cap`}>
          <span className={`${P}-panel-head`}>
            {eyebrow === undefined ? null : (
              <span className={`${P}-eyebrow`}>
                <span className={UP}>{eyebrow}</span>
              </span>
            )}
            {title === undefined ? null : <span className={cx(UP, `${P}-title`)}>{title}</span>}
          </span>
          {aside === undefined ? null : (
            <span className={`${P}-aside`}>
              <span className={UP}>{aside}</span>
            </span>
          )}
        </header>
      ) : null}
      {body ? (
        <div className={`${P}-panel-slab`}>
          {children === undefined ? null : <div className={`${P}-up-block ${P}-panel-body`}>{children}</div>}
          {footer === undefined ? null : <footer className={`${P}-up-block ${P}-panel-foot`}>{footer}</footer>}
        </div>
      ) : null}
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
  const lit = meterSegmentsLit(value, max, segments);
  if (variant === "ring") {
    const length = 2 * Math.PI * 24;
    const digits = readout === true ? Math.round(value) : readout === false || readout === undefined ? null : readout;
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span className={`${P}-ring-wrap`}>
          <svg className={`${P}-ring`} viewBox="0 0 60 60" aria-hidden="true">
            <circle className={`${P}-ring-track`} cx="30" cy="30" r="24" />
            <circle className={`${P}-ring-fill`} cx="30" cy="30" r="24" strokeDasharray={`${length * fraction} ${length}`} transform="rotate(-90 30 30)" />
          </svg>
          {digits === null ? null : (
            <span className={`${P}-ring-digits`}>
              {digits}
              {readout === true ? <span className={`${P}-ring-sub`}>/ {Math.round(max)}</span> : null}
            </span>
          )}
        </span>
        {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
      </div>
    );
  }
  return (
    <div className={cx(`${P}-meter`, className)} data-variant={variant} data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {label === undefined && text === null ? null : (
        <div className={`${P}-meter-head`}>
          {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
          {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
        </div>
      )}
      {variant === "segments" ? (
        <span className={`${P}-cells`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} className={`${P}-cell`} data-lit={index < lit ? "" : undefined} />
          ))}
        </span>
      ) : (
        <>
          <span className={`${P}-track`}>
            <span className={`${P}-fill`} style={{ width: `${fraction * 100}%` }} />
          </span>
          <span className={`${P}-ticks`} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const vars = {
    "--jgk-broadcast-progress": String(Math.min(1, Math.max(0, progress ?? 0))),
  } as CSSProperties;
  const body = (
    <>
      <span className={`${P}-prompt-glyph`} data-device={device}>
        <span className={cx(UP, `${P}-prompt-glyph-text`)}>{glyph}</span>
      </span>
      <span className={`${P}-prompt-label`}>
        <span className={UP}>{label}</span>
        {device === "touch" ? (
          <span className={cx(UP, `${P}-prompt-chev`)} aria-hidden="true">
            ▶
          </span>
        ) : null}
      </span>
    </>
  );
  if (onActivate !== undefined) {
    return (
      <button type="button" className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={{ ...vars, ...style }} onClick={onActivate}>
        {body}
      </button>
    );
  }
  return (
    <div className={cx(`${P}-prompt`, className)} data-tone={tone} data-device={device} style={{ ...vars, ...style }}>
      {body}
    </div>
  );
}

function Toast({ tone, title, icon, count, leaving, className, style, children }: KitToastProps): ReactNode {
  const alert = tone === "bad" || tone === "warn";
  return (
    <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      <div className={`${P}-toast-bar`} data-alert={alert ? "" : undefined}>
        <span className={`${P}-toast-block`}>
          {icon === undefined ? null : <span className={cx(UP, `${P}-toast-icon`)}>{icon}</span>}
          {title === undefined ? null : <span className={cx(UP, `${P}-toast-title`)}>{title}</span>}
        </span>
        <span className={`${P}-toast-text`}>
          <span className={UP}>{children}</span>
        </span>
      </div>
      {count === undefined || count < 2 ? null : <span className={`${P}-toast-count`}>×{count}</span>}
    </div>
  );
}

function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
  const primary = items.filter((item) => item.secondary !== true);
  const secondary = items.filter((item) => item.secondary === true);
  const row = (item: KitMenuProps["items"][number], numbered: boolean) => (
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
      {numbered ? (
        <span className={`${P}-num`}>
          <span className={cx(UP, `${P}-num-text`)} />
        </span>
      ) : null}
      <span className={cx(UP, `${P}-item-label`)}>{item.label}</span>
      {item.badge === undefined ? null : (
        <span className={`${P}-badge`}>
          <span className={UP}>{item.badge}</span>
        </span>
      )}
      {item.hint === undefined ? null : <span className={cx(UP, `${P}-item-hint`)}>{item.hint}</span>}
    </button>
  );
  return (
    <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
      {primary.map((item) => row(item, true))}
      {secondary.length === 0 ? null : <span className={`${P}-rule`} aria-hidden="true" />}
      {secondary.map((item) => row(item, false))}
    </div>
  );
}

function MinimapFrame({ children, size, shape = "square", label, heading, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      <span className={`${P}-map-ticks`} aria-hidden="true" />
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-live`}>
        <span className={UP}>LIVE</span>
      </span>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-(heading ?? 0)}rad)` }} aria-hidden="true">
        <span className={`${P}-map-north-tag`}>
          <span className={UP}>N</span>
        </span>
      </span>
      {label === undefined ? null : (
        <span className={`${P}-map-label`}>
          <span className={UP}>{label}</span>
        </span>
      )}
    </div>
  );
}

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map {
  box-sizing: border-box;
  color: var(--kit-ink);
  font-family: var(--kit-font-body);
  --jgk-broadcast-gloss: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 46%, rgba(0, 0, 0, 0.24) 100%), linear-gradient(112deg, rgba(255, 255, 255, 0) 0 34%, rgba(255, 255, 255, 0.13) 44%, rgba(255, 255, 255, 0) 56%);
  --jgk-broadcast-chev: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 40'%3E%3Cpath d='M2 0 L15 20 L2 40 L8 40 L21 20 L8 0 Z' fill='%23000'/%3E%3C/svg%3E");
}
.${P}-up { display: inline-block; transform: skewX(12deg); }
.${P}-up-block { display: block; transform: skewX(12deg); }

/* Buttons: skewed slabs with a team stripe on the leading edge, a ▶ on primary, an accent stripe on secondary */
.${P}-btn { --jgk-broadcast-stripe: var(--kit-stripe); position: relative; display: inline-flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 28px 8px 26px; border: 0; background: none; color: var(--kit-ink); font: 700 calc(20px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transform: skewX(-12deg); transition: transform calc(140ms * var(--kit-motion)) var(--kit-ease); }
.${P}-btn[data-size="sm"] { min-height: 34px; padding: 5px 18px 5px 16px; gap: 8px; font-size: calc(15px * var(--kit-text)); }
.${P}-btn[data-size="lg"] { min-height: 60px; padding: 10px 36px 10px 34px; gap: 14px; font-size: calc(26px * var(--kit-text)); }
.${P}-btn[data-variant="primary"] { background: var(--jgk-broadcast-gloss), var(--jgk-broadcast-tone, var(--kit-accent)); color: var(--kit-accent-ink); box-shadow: inset 10px 0 0 var(--kit-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.55); }
.${P}-btn[data-variant="secondary"] { --jgk-broadcast-stripe: var(--jgk-broadcast-tone, var(--kit-accent)); background: var(--jgk-broadcast-gloss), var(--kit-surface); color: var(--kit-ink); box-shadow: inset 9px 0 0 var(--jgk-broadcast-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.28); }
.${P}-btn[data-variant="secondary"][data-tone="bad"] .${P}-btn-label, .${P}-btn[data-variant="secondary"][data-tone="warn"] .${P}-btn-label { color: var(--jgk-broadcast-tone); }
.${P}-btn[data-tone="good"] { --jgk-broadcast-tone: var(--kit-good); }
.${P}-btn[data-tone="warn"] { --jgk-broadcast-tone: var(--kit-warn); }
.${P}-btn[data-tone="bad"] { --jgk-broadcast-tone: var(--kit-bad); }
.${P}-btn[data-tone="bad"][data-variant="primary"], .${P}-btn[data-tone="good"][data-variant="primary"], .${P}-btn[data-tone="warn"][data-variant="primary"] { color: var(--kit-ink); }
.${P}-btn[data-tone="bad"][data-variant="primary"] { color: var(--kit-ink); }
.${P}-btn-label { white-space: nowrap; }
.${P}-btn-icon { display: inline-grid; place-items: center; font-size: 1.05em; }
.${P}-chev { font-size: 0.72em; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 26px; height: 26px; padding: 0 5px; background: var(--kit-accent); color: var(--kit-accent-ink); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; }
.${P}-btn[data-variant="primary"] .${P}-glyph { background: var(--kit-ink); color: var(--kit-surface); }
.${P}-btn[data-variant="secondary"] .${P}-glyph { background: var(--jgk-broadcast-stripe); color: var(--kit-accent-ink); }
.${P}-btn[data-variant="ghost"] { min-height: 0; padding: 4px 4px 8px; transform: none; background: none; box-shadow: none; font-size: calc(18px * var(--kit-text)); color: var(--kit-ink); }
.${P}-btn[data-variant="ghost"][data-size="sm"] { font-size: calc(15px * var(--kit-text)); }
.${P}-btn[data-variant="ghost"][data-size="lg"] { font-size: calc(24px * var(--kit-text)); }
.${P}-btn[data-variant="ghost"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--jgk-broadcast-tone, var(--kit-accent)); transform: skewX(-12deg); }
.${P}-btn[data-variant="ghost"] .${P}-glyph { background: none; color: var(--kit-ink); border: 2px solid var(--kit-accent); min-width: 22px; height: 22px; font-size: calc(12px * var(--kit-text)); }
@media (hover: hover) { .${P}-btn:not(:disabled):hover { transform: skewX(-12deg) translateX(3px); } .${P}-btn[data-variant="ghost"]:not(:disabled):hover { transform: translateX(3px); } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: skewX(-12deg) translate(2px, 2px); }
.${P}-btn[data-variant="ghost"]:not(:disabled):active, .${P}-btn[data-variant="ghost"][data-pressed] { transform: translate(2px, 2px); }
.${P}-btn:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: skewX(-12deg); }
.${P}-btn[data-variant="ghost"]:disabled { transform: none; }

/* Panels: hud is a score bug (accent header, dark body, offset), dialog a breaking-news band, card stacked slabs, strip a ticker band, pane a wide slab */
.${P}-panel { position: relative; margin: 0; color: var(--kit-ink); animation: ${P}-wipe-in calc(220ms * var(--kit-motion)) var(--kit-ease) backwards; }
.${P}-panel[data-state="closed"] { animation: ${P}-wipe-out calc(200ms * var(--kit-motion)) ease-in forwards; pointer-events: none; }
.${P}-panel-cap { display: flex; align-items: center; gap: 14px; min-width: 0; margin: 0 0 0 -12px; padding: 7px 20px 6px 16px; background: var(--jgk-broadcast-gloss), var(--kit-accent); color: var(--kit-accent-ink); transform: skewX(-12deg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55); }
.${P}-panel-head { display: grid; gap: 2px; min-width: 0; }
.${P}-eyebrow { display: inline-flex; justify-self: start; font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8; }
.${P}-title { display: block; font: 700 calc(22px * var(--kit-text)) / 1.05 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; overflow-wrap: anywhere; }
.${P}-aside { display: inline-flex; margin-left: auto; padding: 4px 10px 3px; background: var(--kit-surface); color: var(--kit-ink); box-shadow: inset 0 -3px 0 var(--kit-stripe); font: 700 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; }
.${P}-panel-slab { position: relative; padding: 12px 18px 12px 22px; background: var(--jgk-broadcast-gloss), var(--kit-surface); color: var(--kit-ink); transform: skewX(-12deg); box-shadow: inset 9px 0 0 var(--kit-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.${P}-panel-body { font: 500 calc(16px * var(--kit-text)) / 1.35 var(--kit-font-body); letter-spacing: 0.01em; color: var(--kit-ink); }
.${P}-panel-foot { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--kit-line); }

.${P}-panel[data-variant="hud"] .${P}-panel-cap { margin-left: -14px; }
.${P}-panel[data-variant="hud"] .${P}-panel-slab { margin-left: 0; box-shadow: inset 9px 0 0 var(--kit-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -3px 0 var(--kit-accent); }
.${P}-panel[data-variant="hud"] .${P}-title { font-size: calc(19px * var(--kit-text)); }

.${P}-panel[data-variant="card"] .${P}-panel-cap { margin-left: 0; }
.${P}-panel[data-variant="card"] .${P}-panel-slab { margin: 0 14px 14px 0; padding: 16px 22px 16px 24px; box-shadow: inset 9px 0 0 var(--kit-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.3), 10px 10px 0 var(--kit-surface-alt), 20px 20px 0 var(--kit-line); }

.${P}-panel[data-variant="dialog"] { margin: 0 0 6px; }
.${P}-panel[data-variant="dialog"] .${P}-panel-cap { margin: 0; padding: 20px 26px 4px 22px; background: var(--kit-surface); color: var(--kit-ink); box-shadow: inset 10px 0 0 var(--kit-stripe); transform: skewX(-12deg); align-items: flex-end; }
.${P}-panel[data-variant="dialog"] .${P}-panel-head { gap: 8px; }
.${P}-panel[data-variant="dialog"] .${P}-eyebrow { display: inline-flex; padding: 4px 10px 3px; background: var(--kit-stripe); color: var(--kit-ink); font-size: calc(14px * var(--kit-text)); letter-spacing: 0.16em; opacity: 1; }
.${P}-panel[data-variant="dialog"] .${P}-title { font-size: calc(44px * var(--kit-text)); letter-spacing: 0.02em; line-height: 0.95; white-space: normal; }
.${P}-panel[data-variant="dialog"] .${P}-aside { background: var(--kit-accent); color: var(--kit-accent-ink); box-shadow: none; }
.${P}-panel[data-variant="dialog"] .${P}-panel-slab { margin: 0; padding: 14px 26px 22px 24px; box-shadow: inset 10px 0 0 var(--kit-stripe), inset 0 -8px 0 var(--kit-accent), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.${P}-panel[data-variant="dialog"] .${P}-panel-body { font-size: calc(18px * var(--kit-text)); font-weight: 600; }

.${P}-panel[data-variant="pane"] .${P}-panel-cap { margin-left: 0; padding: 9px 22px 8px 20px; }
.${P}-panel[data-variant="pane"] .${P}-title { font-size: calc(24px * var(--kit-text)); }
.${P}-panel[data-variant="pane"] .${P}-panel-slab { padding: 18px 26px 20px 28px; box-shadow: inset 12px 0 0 var(--kit-stripe), inset 0 -4px 0 var(--kit-accent), inset 0 1px 0 rgba(255, 255, 255, 0.3); }

.${P}-panel[data-variant="strip"] { display: flex; align-items: stretch; width: 100%; min-width: 0; min-height: 50px; background: var(--jgk-broadcast-gloss), var(--kit-surface); box-shadow: inset 0 -4px 0 var(--kit-stripe); transform: skewX(-12deg); }
.${P}-panel[data-variant="strip"]::after { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--kit-accent); opacity: 0.2; -webkit-mask: var(--jgk-broadcast-chev) 0 0 / 26px 100% repeat-x; mask: var(--jgk-broadcast-chev) 0 0 / 26px 100% repeat-x; pointer-events: none; }
.${P}-panel[data-variant="strip"] .${P}-panel-cap { margin: 0; padding: 0 24px 0 20px; background: var(--kit-accent); box-shadow: none; transform: none; align-items: center; }
.${P}-panel[data-variant="strip"] .${P}-title { font-size: calc(20px * var(--kit-text)); }
.${P}-panel[data-variant="strip"] .${P}-panel-slab { display: flex; align-items: center; flex: 1; min-width: 0; padding: 0 22px; background: none; box-shadow: none; transform: none; }
.${P}-panel[data-variant="strip"] .${P}-panel-body { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-panel[data-variant="strip"] .${P}-up-block { transform: skewX(12deg); }
.${P}-panel:not([data-variant="dialog"])[data-tone="good"] .${P}-panel-cap { background: var(--kit-good); }
.${P}-panel:not([data-variant="dialog"])[data-tone="warn"] .${P}-panel-cap { background: var(--kit-warn); }
.${P}-panel:not([data-variant="dialog"])[data-tone="bad"] .${P}-panel-cap { background: var(--kit-bad); color: var(--kit-ink); }
.${P}-panel[data-variant="dialog"][data-tone="good"] .${P}-panel-cap { box-shadow: inset 10px 0 0 var(--kit-good); }
.${P}-panel[data-variant="dialog"][data-tone="warn"] .${P}-panel-cap { box-shadow: inset 10px 0 0 var(--kit-warn); }
.${P}-panel[data-variant="dialog"][data-tone="bad"] .${P}-panel-cap { box-shadow: inset 10px 0 0 var(--kit-bad); }

/* Meter: a scoreboard bar with ticks, a boxed readout, parallelogram pips, or a shot-clock ring */
.${P}-meter { --jgk-broadcast-tone: var(--kit-accent); display: grid; gap: 6px; min-width: 150px; color: var(--kit-ink); }
.${P}-meter[data-tone="good"] { --jgk-broadcast-tone: var(--kit-good); }
.${P}-meter[data-tone="warn"] { --jgk-broadcast-tone: var(--kit-warn); }
.${P}-meter[data-tone="bad"] { --jgk-broadcast-tone: var(--kit-bad); }
.${P}-meter[data-tone="neutral"] { --jgk-broadcast-tone: color-mix(in srgb, var(--kit-ink) 55%, var(--kit-surface)); }
.${P}-meter-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.${P}-meter-label { font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.08em; text-transform: uppercase; }
.${P}-meter-readout { display: inline-flex; padding: 3px 10px 2px; background: var(--kit-surface); color: var(--kit-ink); box-shadow: inset 0 -4px 0 var(--jgk-broadcast-tone), inset 0 1px 0 rgba(255, 255, 255, 0.2); font: 700 calc(26px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.${P}-track { position: relative; display: block; height: 18px; overflow: hidden; background: var(--kit-surface-alt); transform: skewX(-14deg); box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.35); }
.${P}-meter[data-size="sm"] .${P}-track { height: 12px; }
.${P}-meter[data-size="lg"] .${P}-track { height: 26px; }
.${P}-fill { position: absolute; left: 0; top: 0; bottom: 0; min-width: 0; background: var(--jgk-broadcast-gloss), var(--jgk-broadcast-tone); transition: width calc(260ms * var(--kit-motion)) var(--kit-ease); }
.${P}-ticks { display: block; height: 6px; margin-top: 2px; background: repeating-linear-gradient(90deg, var(--kit-ink) 0 2px, transparent 2px 10%); opacity: 0.5; }
.${P}-cells { display: flex; gap: 5px; }
.${P}-cell { flex: 1 1 0; height: 16px; background: var(--kit-surface-alt); transform: skewX(-14deg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2); }
.${P}-cell[data-lit] { background: var(--jgk-broadcast-gloss), var(--jgk-broadcast-tone); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 12px; min-width: 0; }
.${P}-ring-wrap { position: relative; display: block; width: 62px; height: 62px; }
.${P}-meter[data-size="lg"] .${P}-ring-wrap { width: 80px; height: 80px; }
.${P}-ring { display: block; width: 100%; height: 100%; }
.${P}-ring-track { fill: none; stroke: var(--kit-surface-alt); stroke-width: 8; }
.${P}-ring-fill { fill: none; stroke: var(--jgk-broadcast-tone); stroke-width: 8; transition: stroke-dasharray calc(260ms * var(--kit-motion)) var(--kit-ease); }
.${P}-ring-digits { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; font: 700 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; color: var(--kit-ink); }
.${P}-meter[data-size="lg"] .${P}-ring-digits { font-size: calc(22px * var(--kit-text)); }
.${P}-ring-sub { font-size: calc(12px * var(--kit-text)); opacity: 0.75; }

/* Prompt: a square glyph box and a condensed label slab, wiping in from the left; progress is a bar along the slab's foot */
.${P}-prompt { --jgk-broadcast-tone: var(--kit-accent); position: relative; display: inline-flex; align-items: stretch; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; cursor: default; animation: ${P}-wipe-in calc(220ms * var(--kit-motion)) var(--kit-ease) backwards; }
.${P}-prompt[data-tone="good"] { --jgk-broadcast-tone: var(--kit-good); }
.${P}-prompt[data-tone="warn"] { --jgk-broadcast-tone: var(--kit-warn); }
.${P}-prompt[data-tone="bad"] { --jgk-broadcast-tone: var(--kit-bad); }
button.${P}-prompt { cursor: pointer; }
button.${P}-prompt:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-prompt-glyph { position: relative; display: grid; place-items: center; min-width: 46px; margin-right: 6px; padding: 0 8px; background: var(--jgk-broadcast-tone); color: var(--kit-accent-ink); transform: skewX(-12deg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55); }
.${P}-prompt-glyph-text { font: 700 calc(24px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; }
.${P}-prompt[data-device="touch"] .${P}-prompt-glyph { min-width: 54px; min-height: 50px; }
.${P}-prompt-label { position: relative; display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 20px 0 18px; background: var(--jgk-broadcast-gloss), var(--kit-surface); color: var(--kit-ink); transform: skewX(-12deg); box-shadow: inset 8px 0 0 var(--jgk-broadcast-tone), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.${P}-prompt-label::after { content: ""; position: absolute; left: 0; bottom: 0; height: 4px; width: calc(var(--jgk-broadcast-progress, 0) * 100%); background: var(--jgk-broadcast-tone); }
.${P}-prompt-label > .${P}-up { font: 700 calc(19px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.${P}-prompt-chev { font-size: calc(14px * var(--kit-text)); color: var(--jgk-broadcast-tone); }

/* Toast: a lower-third bar wiping in from the left; alert tones carry diagonal hazard stripes; a boxed count */
.${P}-toast { --jgk-broadcast-tone: var(--kit-accent); position: relative; display: inline-flex; max-width: 440px; animation: ${P}-wipe-in calc(220ms * var(--kit-motion)) var(--kit-ease) backwards; }
.${P}-toast[data-state="closed"] { animation: ${P}-wipe-out calc(200ms * var(--kit-motion)) ease-in forwards; }
.${P}-toast[data-tone="good"] { --jgk-broadcast-tone: var(--kit-good); }
.${P}-toast[data-tone="warn"] { --jgk-broadcast-tone: var(--kit-warn); }
.${P}-toast[data-tone="bad"] { --jgk-broadcast-tone: var(--kit-bad); }
.${P}-toast-bar { position: relative; display: flex; align-items: stretch; min-height: 54px; background: var(--jgk-broadcast-gloss), var(--kit-surface); color: var(--kit-ink); transform: skewX(-12deg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.${P}-toast-bar[data-alert]::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 9px; background: repeating-linear-gradient(-45deg, var(--jgk-broadcast-tone) 0 9px, transparent 9px 18px); }
.${P}-toast-block { display: flex; align-items: center; gap: 10px; flex: none; padding: 9px 20px 9px 18px; background: var(--jgk-broadcast-tone); color: var(--kit-accent-ink); }
.${P}-toast[data-tone="bad"] .${P}-toast-block { color: var(--kit-ink); }
.${P}-toast-icon { font: 700 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-toast-title { font: 700 calc(20px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.${P}-toast-text { display: flex; align-items: center; padding: 8px 22px 8px 18px; }
.${P}-toast-text > .${P}-up { font: 600 calc(16px * var(--kit-text)) / 1.2 var(--kit-font-body); }
.${P}-toast-count { position: absolute; top: -12px; right: -12px; min-width: 40px; height: 30px; padding: 0 8px; display: grid; place-items: center; background: var(--kit-ink); color: var(--kit-surface); box-shadow: 3px 3px 0 var(--jgk-broadcast-tone); font: 700 calc(19px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; }

/* Menu: a tote board. Numbered slabs, the active one full accent, pushed right and larger; secondary items under a thin rule */
.${P}-menu { counter-reset: ${P}-item; display: grid; gap: 6px; justify-items: start; min-width: 280px; }
.${P}-menu[data-variant="title"] { min-width: 340px; }
.${P}-item { position: relative; display: flex; align-items: stretch; gap: 0; min-width: 280px; min-height: 50px; padding: 0 20px 0 0; border: 0; background: var(--jgk-broadcast-gloss), var(--kit-surface); color: var(--kit-ink); font: 700 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.05em; text-transform: uppercase; text-align: left; cursor: pointer; transform: skewX(-12deg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28); transition: transform calc(180ms * var(--kit-motion)) var(--kit-ease), background-color calc(180ms * var(--kit-motion)) linear; }
.${P}-menu[data-variant="title"] .${P}-item { min-width: 340px; min-height: 60px; font-size: calc(30px * var(--kit-text)); }
.${P}-item:not([data-secondary]) { counter-increment: ${P}-item; }
.${P}-item:not(:disabled):hover { transform: skewX(-12deg) translateX(6px); }
.${P}-item[data-active] { background: var(--jgk-broadcast-gloss), var(--kit-accent); color: var(--kit-accent-ink); min-height: 64px; min-width: 330px; transform: skewX(-12deg) translateX(20px); box-shadow: inset 12px 0 0 var(--kit-stripe), inset 0 1px 0 rgba(255, 255, 255, 0.55); font-size: calc(26px * var(--kit-text)); }
.${P}-item[data-active]:not(:disabled):hover { transform: skewX(-12deg) translateX(20px); }
.${P}-item:disabled { opacity: 0.4; cursor: not-allowed; }
.${P}-item:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-num { display: grid; place-items: center; flex: none; width: 56px; margin-left: 0; background: var(--kit-ink); color: var(--kit-surface); font-variant-numeric: tabular-nums; }
.${P}-item[data-active] .${P}-num { background: var(--kit-surface); color: var(--kit-ink); }
.${P}-num-text { font: 700 calc(22px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-numeric: tabular-nums; }
.${P}-num-text::before { content: counter(${P}-item, decimal-leading-zero); }
.${P}-item-label { flex: 1 1 auto; align-self: center; padding: 0 0 0 16px; white-space: nowrap; }
.${P}-item[data-secondary] { min-width: 0; min-height: 36px; padding: 0 16px; font-size: calc(16px * var(--kit-text)); background: var(--kit-surface-alt); box-shadow: none; color: var(--kit-ink); }
.${P}-item[data-secondary][data-active] { background: var(--kit-accent); color: var(--kit-accent-ink); box-shadow: inset 10px 0 0 var(--kit-stripe); }
.${P}-item[data-secondary] .${P}-item-label { padding: 0; }
.${P}-badge { display: inline-flex; align-self: center; margin-left: 10px; padding: 3px 8px 2px; background: var(--kit-stripe); color: var(--kit-ink); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.08em; }
.${P}-item-hint { align-self: center; margin-left: 14px; font: 600 calc(13px * var(--kit-text)) / 1.2 var(--kit-font-body); letter-spacing: 0.02em; text-transform: none; opacity: 0.75; }
.${P}-rule { display: block; width: 100%; height: 1px; margin: 6px 0 4px; background: var(--kit-line); }

/* MinimapFrame: a picture-in-picture box with a red LIVE bug and a label bar; the circle has a ring of broadcast ticks */
.${P}-map { position: relative; flex: none; margin: 12px 0 22px; }
.${P}-map-window { position: absolute; inset: 0; overflow: hidden; background: var(--kit-surface-alt); border: 3px solid var(--kit-ink); box-shadow: 0 6px 0 rgba(0, 0, 0, 0.35); }
.${P}-map[data-shape="circle"] .${P}-map-window { inset: 12px; border-radius: 50%; }
.${P}-map-ticks { display: none; }
.${P}-map[data-shape="circle"] .${P}-map-ticks { display: block; position: absolute; inset: 0; border-radius: 50%; background: repeating-conic-gradient(var(--kit-ink) 0deg 1deg, transparent 1deg 4deg); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9px)); mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9px)); }
.${P}-map-live { position: absolute; left: 0; top: 0; z-index: 2; padding: 4px 9px 3px; background: var(--kit-stripe); color: var(--kit-ink); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.16em; transform: skewX(-12deg); box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35); }
.${P}-map-live > .${P}-up { display: inline-block; }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.${P}-map-north-tag { position: absolute; left: 50%; top: -9px; margin-left: -14px; display: grid; place-items: center; width: 28px; height: 22px; background: var(--kit-accent); color: var(--kit-accent-ink); box-shadow: inset 0 -3px 0 var(--kit-ink); transform: skewX(-12deg); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-map-label { position: absolute; left: 50%; bottom: -20px; z-index: 2; display: block; max-width: 96%; padding: 5px 16px 4px 14px; background: var(--kit-surface); color: var(--kit-ink); box-shadow: inset 8px 0 0 var(--kit-accent); transform: translateX(-50%) skewX(-12deg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.${P}-map-label > .${P}-up { font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; text-transform: uppercase; }
.${P}-map[data-shape="circle"] .${P}-map-live { left: -38px; top: 10px; }

@keyframes ${P}-wipe-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes ${P}-wipe-out { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
`;

/**
 * Prime Time: sports TV graphics. Skewed navy slabs with team stripes, a score-bug header, a breaking-news
 * band, ticker chevrons, a tote-board menu, shot-clock rings and wipe-in lower thirds.
 *
 * @capability ui-kit-broadcast sports broadcast UI kit — skewed slabs, score bugs, breaking-news bands, tote-board menus, shot-clock rings, wipe motion, whoosh and stinger sounds
 */
export const broadcastKit: UiKit = {
  id: "broadcast",
  name: "Prime Time",
  description: "Sports TV graphics: skewed navy slabs with team stripes, score bugs, tickers and wipe-in lower thirds.",
  tokens: {
    ink: "#ffffff",
    surface: "#0d1b3d",
    surfaceAlt: "#172a59",
    accent: "#ffcc00",
    accentInk: "#0d1b3d",
    good: "#00d26a",
    warn: "#ff9500",
    bad: "#ff2d55",
    line: "rgba(255, 255, 255, 0.22)",
    scrim: "rgba(4, 10, 26, 0.7)",
    stripe: "#e10600",
    fontDisplay: "\"Bahnschrift Condensed\", \"Bahnschrift\", \"Oswald\", \"Avenir Next Condensed\", \"Arial Narrow\", Impact, sans-serif",
    fontBody: "\"Bahnschrift\", \"Segoe UI\", \"Avenir Next\", Roboto, sans-serif",
    fontMono: "\"Consolas\", \"Menlo\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 220, exitMs: 200, ease: "cubic-bezier(0.2, 0.9, 0.1, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.45, maxVoices: 3, synth: { voices: [{ kind: "tone", wave: "square", freq: 1400, slideTo: 1100, duration: 0.025, gain: 0.12, attack: 0.001 }, { kind: "noise", filterType: "highpass", filterFreq: 5000, duration: 0.015, gain: 0.06 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 3800, duration: 0.03, gain: 0.07 }] } }),
    open: kitCueSound("open", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 900, duration: 0.2, gain: 0.2 }, { kind: "tone", wave: "sawtooth", freq: 220, slideTo: 880, duration: 0.2, gain: 0.1 }] } }),
    close: kitCueSound("close", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1200, duration: 0.18, gain: 0.18 }, { kind: "tone", wave: "sawtooth", freq: 760, slideTo: 180, duration: 0.18, gain: 0.1 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 392, duration: 0.14, gain: 0.12 }, { kind: "tone", wave: "sawtooth", freq: 523, duration: 0.14, gain: 0.12, delay: 0.05 }, { kind: "tone", wave: "sawtooth", freq: 784, duration: 0.28, gain: 0.14, delay: 0.1 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 220, slideTo: 110, duration: 0.24, gain: 0.2, attack: 0.002 }, { kind: "tone", wave: "square", freq: 233, slideTo: 116, duration: 0.24, gain: 0.08 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 659, duration: 0.14, gain: 0.12 }, { kind: "tone", wave: "sawtooth", freq: 880, duration: 0.14, gain: 0.12, delay: 0.07 }, { kind: "tone", wave: "sawtooth", freq: 1319, duration: 0.2, gain: 0.12, delay: 0.14 }] } }),
  },
};
