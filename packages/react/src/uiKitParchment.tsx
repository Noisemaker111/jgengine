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

const P = "jgk-parchment";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** Tick marks around the ring bezel, in a 48 x 48 box centred on 24, 24. */
const RING_TICKS = Array.from({ length: 36 }, (_, index) => {
  const angle = (index / 36) * 2 * Math.PI;
  const major = index % 3 === 0;
  const inner = major ? 16.2 : 18.4;
  const outer = 20.2;
  return {
    key: index,
    major,
    x1: 24 + inner * Math.sin(angle),
    y1: 24 - inner * Math.cos(angle),
    x2: 24 + outer * Math.sin(angle),
    y2: 24 - outer * Math.cos(angle),
  };
});

function Button({ variant = "secondary", size = "md", tone, icon, glyph, pressed, type = "button", className, children, ...rest }: KitButtonProps): ReactNode {
  const label = <span className={`${P}-btn-label`}>{children}</span>;
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
      {variant === "primary" ? (
        <span className={`${P}-seal`} aria-hidden="true">
          {glyph ?? "✦"}
        </span>
      ) : null}
      {variant === "ghost" ? (
        <span className={`${P}-btn-text`}>
          {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
          {label}
          {glyph === undefined ? null : <span className={`${P}-glyph`}>{glyph}</span>}
        </span>
      ) : (
        <span className={`${P}-ribbon`}>
          {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
          {label}
          {glyph === undefined || variant === "primary" ? null : <span className={`${P}-glyph`}>{glyph}</span>}
        </span>
      )}
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      <div className={`${P}-face`}>
        <span className={`${P}-orn`} data-corner="tl" aria-hidden="true" />
        <span className={`${P}-orn`} data-corner="tr" aria-hidden="true" />
        <span className={`${P}-orn`} data-corner="bl" aria-hidden="true" />
        <span className={`${P}-orn`} data-corner="br" aria-hidden="true" />
        {head ? (
          <header className={`${P}-head`}>
            <span className={`${P}-head-text`}>
              {eyebrow === undefined ? null : <span className={`${P}-eyebrow`}>{eyebrow}</span>}
              {title === undefined ? null : <span className={`${P}-title`}>{title}</span>}
            </span>
            {aside === undefined ? null : <span className={`${P}-aside`}>{aside}</span>}
          </header>
        ) : null}
        {children === undefined ? null : <div className={`${P}-body`}>{children}</div>}
        {footer === undefined ? null : <footer className={`${P}-foot`}>{footer}</footer>}
      </div>
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
  const caption =
    label === undefined && text === null ? null : (
      <span className={`${P}-meter-text`}>
        {label === undefined ? null : <span className={`${P}-meter-label`}>{label}</span>}
        {text === null ? null : <span className={`${P}-meter-readout`}>{text}</span>}
      </span>
    );
  if (variant === "ring") {
    const length = 2 * Math.PI * 13;
    return (
      <div className={cx(`${P}-meter`, className)} data-variant="ring" data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <svg className={`${P}-ring`} viewBox="0 0 48 48" aria-hidden="true">
          <circle className={`${P}-ring-bezel`} cx="24" cy="24" r="22.5" />
          {RING_TICKS.map((tick) => (
            <line key={tick.key} className={tick.major ? `${P}-ring-major` : `${P}-ring-tick`} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
          ))}
          <circle className={`${P}-ring-track`} cx="24" cy="24" r="13" />
          <circle className={`${P}-ring-fill`} cx="24" cy="24" r="13" strokeDasharray={`${length * fraction} ${length}`} transform="rotate(-90 24 24)" />
        </svg>
        {caption}
      </div>
    );
  }
  return (
    <div className={cx(`${P}-meter`, className)} data-variant={variant} data-size={size} data-tone={tone} style={style} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {caption}
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
  const ring = progress === undefined ? undefined : ({ "--jgk-parchment-progress": `${Math.round(Math.min(1, Math.max(0, progress)) * 360)}deg` } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-medal`} data-device={device} style={ring}>
        {glyph}
      </span>
      <span className={`${P}-ribbon ${P}-prompt-ribbon`}>
        <span className={`${P}-prompt-label`}>{label}</span>
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
      <div className={`${P}-ribbon ${P}-banner`}>
        {icon === undefined ? null : <span className={`${P}-toast-icon`}>{icon}</span>}
        <span className={`${P}-toast-text`}>
          {title === undefined ? null : <span className={`${P}-toast-title`}>{title}</span>}
          <span className={`${P}-toast-body`}>{children}</span>
        </span>
      </div>
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
      className={`${P}-item`}
      data-active={item.id === activeId ? "" : undefined}
      data-secondary={item.secondary === true ? "" : undefined}
    >
      <span className={`${P}-item-label`}>{item.label}</span>
      {item.badge === undefined ? null : <span className={`${P}-badge`}>{item.badge}</span>}
      {item.hint === undefined ? null : <span className={`${P}-item-hint`}>{item.hint}</span>}
    </button>
  );
  return (
    <div className={cx(`${P}-menu`, className)} data-variant={variant} style={style} role="menu">
      {primary.map(row)}
      {secondary.length === 0 ? null : (
        <span className={`${P}-rule`} aria-hidden="true">
          — ✦ —
        </span>
      )}
      {secondary.map(row)}
    </div>
  );
}

function MinimapFrame({ children, size, shape = "square", label, heading, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      <span className={`${P}-map-rim`} aria-hidden="true" />
      <span className={`${P}-map-ticks`} aria-hidden="true" />
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-(heading ?? 0)}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {label === undefined ? null : (
        <span className={`${P}-map-label`}>
          <span className={`${P}-ribbon`}>
            <span className={`${P}-map-label-text`}>{label}</span>
          </span>
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
  --jgk-parchment-swallow: polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%);
  --jgk-parchment-deckle: polygon(2% 4%, 9% 0, 17% 3%, 28% 0.5%, 40% 3%, 52% 0, 64% 2.5%, 77% 0, 89% 3%, 98% 0, 100% 9%, 97.5% 21%, 100% 34%, 98% 47%, 100% 62%, 97% 76%, 100% 89%, 96% 100%, 85% 97%, 73% 100%, 60% 96.5%, 47% 100%, 34% 97%, 21% 100%, 9% 96%, 0 100%, 2.5% 88%, 0 74%, 2% 60%, 0 45%, 2.5% 30%, 0 16%);
  --jgk-parchment-orn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M1 23 V6 Q1 1 6 1 H23' fill='none' stroke='%23000' stroke-width='1.3' stroke-linecap='round'/%3E%3Cpath d='M5 19 V8 Q5 5 8 5 H19' fill='none' stroke='%23000' stroke-width='0.6'/%3E%3Cpath d='M1 15 C1 11 4 9 7 11 C9 12.5 8 15 6 14 C5 13.4 5.6 12 6.6 12.3' fill='none' stroke='%23000' stroke-width='1' stroke-linecap='round'/%3E%3Cpath d='M15 1 C11 1 10 3.5 12 5 C13.5 6 14.6 4 13 3.2' fill='none' stroke='%23000' stroke-width='1' stroke-linecap='round'/%3E%3Ccircle cx='4.8' cy='4.8' r='1.7' fill='%23000'/%3E%3C/svg%3E");
  --jgk-parchment-flourish: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12' preserveAspectRatio='none'%3E%3Cpath d='M0 6 C30 6 40 1 60 6 S80 11 100 6 S120 1 140 6 S170 11 200 6' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M92 6 L100 2 L108 6 L100 10 Z' fill='%23000'/%3E%3C/svg%3E");
}

/* Ribbon: a brown edge (the element) with a parchment face inset 3px; both clipped to swallowtail ends. */
.${P}-ribbon { position: relative; display: inline-flex; align-items: center; gap: 8px; background: var(--kit-line); clip-path: var(--jgk-parchment-swallow); }
.${P}-ribbon::before { content: ""; position: absolute; inset: 3px; background: var(--jgk-parchment-face, var(--kit-surface)); clip-path: var(--jgk-parchment-swallow); }
.${P}-ribbon > * { position: relative; }

/* Buttons */
.${P}-btn { position: relative; display: inline-flex; align-items: center; min-height: 48px; padding: 0; border: 0; background: none; color: var(--kit-ink); font: 400 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.12em; cursor: pointer; transition: transform calc(160ms * var(--kit-motion)) var(--kit-ease); }
.${P}-btn[data-size="sm"] { min-height: 36px; font-size: calc(14px * var(--kit-text)); }
.${P}-btn[data-size="lg"] { min-height: 58px; font-size: calc(23px * var(--kit-text)); }
.${P}-btn[data-variant="primary"] { padding-left: 24px; }
.${P}-btn .${P}-ribbon { padding: 10px 26px 9px 30px; }
.${P}-btn[data-size="sm"] .${P}-ribbon { padding: 6px 16px 5px 22px; }
.${P}-btn[data-size="lg"] .${P}-ribbon { padding: 14px 34px 13px 38px; }
.${P}-btn[data-variant="primary"] .${P}-ribbon { margin-left: 22px; --jgk-parchment-face: var(--kit-surface); }
.${P}-btn[data-variant="secondary"] .${P}-ribbon { --jgk-parchment-face: var(--kit-surface-alt); }
.${P}-btn[data-variant="secondary"][data-tone="bad"] .${P}-btn-label { color: var(--kit-bad); }
.${P}-btn[data-variant="secondary"][data-tone="good"] .${P}-btn-label { color: var(--kit-good); }
.${P}-btn-label { white-space: nowrap; }
.${P}-btn-icon { display: inline-grid; place-items: center; font-size: 1.1em; }
.${P}-seal { position: absolute; z-index: 2; left: 0; top: 50%; width: 48px; height: 48px; margin-top: -24px; display: grid; place-items: center; overflow: hidden; border-radius: 52% 48% 55% 45% / 48% 54% 46% 52%; background: radial-gradient(circle at 34% 30%, rgba(255, 220, 210, 0.38) 0 9%, transparent 24%), radial-gradient(circle at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.22) 72%, transparent 80%), var(--kit-wax); color: var(--kit-surface); font: 400 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); white-space: nowrap; box-shadow: 0 0 0 2px var(--kit-line), 2px 4px 0 rgba(43, 29, 18, 0.4); }
.${P}-seal::before { content: ""; position: absolute; inset: 6px; border-radius: 50%; border: 1.5px dashed rgba(255, 210, 200, 0.3); }
.${P}-btn[data-tone="good"] .${P}-seal { background: radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.35) 0 9%, transparent 24%), var(--kit-good); }
.${P}-btn[data-tone="warn"] .${P}-seal { background: radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.35) 0 9%, transparent 24%), var(--kit-warn); color: var(--kit-ink); }
.${P}-btn[data-tone="bad"] .${P}-seal { background: radial-gradient(circle at 34% 30%, rgba(255, 220, 210, 0.38) 0 9%, transparent 24%), var(--kit-bad); }
.${P}-btn[data-tone="accent"] .${P}-seal { background: radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.5) 0 9%, transparent 24%), var(--kit-accent); color: var(--kit-accent-ink); }
.${P}-glyph { position: relative; display: inline-grid; place-items: center; min-width: 26px; height: 26px; padding: 0 4px; border: 2px solid var(--kit-line); border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff8e6, var(--kit-surface-alt)); color: var(--kit-ink); font: 400 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); box-shadow: 1px 2px 0 rgba(43, 29, 18, 0.35); }
.${P}-btn[data-variant="ghost"] { min-height: 0; padding: 4px 6px; font-family: var(--kit-font-body); font-style: italic; font-size: calc(19px * var(--kit-text)); font-variant-caps: normal; letter-spacing: 0.02em; text-shadow: 0 0 3px var(--kit-surface), 0 0 6px var(--kit-surface), 0 0 2px var(--kit-surface); }
.${P}-btn[data-variant="ghost"][data-size="sm"] { font-size: calc(16px * var(--kit-text)); }
.${P}-btn[data-variant="ghost"][data-size="lg"] { font-size: calc(24px * var(--kit-text)); }
.${P}-btn[data-variant="ghost"] .${P}-btn-text { position: relative; display: inline-flex; align-items: center; gap: 8px; padding-bottom: 10px; }
.${P}-btn[data-variant="ghost"] .${P}-btn-text::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 9px; background: var(--kit-accent); -webkit-mask: var(--jgk-parchment-flourish) center / 100% 100% no-repeat; mask: var(--jgk-parchment-flourish) center / 100% 100% no-repeat; }
.${P}-btn[data-variant="ghost"] .${P}-glyph { box-shadow: none; }
@media (hover: hover) { .${P}-btn:not(:disabled):hover { transform: translateY(-2px) rotate(-0.6deg); } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: translateY(1px); }
.${P}-btn[data-pressed] .${P}-ribbon::before { background: var(--kit-surface-alt); }
.${P}-btn:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 5px; }
.${P}-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* Panels: a scroll (card/dialog), a deckled note (hud), a banner (strip), a page (pane) */
.${P}-panel { position: relative; margin: 0; color: var(--kit-ink); transform-origin: 50% 50%; animation: ${P}-unfurl calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel[data-state="closed"] { transform-origin: 50% 0; animation: ${P}-roll calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; pointer-events: none; }
.${P}-face { position: relative; padding: 14px 16px 12px; background:
  radial-gradient(circle at 22% 30%, transparent 0 34%, rgba(128, 86, 34, 0.1) 36%, transparent 40%),
  radial-gradient(circle at 76% 64%, transparent 0 28%, rgba(128, 86, 34, 0.09) 30%, transparent 34%),
  radial-gradient(ellipse 40% 26% at 16% 24%, rgba(120, 80, 30, 0.2), transparent 72%),
  radial-gradient(ellipse 30% 22% at 86% 72%, rgba(120, 80, 30, 0.18), transparent 72%),
  radial-gradient(ellipse 26% 18% at 62% 14%, rgba(255, 255, 255, 0.45), transparent 72%),
  radial-gradient(ellipse 50% 30% at 46% 100%, rgba(110, 70, 25, 0.16), transparent 76%),
  repeating-linear-gradient(0deg, rgba(90, 59, 30, 0.035) 0 1px, transparent 1px 3px),
  repeating-linear-gradient(74deg, rgba(90, 59, 30, 0.03) 0 1px, transparent 1px 7px),
  var(--kit-surface); }
.${P}-body { position: relative; font: 400 calc(15px * var(--kit-text)) / 1.45 var(--kit-font-body); color: var(--kit-ink); }
.${P}-foot { position: relative; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; margin-top: 14px; padding-top: 10px; background: linear-gradient(90deg, transparent, var(--kit-line) 20%, var(--kit-line) 80%, transparent) top / 100% 1px no-repeat; }
.${P}-head { position: relative; display: flex; align-items: flex-end; gap: 10px; margin-bottom: 10px; }
.${P}-head-text { display: grid; gap: 3px; min-width: 0; }
.${P}-eyebrow { font: italic 400 calc(14px * var(--kit-text)) / 1.1 var(--kit-font-body); letter-spacing: 0.04em; color: var(--kit-ink); opacity: 0.78; }
.${P}-title { display: block; font: 400 calc(18px * var(--kit-text)) / 1.1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.14em; color: var(--kit-ink); padding-bottom: 5px; background: linear-gradient(90deg, var(--kit-accent), var(--kit-accent) 60%, transparent) bottom / 100% 2px no-repeat; }
.${P}-aside { margin-left: auto; font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; color: var(--kit-line); }

.${P}-orn { position: absolute; z-index: 1; width: 32px; height: 32px; background: var(--kit-accent); pointer-events: none; -webkit-mask: var(--jgk-parchment-orn) center / contain no-repeat; mask: var(--jgk-parchment-orn) center / contain no-repeat; }
.${P}-orn[data-corner="tl"] { left: 6px; top: 6px; }
.${P}-orn[data-corner="tr"] { right: 6px; top: 6px; transform: scaleX(-1); }
.${P}-orn[data-corner="bl"] { left: 6px; bottom: 6px; transform: scaleY(-1); }
.${P}-orn[data-corner="br"] { right: 6px; bottom: 6px; transform: scale(-1); }

/* hud: deckled torn note; the brown edge is the panel's own ::before, the face is clipped */
.${P}-panel[data-variant="hud"]::before { content: ""; position: absolute; inset: -4px; background: var(--kit-line); clip-path: var(--jgk-parchment-deckle); }
.${P}-panel[data-variant="hud"][data-tone="good"]::before { background: var(--kit-good); }
.${P}-panel[data-variant="hud"][data-tone="warn"]::before { background: var(--kit-warn); }
.${P}-panel[data-variant="hud"][data-tone="bad"]::before { background: var(--kit-bad); }
.${P}-panel[data-variant="hud"] .${P}-face { padding: 12px 14px 10px; clip-path: var(--jgk-parchment-deckle); box-shadow: inset 0 0 24px rgba(110, 70, 25, 0.3); }
.${P}-panel[data-variant="hud"] .${P}-orn { display: none; }
.${P}-panel[data-variant="hud"] .${P}-title { font-size: calc(16px * var(--kit-text)); }

/* card and dialog: a scroll with rolled ends wider than the sheet */
.${P}-panel[data-variant="card"] .${P}-face, .${P}-panel[data-variant="dialog"] .${P}-face { box-shadow: inset 0 0 0 1px rgba(90, 59, 30, 0.55), inset 0 0 34px rgba(110, 70, 25, 0.26); }
.${P}-panel[data-variant="card"] .${P}-face { padding: 20px 26px 18px; }
.${P}-panel[data-variant="dialog"] .${P}-face { padding: 32px 36px 28px; }
.${P}-panel[data-variant="card"] .${P}-face::before, .${P}-panel[data-variant="card"] .${P}-face::after,
.${P}-panel[data-variant="dialog"] .${P}-face::before, .${P}-panel[data-variant="dialog"] .${P}-face::after { content: ""; position: absolute; left: -20px; right: -20px; height: 22px; border-radius: 11px; background:
  radial-gradient(circle at 0 50%, #3b2412 0 11px, transparent 11.5px),
  radial-gradient(circle at 100% 50%, #3b2412 0 11px, transparent 11.5px),
  linear-gradient(180deg, rgba(255, 244, 214, 0.6) 0%, rgba(255, 244, 214, 0) 34%, rgba(0, 0, 0, 0) 58%, rgba(28, 15, 5, 0.5) 100%),
  linear-gradient(180deg, #d9b97d 0%, #a57a40 46%, #6b4620 100%); box-shadow: 0 3px 5px rgba(43, 29, 18, 0.38); }
.${P}-panel[data-variant="card"] .${P}-face::before, .${P}-panel[data-variant="dialog"] .${P}-face::before { top: -11px; }
.${P}-panel[data-variant="card"] .${P}-face::after, .${P}-panel[data-variant="dialog"] .${P}-face::after { bottom: -11px; }
.${P}-panel[data-variant="card"] .${P}-face::before, .${P}-panel[data-variant="card"] .${P}-face::after { height: 18px; border-radius: 9px; left: -16px; right: -16px; }
.${P}-panel[data-variant="card"] .${P}-face::before { top: -9px; }
.${P}-panel[data-variant="card"] .${P}-face::after { bottom: -9px; }
.${P}-panel[data-variant="dialog"] .${P}-title { display: block; font-size: calc(30px * var(--kit-text)); letter-spacing: 0.12em; padding-bottom: 8px; }
.${P}-panel[data-variant="dialog"] .${P}-title::first-letter { float: left; font-size: 2.3em; line-height: 0.8; padding: 0.06em 0.1em 0 0; font-variant-caps: normal; color: var(--kit-wax); text-shadow: 1px 1px 0 var(--kit-accent), -0.5px -0.5px 0 var(--kit-accent); }
.${P}-panel[data-variant="dialog"] .${P}-foot { margin-top: 18px; }
.${P}-panel[data-variant="card"] .${P}-title { font-size: calc(20px * var(--kit-text)); }
.${P}-panel[data-tone="good"] .${P}-title::first-letter { color: var(--kit-good); }
.${P}-panel[data-tone="warn"] .${P}-title::first-letter { color: var(--kit-warn); }
.${P}-panel[data-tone="bad"] .${P}-title::first-letter { color: var(--kit-bad); }
.${P}-panel[data-tone="accent"] .${P}-title::first-letter { color: var(--kit-accent); }

/* pane: a page with a double gold keyline */
.${P}-panel[data-variant="pane"] .${P}-face { padding: 22px 24px 20px; box-shadow: inset 0 0 0 4px var(--kit-surface), inset 0 0 0 5px var(--kit-accent), inset 0 0 40px rgba(110, 70, 25, 0.2); }
.${P}-panel[data-variant="pane"] .${P}-orn { width: 22px; height: 22px; }
.${P}-panel[data-variant="pane"] .${P}-orn[data-corner="tl"], .${P}-panel[data-variant="pane"] .${P}-orn[data-corner="tr"], .${P}-panel[data-variant="pane"] .${P}-orn[data-corner="bl"], .${P}-panel[data-variant="pane"] .${P}-orn[data-corner="br"] { left: auto; right: auto; top: auto; bottom: auto; }
.${P}-panel[data-variant="pane"] .${P}-orn[data-corner="tl"] { left: 4px; top: 4px; }
.${P}-panel[data-variant="pane"] .${P}-orn[data-corner="tr"] { right: 4px; top: 4px; }
.${P}-panel[data-variant="pane"] .${P}-orn[data-corner="bl"] { left: 4px; bottom: 4px; }
.${P}-panel[data-variant="pane"] .${P}-orn[data-corner="br"] { right: 4px; bottom: 4px; }

/* strip: a gold banner with swallowtail ends and a brown edge */
.${P}-panel[data-variant="strip"]::before { content: ""; position: absolute; inset: -3px; background: var(--kit-line); clip-path: var(--jgk-parchment-swallow); }
.${P}-panel[data-variant="strip"] .${P}-face { display: flex; align-items: center; gap: 14px; padding: 8px 30px; background: linear-gradient(180deg, color-mix(in srgb, var(--kit-accent) 70%, #fff) 0%, var(--kit-accent) 52%, color-mix(in srgb, var(--kit-accent) 80%, #000) 100%); clip-path: var(--jgk-parchment-swallow); color: var(--kit-accent-ink); }
.${P}-panel[data-variant="strip"] .${P}-face::before { display: none; }
.${P}-panel[data-variant="strip"] .${P}-orn { display: none; }
.${P}-panel[data-variant="strip"] .${P}-head { margin: 0; }
.${P}-panel[data-variant="strip"] .${P}-title { font-size: calc(20px * var(--kit-text)); background: none; padding: 0; color: var(--kit-accent-ink); }
.${P}-panel[data-variant="strip"] .${P}-eyebrow { color: var(--kit-accent-ink); }
.${P}-panel[data-variant="strip"] .${P}-aside { color: var(--kit-accent-ink); opacity: 0.85; }
.${P}-panel[data-variant="strip"] .${P}-body { color: var(--kit-accent-ink); }

/* Meter: a glass vial (bar), rune diamonds (segments), a gold compass bezel (ring) */
.${P}-meter { --jgk-parchment-tone: var(--kit-accent); display: grid; gap: 6px; min-width: 140px; color: var(--kit-ink); }
.${P}-meter[data-tone="good"] { --jgk-parchment-tone: var(--kit-good); }
.${P}-meter[data-tone="warn"] { --jgk-parchment-tone: var(--kit-warn); }
.${P}-meter[data-tone="bad"] { --jgk-parchment-tone: var(--kit-bad); }
.${P}-meter[data-tone="neutral"] { --jgk-parchment-tone: var(--kit-line); }
.${P}-meter-text { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; text-shadow: 0 0 3px var(--kit-surface), 0 0 6px var(--kit-surface), 0 0 2px var(--kit-surface); }
.${P}-meter-label { font: 400 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.12em; }
.${P}-meter-readout { font: 700 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; }
.${P}-track { position: relative; display: block; height: 18px; margin: 0 10px; border: 2px solid var(--kit-line); border-radius: 10px; background: linear-gradient(90deg, #120b05 0%, #3b2815 16%, #1d130a 50%, #3b2815 84%, #120b05 100%); box-shadow: inset 0 3px 5px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 250, 235, 0.6); }
.${P}-track::before, .${P}-track::after { content: ""; position: absolute; top: -5px; bottom: -5px; width: 9px; border: 1px solid var(--kit-line); border-radius: 4px; background: linear-gradient(180deg, #f7dc96 0%, var(--kit-accent) 50%, #6e4a1a 100%); }
.${P}-track::before { left: -12px; }
.${P}-track::after { right: -12px; }
.${P}-fill { position: absolute; left: 0; top: 0; bottom: 0; min-width: 0; border-radius: 8px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0) 42%, rgba(0, 0, 0, 0.26) 100%), var(--jgk-parchment-tone); transition: width calc(320ms * var(--kit-motion)) var(--kit-ease); }
.${P}-fill::after { content: ""; position: absolute; left: 6px; right: 12px; top: 3px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.7); }
.${P}-meter[data-size="sm"] .${P}-track { height: 12px; }
.${P}-meter[data-size="lg"] .${P}-track { height: 26px; }
.${P}-cells { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
.${P}-cell { flex: 0 0 11px; height: 11px; border: 2px solid var(--kit-line); background: linear-gradient(135deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 60%), var(--kit-surface-alt); transform: rotate(45deg); box-shadow: 1px 2px 0 rgba(43, 29, 18, 0.35); }
.${P}-cell[data-lit] { background: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 55%), var(--jgk-parchment-tone); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 10px; min-width: 0; }
.${P}-ring { width: 52px; height: 52px; overflow: visible; }
.${P}-meter[data-size="lg"] .${P}-ring { width: 70px; height: 70px; }
.${P}-ring-bezel { fill: none; stroke: var(--kit-accent); stroke-width: 3.2; }
.${P}-ring-tick { stroke: var(--kit-line); stroke-width: 0.8; }
.${P}-ring-major { stroke: var(--kit-line); stroke-width: 1.4; }
.${P}-ring-track { fill: none; stroke: #3a2814; stroke-width: 5; }
.${P}-ring-fill { fill: none; stroke: var(--jgk-parchment-tone); stroke-width: 5; stroke-linecap: butt; transition: stroke-dasharray calc(320ms * var(--kit-motion)) var(--kit-ease); }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 3px; }

/* Prompt: a gold-rimmed medallion with the glyph, and an italic label on a small ribbon */
.${P}-prompt { --jgk-parchment-tone: var(--kit-accent); position: relative; display: inline-flex; align-items: center; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; cursor: default; }
.${P}-prompt[data-tone="good"] { --jgk-parchment-tone: var(--kit-good); }
.${P}-prompt[data-tone="warn"] { --jgk-parchment-tone: var(--kit-warn); }
.${P}-prompt[data-tone="bad"] { --jgk-parchment-tone: var(--kit-bad); }
button.${P}-prompt { cursor: pointer; }
button.${P}-prompt:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 5px; }
.${P}-medal { position: relative; z-index: 2; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; border: 3px solid var(--jgk-parchment-tone); background: radial-gradient(circle at 35% 30%, #fff8e6 0%, var(--kit-surface) 46%, var(--kit-surface-alt) 100%); color: var(--kit-ink); font: 400 calc(19px * var(--kit-text)) / 1 var(--kit-font-display); box-shadow: 0 0 0 1.5px var(--kit-line), 2px 3px 0 rgba(43, 29, 18, 0.42); --jgk-parchment-progress: 0deg; }
.${P}-medal::before { content: ""; position: absolute; inset: -7px; border-radius: 50%; background: conic-gradient(var(--kit-wax) var(--jgk-parchment-progress), transparent 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); }
.${P}-medal[data-device="touch"] { width: 52px; height: 52px; box-shadow: 0 0 0 2px var(--kit-surface), 0 0 0 4px var(--kit-accent), 2px 3px 0 rgba(43, 29, 18, 0.42); }
.${P}-prompt-ribbon { margin-left: -14px; padding: 6px 20px 5px 28px; }
.${P}-prompt-label { font: italic 400 calc(17px * var(--kit-text)) / 1 var(--kit-font-body); letter-spacing: 0.02em; color: var(--kit-ink); white-space: nowrap; }
.${P}-prompt-ribbon { animation: ${P}-ribbon-in calc(260ms * var(--kit-motion)) var(--kit-ease) both; }

/* Toast: a banner unfurling from the centre, swallowtail ends; bad and warn are wax and warn banners with a dark text plate */
.${P}-toast { --jgk-parchment-tone: var(--kit-surface); position: relative; max-width: 380px; transform-origin: 50% 50%; animation: ${P}-unfurl-x calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-toast[data-state="closed"] { transform-origin: 50% 0; animation: ${P}-roll calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; }
.${P}-toast[data-tone="bad"] { --jgk-parchment-tone: var(--kit-wax); }
.${P}-toast[data-tone="warn"] { --jgk-parchment-tone: var(--kit-warn); }
.${P}-banner { --jgk-parchment-face: var(--jgk-parchment-tone); display: flex; align-items: center; gap: 12px; padding: 10px 26px 9px 22px; }
.${P}-toast[data-tone="good"] .${P}-banner { --jgk-parchment-face: var(--kit-surface); }
.${P}-toast[data-tone="accent"] .${P}-banner { --jgk-parchment-face: var(--kit-surface); }
.${P}-toast-icon { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--kit-line); background: radial-gradient(circle at 35% 30%, #fff8e6, var(--kit-accent)); color: var(--kit-ink); font-size: calc(17px * var(--kit-text)); box-shadow: 1px 2px 0 rgba(43, 29, 18, 0.35); }
.${P}-toast[data-tone="good"] .${P}-toast-icon { background: radial-gradient(circle at 35% 30%, #f1ffe8, var(--kit-good)); }
.${P}-toast[data-tone="bad"] .${P}-toast-icon, .${P}-toast[data-tone="warn"] .${P}-toast-icon { background: radial-gradient(circle at 35% 30%, #fff8e6, var(--kit-accent)); }
.${P}-toast-text { display: grid; gap: 2px; min-width: 0; }
.${P}-toast[data-tone="bad"] .${P}-toast-text, .${P}-toast[data-tone="warn"] .${P}-toast-text { padding: 5px 14px 4px; background: var(--kit-ink); color: var(--kit-surface); clip-path: var(--jgk-parchment-swallow); }
.${P}-toast-title { font: 400 calc(17px * var(--kit-text)) / 1.1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.1em; }
.${P}-toast[data-tone="bad"] .${P}-toast-title, .${P}-toast[data-tone="warn"] .${P}-toast-title { color: var(--kit-accent); }
.${P}-toast-body { font: italic 400 calc(15px * var(--kit-text)) / 1.25 var(--kit-font-body); }
.${P}-toast[data-tone="bad"] .${P}-toast-body, .${P}-toast[data-tone="warn"] .${P}-toast-body { color: var(--kit-surface); }
.${P}-toast-count { position: absolute; z-index: 3; top: -12px; right: -12px; display: grid; place-items: center; min-width: 38px; height: 38px; padding: 0 4px; border-radius: 50%; border: 2px solid var(--kit-line); background: radial-gradient(circle at 35% 30%, #fff8e6, var(--kit-accent)); color: var(--kit-ink); font: 400 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); transform: rotate(-8deg); box-shadow: 2px 3px 0 rgba(43, 29, 18, 0.4); }

/* Menu: lines in an old book; the active line gets a fleuron, a gold flourish and a warm wash */
.${P}-menu { display: grid; gap: 2px; justify-items: start; min-width: 260px; }
.${P}-menu[data-variant="title"] { min-width: 340px; }
.${P}-item { position: relative; display: flex; align-items: baseline; gap: 14px; width: 100%; min-width: 260px; padding: 9px 16px 7px 16px; border: 0; border-bottom: 1px solid rgba(90, 59, 30, 0.42); background: linear-gradient(90deg, rgba(241, 227, 194, 0.94) 0%, rgba(241, 227, 194, 0.78) 72%, rgba(241, 227, 194, 0) 100%); color: var(--kit-ink); font: 400 calc(21px * var(--kit-text)) / 1.1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.1em; text-align: left; cursor: pointer; text-shadow: 0 0 3px rgba(241, 227, 194, 0.9); transition: padding-left calc(160ms * var(--kit-motion)) var(--kit-ease), background-color calc(160ms * var(--kit-motion)) linear; }
.${P}-menu[data-variant="title"] .${P}-item { min-width: 340px; font-size: calc(30px * var(--kit-text)); padding: 14px 18px 10px; }
.${P}-menu[data-variant="pause"] .${P}-item { min-width: 280px; }
.${P}-item:hover:not(:disabled) { padding-left: 24px; }
.${P}-item[data-active] { padding-left: 42px; background: linear-gradient(90deg, rgba(226, 180, 96, 0.96) 0%, rgba(236, 206, 146, 0.94) 55%, rgba(241, 227, 194, 0.9) 100%); font-weight: 700; }
.${P}-item[data-active]::before { content: "❧"; position: absolute; left: 12px; top: 50%; margin-top: -0.6em; font: 400 1.05em / 1 "Segoe UI Symbol", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; color: var(--kit-wax); }
.${P}-item[data-active]::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: -7px; height: 11px; background: var(--kit-accent); -webkit-mask: var(--jgk-parchment-flourish) center / 100% 100% no-repeat; mask: var(--jgk-parchment-flourish) center / 100% 100% no-repeat; }
.${P}-item[data-secondary] { min-width: 0; width: auto; padding: 4px 10px 3px; font-family: var(--kit-font-body); font-style: italic; font-variant-caps: normal; font-size: calc(16px * var(--kit-text)); letter-spacing: 0.02em; border-bottom: 0; background: none; }
.${P}-item[data-secondary][data-active] { background: linear-gradient(90deg, rgba(184, 134, 43, 0.3), rgba(241, 227, 194, 0)); }
.${P}-item[data-secondary][data-active]::after { bottom: -2px; }
.${P}-item:disabled { opacity: 0.45; cursor: not-allowed; }
.${P}-item:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 3px; }
.${P}-item-label { position: relative; flex: 1 1 auto; }
.${P}-item-hint { position: relative; font: italic 400 calc(14px * var(--kit-text)) / 1.2 var(--kit-font-body); letter-spacing: 0.01em; text-transform: none; opacity: 0.8; }
.${P}-badge { position: relative; display: inline-grid; place-items: center; min-width: 40px; height: 22px; padding: 0 8px; background: var(--kit-wax); color: var(--kit-surface); font: 400 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.08em; clip-path: var(--jgk-parchment-swallow); }
.${P}-rule { display: block; width: 100%; margin: 10px 0 8px; text-align: center; font: 400 calc(20px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.3em; color: var(--kit-line); text-shadow: 0 0 3px var(--kit-surface), 0 0 5px var(--kit-surface); }

/* MinimapFrame: a gold compass bezel with ticks (circle) or a deckled parchment map (square) */
.${P}-map { position: relative; flex: none; margin: 0 0 16px; }
.${P}-map-rim { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(color-mix(in srgb, var(--kit-accent) 55%, #fff) 0 25%, var(--kit-accent) 0 50%, color-mix(in srgb, var(--kit-accent) 55%, #000) 0 75%, var(--kit-accent) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px)); mask: radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px)); }
.${P}-map-ticks { position: absolute; inset: 0; border-radius: 50%; background: repeating-conic-gradient(var(--kit-line) 0deg 0.9deg, transparent 0.9deg 6deg); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9.5px), #000 calc(100% - 6px), transparent calc(100% - 5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9.5px), #000 calc(100% - 6px), transparent calc(100% - 5px)); }
.${P}-map-window { position: absolute; inset: 11px; overflow: hidden; background: var(--kit-surface-alt); border-radius: 50%; box-shadow: inset 0 0 0 2px var(--kit-line), inset 0 0 22px rgba(43, 29, 18, 0.5); }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; }
.${P}-map-north > span { position: absolute; left: 50%; top: -12px; display: grid; place-items: center; width: 28px; height: 28px; margin-left: -14px; border: 2px solid var(--kit-line); border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff8e6, var(--kit-accent)); color: var(--kit-ink); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); box-shadow: 1px 2px 0 rgba(43, 29, 18, 0.4); }
.${P}-map-label { position: absolute; left: 50%; bottom: -18px; transform: translateX(-50%); white-space: nowrap; }
.${P}-map-label .${P}-ribbon { padding: 4px 18px 3px 18px; --jgk-parchment-swallow: polygon(0 0, 100% 0, calc(100% - 7px) 50%, 100% 100%, 0 100%, 7px 50%); }
.${P}-map-label-text { font: 400 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); font-variant-caps: all-small-caps; letter-spacing: 0.12em; color: var(--kit-ink); }
.${P}-map[data-shape="square"] .${P}-map-rim { inset: -6px; border-radius: 0; background: var(--kit-line); clip-path: var(--jgk-parchment-deckle); -webkit-mask: none; mask: none; }
.${P}-map[data-shape="square"] .${P}-map-ticks { display: none; }
.${P}-map[data-shape="square"] .${P}-map-window { inset: 0; border-radius: 0; clip-path: var(--jgk-parchment-deckle); box-shadow: inset 0 0 26px rgba(90, 59, 30, 0.5); }

@keyframes ${P}-unfurl { from { transform: scaleY(0.04); opacity: 0; } 30% { opacity: 1; } to { transform: scaleY(1); opacity: 1; } }
@keyframes ${P}-unfurl-x { from { transform: scaleX(0.02); opacity: 0; } 30% { opacity: 1; } to { transform: scaleX(1); opacity: 1; } }
@keyframes ${P}-roll { to { transform: scaleY(0.04); opacity: 0; } }
@keyframes ${P}-ribbon-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
`;

/**
 * Grimoire: painterly fantasy parchment. Stained paper with torn or rolled edges, gold filigree corners,
 * serif small caps, wax seals, glass vial meters, rune pips, a gold compass rim and unfurling banners.
 *
 * @capability ui-kit-parchment painterly fantasy parchment UI kit — stained paper, wax seals, scroll panels, vial meters, compass rims, unfurl motion, plucked-string sounds
 */
export const parchmentKit: UiKit = {
  id: "parchment",
  name: "Grimoire",
  description: "Painterly fantasy parchment: stained paper, rolled scrolls, wax seals, gold filigree and vial meters.",
  tokens: {
    ink: "#2b1d12",
    surface: "#f1e3c2",
    surfaceAlt: "#e0c99a",
    accent: "#b8862b",
    accentInk: "#2b1d12",
    good: "#4f7d3a",
    warn: "#c7832a",
    bad: "#8e1c1c",
    line: "#5a3b1e",
    scrim: "rgba(20, 12, 4, 0.6)",
    wax: "#9b1b1b",
    fontDisplay: "\"Cinzel\", \"Trajan Pro\", \"Palatino Linotype\", \"Book Antiqua\", Palatino, Georgia, serif",
    fontBody: "\"Palatino Linotype\", \"Book Antiqua\", Palatino, Georgia, serif",
    fontMono: "\"Courier New\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 360, exitMs: 280, ease: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.5, maxVoices: 3, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 659, slideTo: 600, duration: 0.12, gain: 0.26, attack: 0.001 }, { kind: "noise", filterType: "highpass", filterFreq: 4200, duration: 0.02, gain: 0.04 }] } }),
    hover: kitCueSound("hover", { gain: 0.35, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 2600, duration: 0.035, gain: 0.07 }] } }),
    open: kitCueSound("open", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "bandpass", filterFreq: 1500, duration: 0.2, gain: 0.12 }, { kind: "tone", wave: "triangle", freq: 392, duration: 0.22, gain: 0.2, attack: 0.002 }, { kind: "tone", wave: "triangle", freq: 587, duration: 0.2, gain: 0.14, delay: 0.06 }] } }),
    close: kitCueSound("close", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "noise", filterType: "lowpass", filterFreq: 900, duration: 0.18, gain: 0.12 }, { kind: "tone", wave: "triangle", freq: 330, slideTo: 262, duration: 0.16, gain: 0.16 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 523, duration: 0.2, gain: 0.22, attack: 0.002 }, { kind: "tone", wave: "triangle", freq: 784, duration: 0.26, gain: 0.18, delay: 0.07 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "triangle", freq: 196, slideTo: 147, duration: 0.26, gain: 0.26, attack: 0.003 }, { kind: "noise", filterType: "lowpass", filterFreq: 500, duration: 0.12, gain: 0.08 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1760, duration: 0.3, gain: 0.2, attack: 0.002 }, { kind: "tone", wave: "sine", freq: 2637, duration: 0.22, gain: 0.08, delay: 0.02 }] } }),
  },
};
