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

const P = "jgk-paper";

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
      <span className={`${P}-btn-ticket`}>
        {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
        <span className={`${P}-btn-label`}>{children}</span>
        {glyph === undefined ? null : <span className={`${P}-glyph`}>{glyph}</span>}
      </span>
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      <span className={`${P}-tape`} aria-hidden="true" />
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

function readoutText(value: number, max: number, readout: KitMeterProps["readout"]): ReactNode {
  if (readout === true) return `${Math.round(value)} / ${Math.round(max)}`;
  return readout === false || readout === undefined ? null : readout;
}

function MeterText({ label, text }: { label: ReactNode; text: ReactNode }): ReactNode {
  if (label === undefined && text === null) return null;
  return (
    <span className={`${P}-meter-text`}>
      {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
      {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
    </span>
  );
}

function Meter({ value, max = 1, label, readout, tone = "accent", variant = "bar", segments = 10, size = "md", className, style }: KitMeterProps): ReactNode {
  const fraction = meterFraction(value, max);
  const text = readoutText(value, max, readout);
  const aria = { role: "meter", "aria-valuenow": value, "aria-valuemin": 0, "aria-valuemax": max } as const;
  if (variant === "ring") {
    return (
      <div {...aria} className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style}>
        <span className={`${P}-pie`} style={{ "--jgk-paper-fill": `${Math.round(fraction * 360)}deg` } as CSSProperties} />
        <MeterText label={label} text={text} />
      </div>
    );
  }
  const lit = meterSegmentsLit(value, max, segments);
  return (
    <div {...aria} className={cx(`${P}-meter`, className)} data-variant={variant} data-size={size} data-tone={tone} style={style}>
      <MeterText label={label} text={text} />
      {variant === "segments" ? (
        <span className={`${P}-dots`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} className={`${P}-dot`} data-lit={index < lit ? "" : undefined} style={{ rotate: `${((index * 37) % 11) - 5}deg` }} />
          ))}
        </span>
      ) : (
        <span className={`${P}-ruler`}>
          <span className={`${P}-marker`} style={{ width: `${fraction * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const ring = progress === undefined ? undefined : ({ "--jgk-paper-fill": `${Math.round(Math.min(1, Math.max(0, progress)) * 360)}deg` } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-badge`} data-device={device} data-progress={progress === undefined ? undefined : ""} style={ring}>
        <span>{glyph}</span>
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
      <span className={`${P}-toast-hole`} aria-hidden="true" />
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
  const row = (item: KitMenuProps["items"][number], index: number) => (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled}
      onClick={() => onSelect(item.id)}
      {...itemProps(item.id)}
      className={`${P}-menu-item`}
      data-active={item.id === activeId ? "" : undefined}
      data-secondary={item.secondary === true ? "" : undefined}
      style={{ rotate: `${(index % 2 === 0 ? -1 : 1) * 0.6}deg` }}
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
      <div className={`${P}-map-window`}>
        {children}
        <span className={`${P}-map-folds`} aria-hidden="true" />
      </div>
      <span className={`${P}-map-tape`} aria-hidden="true" />
      <span className={`${P}-map-north`} aria-hidden="true">
        <span style={{ transform: `rotate(${-(heading ?? 0)}rad)` }}>N</span>
      </span>
      {label === undefined ? null : <span className={`${P}-map-label`}>{label}</span>}
    </div>
  );
}

const SPECKLE = "radial-gradient(rgba(90, 60, 20, 0.16) 0.8px, transparent 1.2px) 0 0 / 7px 9px, radial-gradient(rgba(255, 255, 255, 0.35) 0.7px, transparent 1.1px) 3px 4px / 11px 8px";
const TORN = "polygon(0 0, 100% 0, 100% calc(100% - 5px), 96% 100%, 91% calc(100% - 4px), 85% 100%, 78% calc(100% - 5px), 71% 100%, 63% calc(100% - 3px), 56% 100%, 48% calc(100% - 5px), 41% 100%, 33% calc(100% - 4px), 26% 100%, 18% calc(100% - 5px), 11% 100%, 5% calc(100% - 3px), 0 100%)";
const NOTCHES = "radial-gradient(circle 8px at 0 50%, transparent 97%, #000 100%) left / 51% 100% no-repeat, radial-gradient(circle 8px at 100% 50%, transparent 97%, #000 100%) right / 51% 100% no-repeat";

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn *, .${P}-panel *, .${P}-toast *, .${P}-menu *, .${P}-map * { box-sizing: border-box; }

.${P}-btn { display: inline-flex; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; rotate: -1deg; filter: drop-shadow(0 2px 0 rgba(60, 40, 10, 0.28)); transition: rotate calc(160ms * var(--kit-motion)) var(--kit-ease), translate calc(160ms * var(--kit-motion)) var(--kit-ease); }
.${P}-btn-ticket { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 6px 24px; background: var(--kit-surface); color: var(--kit-ink); font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-body); outline: 2px dashed rgba(45, 42, 38, 0.35); outline-offset: -6px; -webkit-mask: ${NOTCHES}; mask: ${NOTCHES}; }
.${P}-btn[data-variant="primary"] .${P}-btn-ticket { background: repeating-linear-gradient(90deg, transparent 0 18px, rgba(255, 255, 255, 0.08) 18px 19px), var(--kit-accent); color: var(--kit-accent-ink); outline-color: rgba(255, 255, 255, 0.6); font-family: var(--kit-font-display); font-size: calc(19px * var(--kit-text)); }
.${P}-btn[data-tone="good"] .${P}-btn-ticket { background: var(--kit-good); color: #fff; }
.${P}-btn[data-tone="bad"] .${P}-btn-ticket { background: var(--kit-bad); color: #fff; }
.${P}-btn[data-size="sm"] .${P}-btn-ticket { min-height: 32px; padding: 4px 18px; font-size: calc(13px * var(--kit-text)); }
.${P}-btn[data-size="lg"] .${P}-btn-ticket { min-height: 54px; padding: 8px 34px; font-size: calc(22px * var(--kit-text)); }
.${P}-btn[data-variant="ghost"] { filter: none; }
.${P}-btn[data-variant="ghost"] .${P}-btn-ticket { background: none; outline: none; -webkit-mask: none; mask: none; padding: 4px 6px; font-family: var(--kit-font-display); text-decoration: underline var(--kit-accent) 3px; text-underline-offset: 6px; text-decoration-skip-ink: none; }
@media (hover: hover) { .${P}-btn:not(:disabled):hover { rotate: 1.5deg; translate: 0 -2px; } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { rotate: 0deg; translate: 0 2px; filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0)); }
.${P}-btn:focus-visible { outline: 3px solid var(--kit-accent); outline-offset: 4px; }
.${P}-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.${P}-glyph { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 50%; background: var(--kit-ink); color: var(--kit-surface); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); box-shadow: 0 0 0 2px var(--kit-surface); }

.${P}-panel { position: relative; isolation: isolate; padding: 14px 14px 16px; filter: drop-shadow(0 3px 2px rgba(60, 40, 10, 0.28)); animation: ${P}-place calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel::before { content: ""; position: absolute; inset: 0; z-index: -1; background: ${SPECKLE}, var(--kit-surface); clip-path: ${TORN}; }
.${P}-panel[data-state="closed"] { animation: ${P}-peel calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; pointer-events: none; }
.${P}-panel[data-variant="hud"] { rotate: -0.7deg; }
.${P}-panel[data-variant="card"], .${P}-panel[data-variant="pane"] { padding: 20px 22px 22px; }
.${P}-panel[data-variant="card"]::before, .${P}-panel[data-variant="pane"]::before { background: ${SPECKLE}, linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent 30%), var(--kit-kraft); clip-path: polygon(0 1%, 3% 0, 97% 1%, 100% 0, 99% 50%, 100% 99%, 96% 100%, 4% 99%, 0 100%, 1% 50%); box-shadow: inset 0 -10px 18px rgba(90, 60, 20, 0.14); }
.${P}-panel[data-variant="pane"] { rotate: 0deg; }
.${P}-panel[data-variant="card"] { rotate: 0.6deg; }
.${P}-panel[data-variant="dialog"] { padding: 30px 30px 26px; rotate: -0.8deg; filter: drop-shadow(0 8px 10px rgba(30, 20, 5, 0.35)); }
.${P}-panel[data-variant="dialog"]::before { background: ${SPECKLE}, repeating-linear-gradient(180deg, transparent 0 27px, rgba(70, 120, 200, 0.18) 27px 28px), linear-gradient(90deg, transparent 38px, rgba(230, 80, 80, 0.35) 38px 40px, transparent 40px), var(--kit-surface); clip-path: none; }
.${P}-panel[data-variant="strip"] { display: flex; align-items: center; gap: 12px; padding: 7px 28px; color: var(--kit-accent-ink); }
.${P}-panel[data-variant="strip"]::before { background: ${SPECKLE}, var(--kit-accent); clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%); }
.${P}-tape { position: absolute; top: -6px; left: 50%; width: 74px; height: 20px; margin-left: -37px; background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.25) 0 3px, transparent 3px 7px), var(--kit-tape); rotate: -3deg; clip-path: polygon(3% 0, 97% 4%, 100% 50%, 96% 100%, 2% 96%, 0 50%); }
.${P}-panel[data-variant="hud"] .${P}-tape { top: -4px; height: 14px; width: 52px; margin-left: -26px; }
.${P}-panel[data-variant="strip"] .${P}-tape { display: none; }
.${P}-panel[data-variant="dialog"] .${P}-tape { left: 0; margin-left: -10px; top: 6px; rotate: -38deg; }
/* Grid, not wrap: a long title wraps inside its own column and the aside stays on its row. */
.${P}-panel-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; margin-bottom: 10px; }
.${P}-panel[data-variant="strip"] .${P}-panel-head { margin: 0; }
.${P}-eyebrow { grid-column: 1 / -1; font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); letter-spacing: 0.1em; text-transform: uppercase; color: var(--kit-pencil); }
.${P}-title { grid-column: 1; justify-self: start; display: inline-block; padding: 4px 12px 5px; border-radius: 6px 10px 8px 12px; background: var(--kit-accent); color: var(--kit-accent-ink); font: 700 calc(19px * var(--kit-text)) / 1.1 var(--kit-font-display); max-width: 100%; overflow-wrap: break-word; box-shadow: 0 0 0 3px #fff, 0 3px 0 3px rgba(60, 40, 10, 0.2); rotate: -2deg; }
.${P}-panel[data-variant="strip"] .${P}-title { background: none; box-shadow: none; padding: 0; color: inherit; rotate: 0deg; }
.${P}-panel[data-variant="dialog"] .${P}-title { font-size: calc(32px * var(--kit-text)); padding: 6px 18px 8px; }
.${P}-panel[data-tone="good"] .${P}-title { background: var(--kit-good); }
.${P}-panel[data-tone="warn"] .${P}-title { background: var(--kit-warn); color: var(--kit-ink); }
.${P}-panel[data-tone="bad"] .${P}-title { background: var(--kit-bad); }
.${P}-panel[data-tone="neutral"] .${P}-title { background: var(--kit-ink); color: var(--kit-surface); }
.${P}-aside { grid-column: 2; white-space: nowrap; font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); color: var(--kit-pencil); }
.${P}-panel[data-variant="strip"] .${P}-aside { color: inherit; }
.${P}-panel-body { font: 600 calc(14px * var(--kit-text)) / 1.35 var(--kit-font-body); }
.${P}-panel-foot { margin-top: 16px; padding-top: 12px; border-top: 2px dashed rgba(45, 42, 38, 0.3); display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }

.${P}-meter { display: grid; gap: 5px; min-width: 120px; }
.${P}-meter-text { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.${P}-meter-label { font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); text-transform: uppercase; letter-spacing: 0.08em; color: var(--kit-pencil); }
.${P}-meter-readout { font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-ruler { position: relative; display: block; height: 18px; background: repeating-linear-gradient(90deg, rgba(45, 42, 38, 0.55) 0 1px, transparent 1px 10%) 0 100% / 100% 7px no-repeat, repeating-linear-gradient(90deg, rgba(45, 42, 38, 0.3) 0 1px, transparent 1px 5%) 0 100% / 100% 4px no-repeat, #fffdf6; box-shadow: inset 0 0 0 1px rgba(45, 42, 38, 0.35); }
.${P}-meter[data-size="sm"] .${P}-ruler { height: 12px; }
.${P}-meter[data-size="lg"] .${P}-ruler { height: 26px; }
.${P}-marker { position: absolute; left: 2px; top: 3px; bottom: 5px; max-width: calc(100% - 4px); border-radius: 2px 40% 3px 30% / 3px 50% 2px 40%; background: var(--jgk-paper-tone, var(--kit-accent)); opacity: 0.82; transition: width calc(280ms * var(--kit-motion)) var(--kit-ease); }
.${P}-dots { display: flex; flex-wrap: wrap; gap: 5px; }
.${P}-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px dashed var(--kit-pencil); }
.${P}-dot[data-lit] { border: 0; background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55) 0 2px, transparent 3px), var(--jgk-paper-tone, var(--kit-accent)); box-shadow: 0 0 0 2px #fff, 0 2px 0 2px rgba(60, 40, 10, 0.22); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 10px; min-width: 0; }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 3px; }
.${P}-pie { width: 44px; height: 44px; border-radius: 50%; background: conic-gradient(var(--jgk-paper-tone, var(--kit-accent)) var(--jgk-paper-fill, 0deg), #fffdf6 0); box-shadow: 0 0 0 3px #fff, 0 3px 0 3px rgba(60, 40, 10, 0.25); rotate: -6deg; }
.${P}-meter[data-size="lg"] .${P}-pie { width: 62px; height: 62px; }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="good"] { --jgk-paper-tone: var(--kit-good); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="warn"] { --jgk-paper-tone: var(--kit-warn); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="bad"] { --jgk-paper-tone: var(--kit-bad); }
:is(.${P}-meter, .${P}-prompt, .${P}-toast)[data-tone="neutral"] { --jgk-paper-tone: var(--kit-pencil); }

.${P}-prompt { display: inline-flex; align-items: center; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; animation: ${P}-place calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
button.${P}-prompt { cursor: pointer; }
.${P}-badge { position: relative; z-index: 1; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.7) 0 4px, transparent 9px), var(--jgk-paper-tone, var(--kit-accent)); color: #fff; font: 700 calc(18px * var(--kit-text)) / 1 var(--kit-font-body); box-shadow: 0 0 0 3px #fff, 0 3px 0 3px rgba(60, 40, 10, 0.25); }
.${P}-badge[data-progress] { background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.7) 0 4px, transparent 9px), conic-gradient(var(--jgk-paper-tone, var(--kit-accent)) var(--jgk-paper-fill, 0deg), var(--kit-pencil) 0); }
.${P}-badge > span { display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border-radius: 50%; background: var(--kit-ink); }
.${P}-badge[data-device="touch"] { width: 52px; height: 52px; }
.${P}-prompt-label { margin-left: -10px; padding: 7px 16px 7px 20px; background: ${SPECKLE}, var(--kit-surface); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-body); clip-path: polygon(0 4%, 97% 0, 100% 30%, 98% 62%, 100% 100%, 2% 96%); rotate: 1deg; box-shadow: inset 0 -3px 0 rgba(60, 40, 10, 0.18); }

.${P}-toast { position: relative; isolation: isolate; display: flex; align-items: center; gap: 10px; max-width: 340px; padding: 10px 18px 10px 36px; filter: drop-shadow(0 3px 1px rgba(60, 40, 10, 0.28)); rotate: -1.2deg; animation: ${P}-swing calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; transform-origin: 8px 50%; }
.${P}-toast::before { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, transparent 18px, var(--jgk-paper-tone, var(--kit-accent)) 18px 24px, transparent 24px), ${SPECKLE}, var(--kit-surface); clip-path: polygon(16px 0, 100% 0, 100% 100%, 16px 100%, 0 50%); }
.${P}-toast[data-state="closed"] { animation: ${P}-peel calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; }
.${P}-toast[data-tone="bad"], .${P}-toast[data-tone="warn"] { color: #fff; }
.${P}-toast[data-tone="bad"]::before, .${P}-toast[data-tone="warn"]::before { background: linear-gradient(90deg, transparent 18px, rgba(0, 0, 0, 0.18) 18px 24px, transparent 24px), ${SPECKLE}, var(--jgk-paper-tone); }
.${P}-toast[data-tone="warn"] { color: var(--kit-ink); }
.${P}-toast-hole { position: absolute; left: 7px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 50%; background: rgba(45, 42, 38, 0.55); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6); }
.${P}-toast-icon { font-size: calc(20px * var(--kit-text)); }
.${P}-toast-text { display: grid; gap: 2px; }
.${P}-toast-title { font: 700 calc(17px * var(--kit-text)) / 1.05 var(--kit-font-display); }
.${P}-toast-body { font: 600 calc(13px * var(--kit-text)) / 1.3 var(--kit-font-body); }
.${P}-toast-count { display: grid; place-items: center; min-width: 30px; height: 30px; margin-left: auto; border-radius: 50%; background: var(--kit-ink); color: var(--kit-surface); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-body); box-shadow: 0 0 0 2px #fff; rotate: 12deg; }

.${P}-menu { display: grid; gap: 8px; justify-items: start; }
.${P}-menu-item { position: relative; display: inline-flex; align-items: baseline; gap: 12px; min-width: 250px; padding: 10px 26px 10px 22px; border: 0; background: none; isolation: isolate; color: var(--kit-ink); font: 700 calc(19px * var(--kit-text)) / 1 var(--kit-font-display); text-align: left; cursor: pointer; filter: drop-shadow(0 2px 0 rgba(60, 40, 10, 0.28)); transition: translate calc(160ms * var(--kit-motion)) var(--kit-ease); }
.${P}-menu-item::before { content: ""; position: absolute; inset: 0; z-index: -1; background: ${SPECKLE}, var(--kit-surface); clip-path: polygon(0 3%, 98% 0, 100% 50%, 98% 100%, 1% 97%, 2% 50%); }
.${P}-menu[data-variant="title"] .${P}-menu-item { min-width: 300px; font-size: calc(24px * var(--kit-text)); padding-block: 13px; }
.${P}-menu-item[data-active] { translate: 18px 0; color: var(--kit-accent-ink); padding-right: 40px; }
.${P}-menu-item[data-active]::before { background: ${SPECKLE}, var(--kit-accent); clip-path: polygon(0 3%, 92% 0, 100% 50%, 92% 100%, 1% 97%, 2% 50%); }
.${P}-menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-menu-item[data-secondary]::before { display: none; }
.${P}-menu-item[data-secondary] { min-width: 0; padding: 6px 18px; filter: none; font-size: calc(15px * var(--kit-text)); text-decoration: underline rgba(45, 42, 38, 0.35) 2px; text-underline-offset: 5px; }
.${P}-menu-item[data-secondary][data-active] { background: none; color: var(--kit-ink); text-decoration-color: var(--kit-accent); text-decoration-thickness: 4px; }
.${P}-menu-item:focus-visible { outline: none; text-decoration: underline 3px; }
.${P}-menu-hint { font: 600 calc(12px * var(--kit-text)) / 1.2 var(--kit-font-body); opacity: 0.8; }
.${P}-menu-badge { padding: 3px 8px; border-radius: 10px 4px 10px 4px; background: var(--kit-ink); color: var(--kit-surface); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-body); rotate: 6deg; }
.${P}-menu-rule { width: 60%; height: 2px; margin: 4px 0; background: repeating-linear-gradient(90deg, var(--kit-pencil) 0 8px, transparent 8px 14px); }

.${P}-map { position: relative; flex: none; rotate: 1.2deg; }
.${P}-map-window { position: absolute; inset: 0; overflow: hidden; border: 5px solid #fff; background: var(--kit-surface); box-shadow: 0 4px 0 rgba(60, 40, 10, 0.22), 0 0 0 1px rgba(60, 40, 10, 0.2); }
.${P}-map[data-shape="circle"] .${P}-map-window { border-radius: 50%; }
.${P}-map-folds { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent 32.5%, rgba(0, 0, 0, 0.12) 33.3%, rgba(255, 255, 255, 0.2) 34%, transparent 35%, transparent 65.5%, rgba(0, 0, 0, 0.12) 66.3%, rgba(255, 255, 255, 0.2) 67%, transparent 68%); }
.${P}-map[data-shape="circle"] .${P}-map-folds { background: radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.3), transparent 45%); }
.${P}-map-tape { position: absolute; top: -8px; left: -14px; width: 54px; height: 18px; background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.25) 0 3px, transparent 3px 7px), var(--kit-tape); rotate: -32deg; }
.${P}-map[data-shape="circle"] .${P}-map-tape { display: none; }
.${P}-map-north { position: absolute; top: -8px; right: -8px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--kit-accent); color: var(--kit-accent-ink); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); box-shadow: 0 0 0 3px #fff, 0 3px 0 3px rgba(60, 40, 10, 0.22); }
.${P}-map-label { position: absolute; left: 50%; bottom: -12px; max-width: 94%; padding: 4px 12px 5px; border-radius: 8px 4px 9px 5px; background: var(--kit-ink); color: var(--kit-surface); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; translate: -50% 0; rotate: -2deg; box-shadow: 0 0 0 3px #fff; }

@keyframes ${P}-place { 0% { opacity: 0; translate: 0 -14px; scale: 1.06; rotate: -4deg; } 70% { opacity: 1; translate: 0 2px; } 100% { translate: 0 0; scale: 1; } }
@keyframes ${P}-swing { 0% { opacity: 0; rotate: -14deg; } 60% { opacity: 1; rotate: 3deg; } 100% { rotate: -1.2deg; } }
@keyframes ${P}-peel { to { opacity: 0; translate: 6px -10px; rotate: 7deg; scale: 0.96; } }
`;

/**
 * Fair Day: paper, cardboard and stickers. Torn paper notes held by washi tape, kraft cards, carnival
 * ticket buttons with notched ends, sticker titles with die-cut white rims, highlighter meters on a
 * ruler, luggage-tag toasts and a folded leaflet map; panels are placed by hand and peel away.
 *
 * @capability ui-kit-paper paper and sticker UI kit — taped notes, ticket buttons, sticker badges, ruler meters, tag toasts, place-and-peel motion
 */
export const paperKit: UiKit = {
  id: "paper",
  name: "Fair Day",
  description: "Paper, cardboard and stickers: taped notes, ticket buttons, sticker titles and tag toasts.",
  tokens: {
    ink: "#2d2a26",
    surface: "#fbf6ea",
    surfaceAlt: "#e9dcc0",
    accent: "#f2545b",
    accentInk: "#ffffff",
    good: "#2e9e62",
    warn: "#f4a62a",
    bad: "#d7263d",
    line: "#2d2a26",
    scrim: "rgba(45, 42, 38, 0.45)",
    kraft: "#d2a873",
    tape: "rgba(255, 228, 140, 0.82)",
    pencil: "#7a7064",
    fontDisplay: "\"Segoe Print\", \"Ink Free\", \"Marker Felt\", \"Bradley Hand\", \"Chalkboard SE\", cursive",
    fontBody: "\"Trebuchet MS\", \"Avenir Next\", \"Segoe UI\", Roboto, sans-serif",
    fontMono: "\"Courier New\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 320, exitMs: 200, ease: "cubic-bezier(0.3, 1.35, 0.5, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 2600, duration: 0.03, gain: 0.16 }, { kind: "tone", wave: "sine", freq: 420, slideTo: 300, duration: 0.05, gain: 0.18 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "highpass", filterFreq: 5200, duration: 0.025, gain: 0.05 }] } }),
    open: kitCueSound("open", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1400, duration: 0.16, gain: 0.12 }, { kind: "tone", wave: "triangle", freq: 660, duration: 0.1, gain: 0.16, delay: 0.06 }] } }),
    close: kitCueSound("close", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "highpass", filterFreq: 3000, duration: 0.12, gain: 0.1 }, { kind: "tone", wave: "sine", freq: 200, slideTo: 120, duration: 0.08, gain: 0.2, delay: 0.05 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 784, duration: 0.12, gain: 0.24 }, { kind: "tone", wave: "triangle", freq: 988, duration: 0.12, gain: 0.22, delay: 0.08 }, { kind: "tone", wave: "triangle", freq: 1319, duration: 0.26, gain: 0.22, delay: 0.16 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sine", freq: 130, slideTo: 90, duration: 0.14, gain: 0.32, attack: 0.002 }, { kind: "noise", filterType: "lowpass", filterFreq: 700, duration: 0.06, gain: 0.12 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1760, duration: 0.3, gain: 0.18 }, { kind: "tone", wave: "sine", freq: 2637, duration: 0.2, gain: 0.07 }] } }),
  },
};
