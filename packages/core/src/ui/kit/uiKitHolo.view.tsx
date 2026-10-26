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
} from "./uiKit.view";

const P = "jgk-holo";

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** A data tag from a label, like `0x3F`: the same label always gets the same tag. */
function hexTag(text: string): string {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) & 0xff;
  return `0x${hash.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** A menu row index as hex: the first row is `0x01`. */
function hexIndex(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
}

function readoutText(value: number, max: number, readout: KitMeterProps["readout"]): ReactNode {
  if (readout === true) return `${Math.round(value)} / ${Math.round(max)}`;
  return readout === false || readout === undefined ? null : readout;
}

/** A chamfered outline: the edge colour, with the glass fill one pixel inside it. Both cut at `--jgk-holo-cut`. */
function Shape(): ReactNode {
  return (
    <span className={`${P}-edge`} aria-hidden="true">
      <span className={`${P}-fill`} />
    </span>
  );
}

/** Corner brackets sitting just outside a frame. */
function Brackets(): ReactNode {
  return <span className={`${P}-brackets`} aria-hidden="true" />;
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
      <Shape />
      {icon === undefined ? null : <span className={`${P}-btn-icon`}>{icon}</span>}
      <span className={`${P}-btn-label`}>{children}</span>
      {glyph === undefined ? null : <span className={`${P}-glyph`}>{glyph}</span>}
    </button>
  );
}

function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  const tag = hexTag(typeof eyebrow === "string" ? eyebrow : typeof title === "string" ? title : "");
  return (
    <Tag {...rest} className={cx(`${P}-panel`, className)} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"}>
      <Shape />
      {variant === "pane" || variant === "strip" ? null : <Brackets />}
      {head ? (
        <header className={`${P}-panel-head`}>
          {eyebrow === undefined && aside === undefined ? null : (
            <span className={`${P}-panel-top`}>
              {eyebrow === undefined ? null : (
                <span className={`${P}-eyebrow`}>
                  <i>{tag}</i>
                  {"·"}
                  {eyebrow}
                </span>
              )}
              {aside === undefined ? null : <span className={`${P}-aside`}>{aside}</span>}
            </span>
          )}
          {title === undefined ? null : (
            <span className={`${P}-title-row`}>
              <span className={`${P}-title`}>{title}</span>
              <span className={`${P}-rule`} aria-hidden="true" />
            </span>
          )}
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
    const ticks = 48;
    const arc = 2 * Math.PI * 10;
    return (
      <div {...common}>
        <svg className={`${P}-ring`} viewBox="0 0 44 44" aria-hidden="true">
          {Array.from({ length: ticks }, (_, index) => {
            const angle = (index / ticks) * 2 * Math.PI - Math.PI / 2;
            return (
              <line
                key={index}
                className={`${P}-tick`}
                data-lit={index / ticks < fraction ? "" : undefined}
                x1={22 + Math.cos(angle) * 17.5}
                y1={22 + Math.sin(angle) * 17.5}
                x2={22 + Math.cos(angle) * 20.5}
                y2={22 + Math.sin(angle) * 20.5}
              />
            );
          })}
          <circle cx="22" cy="22" r="13" className={`${P}-ring-track`} />
          <circle cx="22" cy="22" r="10" className={`${P}-ring-fill`} strokeDasharray={`${arc * fraction} ${arc}`} transform="rotate(-90 22 22)" />
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
        <span className={`${P}-cells`}>
          {Array.from({ length: Math.max(1, Math.floor(segments)) }, (_, index) => (
            <span key={index} className={`${P}-cell`} data-lit={index < lit ? "" : undefined} />
          ))}
        </span>
      </div>
    );
  }
  return (
    <div {...common}>
      {caption}
      <span className={`${P}-track`}>
        <span className={`${P}-fill-bar`} style={{ width: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}

function Prompt({ glyph, label, device, progress, tone = "accent", onActivate, className, style }: KitPromptProps): ReactNode {
  const sweep = progress === undefined ? undefined : ({ "--jgk-holo-progress": `${Math.round(Math.min(1, Math.max(0, progress)) * 360)}deg` } as CSSProperties);
  const body = (
    <>
      <span className={`${P}-prompt-hex`} data-device={device} style={sweep}>
        <span className={`${P}-prompt-fill`} aria-hidden="true" />
        <span className={`${P}-prompt-glyph`}>{glyph}</span>
      </span>
      <span className={`${P}-prompt-link`} aria-hidden="true" />
      <span className={`${P}-prompt-label`}>
        <Shape />
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
  const tag = hexTag(typeof children === "string" ? children : typeof title === "string" ? title : "");
  return (
    <div className={cx(`${P}-toast`, className)} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style} role="status">
      <Shape />
      {mark === null ? null : <span className={`${P}-toast-icon`}>{mark}</span>}
      <span className={`${P}-toast-text`}>
        {title === undefined ? null : <span className={`${P}-toast-title`}>{title}</span>}
        <span className={`${P}-toast-body`}>{children}</span>
      </span>
      <span className={`${P}-toast-hex`} aria-hidden="true">
        {tag}
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
      <Shape />
      <span className={`${P}-menu-bracket`} data-side="left" aria-hidden="true" />
      <span className={`${P}-menu-idx`}>{hexIndex(items.indexOf(item) + 1)}</span>
      <span className={`${P}-menu-label`}>{item.label}</span>
      {item.badge === undefined ? null : <span className={`${P}-menu-badge`}>{item.badge}</span>}
      {item.hint === undefined ? null : <span className={`${P}-menu-hint`}>{item.hint}</span>}
      <span className={`${P}-menu-bracket`} data-side="right" aria-hidden="true" />
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

/** Radar bezel for a round frame: a ring, a dashed inner ring, and degree ticks every 5 deg (major every 30). */
function Bezel({ size }: { size: number }): ReactNode {
  const c = size / 2;
  const ticks = Array.from({ length: 72 }, (_, index) => {
    const major = index % 6 === 0;
    const angle = (index * Math.PI) / 36;
    const outer = c - 2;
    const inner = outer - (major ? size * 0.09 : size * 0.04);
    return (
      <line
        key={index}
        className={`${P}-tick`}
        data-major={major ? "" : undefined}
        x1={c + Math.sin(angle) * inner}
        y1={c - Math.cos(angle) * inner}
        x2={c + Math.sin(angle) * outer}
        y2={c - Math.cos(angle) * outer}
      />
    );
  });
  return (
    <svg className={`${P}-bezel`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={c - 2} className={`${P}-bezel-ring`} />
      <circle cx={c} cy={c} r={c - 12} className={`${P}-bezel-inner`} />
      {ticks}
    </svg>
  );
}

function MinimapFrame({ children, size, shape = "square", label, heading, className, style }: KitMinimapFrameProps): ReactNode {
  return (
    <div className={cx(`${P}-map`, className)} data-shape={shape} style={{ width: size, height: size, ...style }}>
      {shape === "circle" ? (
        <Bezel size={size} />
      ) : (
        <>
          <Shape />
          <Brackets />
        </>
      )}
      <div className={`${P}-map-window`}>{children}</div>
      <span className={`${P}-map-north`} style={{ transform: `rotate(${-(heading ?? 0)}rad)` }} aria-hidden="true">
        <span>N</span>
      </span>
      {label === undefined ? null : (
        <span className={`${P}-map-label`}>
          <Shape />
          {label}
        </span>
      )}
    </div>
  );
}

const HEX = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";

const CSS = `
.${P}-btn, .${P}-panel, .${P}-meter, .${P}-prompt, .${P}-toast, .${P}-menu, .${P}-map { box-sizing: border-box; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-btn *, .${P}-panel *, .${P}-meter *, .${P}-toast *, .${P}-menu *, .${P}-map * { box-sizing: border-box; }

/* Chamfered outline: .edge is the cut outline (edge colour); .fill sits 1px inside, cut 3px shallower. */
.${P}-edge { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: var(--jgk-holo-edge, var(--kit-line)); clip-path: polygon(var(--jgk-holo-cut) 0, 100% 0, 100% calc(100% - var(--jgk-holo-cut)), calc(100% - var(--jgk-holo-cut)) 100%, 0 100%, 0 var(--jgk-holo-cut)); }
.${P}-fill { position: absolute; inset: 1px; overflow: hidden; pointer-events: none; clip-path: polygon(calc(var(--jgk-holo-cut) - 3px) 0, 100% 0, 100% calc(100% - var(--jgk-holo-cut) + 3px), calc(100% - var(--jgk-holo-cut) + 3px) 100%, 0 100%, 0 calc(var(--jgk-holo-cut) - 3px)); background: repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.07) 0 1px, transparent 1px 3px), linear-gradient(165deg, rgba(56, 232, 255, 0.2) 0%, rgba(7, 50, 63, 0.9) 34%, rgba(4, 32, 42, 0.94) 70%, rgba(56, 232, 255, 0.12) 100%); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); box-shadow: inset 0 0 18px var(--kit-glow); }

.${P}-brackets { --jgk-holo-b: 14px; position: absolute; inset: -7px; z-index: -1; pointer-events: none; background: linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 0 / var(--jgk-holo-b) 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 0 / 2px var(--jgk-holo-b) no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 0 / var(--jgk-holo-b) 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 0 / 2px var(--jgk-holo-b) no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 100% / var(--jgk-holo-b) 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 100% / 2px var(--jgk-holo-b) no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 100% / var(--jgk-holo-b) 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 100% / 2px var(--jgk-holo-b) no-repeat; }

/* Buttons: skewed chamfered parallelograms; the label is counter-skewed so it reads upright. */
.${P}-btn { --jgk-holo-cut: 9px; --jgk-holo-tone: var(--kit-accent); --jgk-holo-edge: var(--kit-line); position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-width: 128px; min-height: 44px; padding: 0 26px; border: 0; border-radius: 0; background: none; color: var(--kit-ink); font: 700 calc(15px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; cursor: pointer; transform: skewX(-12deg); transition: transform calc(120ms * var(--kit-motion)) var(--kit-ease); }
.${P}-btn[data-tone="good"] { --jgk-holo-tone: var(--kit-good); }
.${P}-btn[data-tone="warn"] { --jgk-holo-tone: var(--kit-warn); }
.${P}-btn[data-tone="bad"] { --jgk-holo-tone: var(--kit-bad); }
.${P}-btn[data-tone] { --jgk-holo-edge: var(--jgk-holo-tone); }
.${P}-btn > :not(.${P}-edge) { transform: skewX(12deg); }
.${P}-btn[data-size="sm"] { --jgk-holo-cut: 7px; min-height: 34px; min-width: 0; padding: 0 16px; font-size: calc(13px * var(--kit-text)); letter-spacing: 0.12em; }
.${P}-btn[data-size="lg"] { --jgk-holo-cut: 12px; min-height: 58px; padding: 0 38px; font-size: calc(20px * var(--kit-text)); }
.${P}-btn[data-variant="primary"] { --jgk-holo-edge: var(--jgk-holo-tone); color: var(--kit-accent-ink); }
.${P}-btn[data-variant="primary"] .${P}-fill { background: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 46%), var(--jgk-holo-tone); box-shadow: inset 0 -8px 14px rgba(0, 40, 52, 0.25); }
.${P}-btn[data-variant="secondary"] .${P}-fill { background: linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 0 / 10px 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 100% 0 / 2px 10px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 100% / 10px 2px no-repeat, linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)) 0 100% / 2px 10px no-repeat, repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.07) 0 1px, transparent 1px 3px), linear-gradient(180deg, rgba(56, 232, 255, 0.22), rgba(4, 32, 42, 0.9) 70%); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }
.${P}-btn[data-variant="ghost"] > .${P}-edge { display: none; }
.${P}-btn[data-variant="ghost"] { color: var(--kit-ink); }
.${P}-btn[data-variant="ghost"]::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: 5px; height: 2px; background: linear-gradient(90deg, var(--jgk-holo-tone), transparent); }
.${P}-btn-label { position: relative; }
.${P}-btn-icon { display: inline-flex; }
.${P}-btn:not(:disabled):hover .${P}-fill::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 40%; background: linear-gradient(90deg, transparent, rgba(217, 251, 255, 0.5), transparent); animation: ${P}-sweep calc(520ms * var(--kit-motion)) ease-out 1 both; }
@media (hover: hover) { .${P}-btn:not(:disabled):hover { transform: skewX(-12deg) translateX(3px); } }
.${P}-btn:not(:disabled):active, .${P}-btn[data-pressed] { transform: skewX(-12deg) translate(1px, 2px); }
.${P}-btn[data-pressed] .${P}-fill { filter: none; box-shadow: inset 0 0 22px rgba(255, 255, 255, 0.35); }
.${P}-btn:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 5px; }
.${P}-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.${P}-glyph { --jgk-holo-glyph: var(--kit-accent); position: relative; isolation: isolate; display: inline-grid; place-items: center; flex: none; min-width: 26px; height: 26px; padding: 0 5px; clip-path: ${HEX}; background: var(--jgk-holo-glyph); color: var(--jgk-holo-glyph); font: 700 calc(13px * var(--kit-text)) / 1 var(--kit-font-mono); }
.${P}-glyph::before { content: ""; position: absolute; inset: 1px; z-index: -1; clip-path: ${HEX}; background: var(--kit-surface); }
.${P}-btn[data-variant="primary"] .${P}-glyph { --jgk-holo-glyph: var(--kit-accent-ink); }
.${P}-btn[data-variant="primary"] .${P}-glyph::before { background: var(--kit-accent); }
.${P}-btn[data-variant="primary"] .${P}-glyph { color: var(--kit-accent-ink); }

/* Panels: chamfered glass, bracket corners, a hex data tag and a rule under the title. */
.${P}-panel { --jgk-holo-cut: 12px; --jgk-holo-tone: var(--kit-accent); --jgk-holo-edge: var(--kit-line); position: relative; isolation: isolate; display: grid; gap: 10px; padding: 16px 20px 15px; color: var(--kit-ink); font: 400 calc(14px * var(--kit-text)) / 1.4 var(--kit-font-body); animation: ${P}-project calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-panel[data-tone="accent"] { --jgk-holo-tone: var(--kit-accent); --jgk-holo-edge: var(--kit-accent); }
.${P}-panel[data-tone="good"] { --jgk-holo-tone: var(--kit-good); --jgk-holo-edge: var(--kit-good); }
.${P}-panel[data-tone="warn"] { --jgk-holo-tone: var(--kit-warn); --jgk-holo-edge: var(--kit-warn); }
.${P}-panel[data-tone="bad"] { --jgk-holo-tone: var(--kit-bad); --jgk-holo-edge: var(--kit-bad); }
.${P}-panel[data-state="closed"] { animation: ${P}-collapse calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; pointer-events: none; }
.${P}-panel[data-variant="hud"] { --jgk-holo-cut: 8px; gap: 7px; padding: 9px 12px 9px; }
.${P}-panel[data-variant="card"] { --jgk-holo-cut: 14px; padding: 18px 22px 18px; }
.${P}-panel[data-variant="dialog"] { --jgk-holo-cut: 26px; gap: 14px; padding: 30px 36px 26px; }
.${P}-panel[data-variant="dialog"] .${P}-brackets { --jgk-holo-b: 26px; inset: -10px; }
.${P}-panel[data-variant="pane"] { --jgk-holo-cut: 28px; gap: 14px; padding: 22px 24px; }
.${P}-panel[data-variant="pane"] > .${P}-edge { clip-path: polygon(var(--jgk-holo-cut) 0, 100% 0, 100% 100%, 0 100%, 0 var(--jgk-holo-cut)); }
.${P}-panel[data-variant="pane"] > .${P}-edge > .${P}-fill { clip-path: polygon(calc(var(--jgk-holo-cut) - 3px) 0, 100% 0, 100% 100%, 0 100%, 0 calc(var(--jgk-holo-cut) - 3px)); }
.${P}-panel[data-variant="strip"] { --jgk-holo-cut: 14px; display: flex; align-items: center; gap: 14px; padding: 7px 24px; }
.${P}-panel[data-variant="strip"] .${P}-panel-head { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; }
.${P}-panel[data-variant="strip"] .${P}-title-row { flex: 1; }
.${P}-panel[data-variant="strip"] .${P}-panel-top { margin-left: auto; }
.${P}-panel[data-variant="strip"] > .${P}-edge { clip-path: polygon(var(--jgk-holo-cut) 0, 100% 0, calc(100% - var(--jgk-holo-cut)) 100%, 0 100%); }
.${P}-panel[data-variant="strip"] > .${P}-edge > .${P}-fill { clip-path: polygon(calc(var(--jgk-holo-cut) - 3px) 0, 100% 0, calc(100% - var(--jgk-holo-cut) + 3px) 100%, 0 100%); background: linear-gradient(90deg, color-mix(in srgb, var(--jgk-holo-tone) 42%, transparent), rgba(4, 32, 42, 0.88) 78%); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }
.${P}-panel-head { display: grid; gap: 6px; min-width: 0; }
.${P}-panel-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.${P}-title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.${P}-eyebrow { display: inline-flex; gap: 2px; font: 500 calc(12px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.${P}-panel[data-variant="hud"] .${P}-title { font-size: calc(15px * var(--kit-text)); letter-spacing: 0.14em; }
.${P}-eyebrow i { font-style: normal; text-transform: none; color: var(--jgk-holo-tone); text-shadow: 0 0 8px var(--kit-glow); }
.${P}-title { color: var(--kit-ink); font: 400 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.2em; text-transform: uppercase; overflow-wrap: anywhere; text-shadow: 0 0 10px var(--kit-glow); }
.${P}-panel[data-tone] .${P}-title { color: var(--jgk-holo-tone); }
.${P}-panel[data-variant="dialog"] .${P}-title { font-size: calc(26px * var(--kit-text)); letter-spacing: 0.22em; }
.${P}-rule { flex: 1; min-width: 12px; height: 1px; background: linear-gradient(90deg, var(--jgk-holo-tone), transparent); opacity: 0.8; }
.${P}-aside { margin-left: auto; color: var(--kit-accent); font: 500 calc(14px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.06em; white-space: nowrap; }
.${P}-panel-body { font: 400 calc(14px * var(--kit-text)) / 1.4 var(--kit-font-body); letter-spacing: 0.02em; }
.${P}-panel-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 2px; padding-top: 10px; border-top: 1px solid var(--kit-line); }

/* Meters: a thin bar with a 10% tick ruler, chevron cells, or a double ring with an arc. */
.${P}-meter { --jgk-holo-tone: var(--kit-accent); display: grid; gap: 6px; min-width: 140px; color: var(--kit-ink); font-family: var(--kit-font-body); }
.${P}-meter[data-tone="good"] { --jgk-holo-tone: var(--kit-good); }
.${P}-meter[data-tone="warn"] { --jgk-holo-tone: var(--kit-warn); }
.${P}-meter[data-tone="bad"] { --jgk-holo-tone: var(--kit-bad); }
.${P}-meter-text { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.${P}-meter-label { font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.2em; text-transform: uppercase; }
.${P}-meter-readout { color: var(--jgk-holo-tone); font: 400 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.06em; font-variant-numeric: tabular-nums; text-shadow: 0 0 8px var(--kit-glow); }
.${P}-track { position: relative; display: block; height: 9px; margin-bottom: 4px; border: 1px solid var(--kit-line); background: rgba(4, 32, 42, 0.78); }
.${P}-track::before { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: repeating-linear-gradient(90deg, rgba(3, 19, 24, 0.7) 0 1px, transparent 1px 10%); }
.${P}-track::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 5px; margin-top: 2px; pointer-events: none; background: repeating-linear-gradient(90deg, var(--kit-line) 0 1px, transparent 1px 10%); }
.${P}-meter[data-size="sm"] .${P}-track { height: 6px; }
.${P}-meter[data-size="lg"] .${P}-track { height: 14px; }
.${P}-fill-bar { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, rgba(56, 232, 255, 0.2), var(--jgk-holo-tone)); transition: width calc(260ms * var(--kit-motion)) var(--kit-ease); }
.${P}-fill-bar::after { content: ""; position: absolute; right: -2px; top: -5px; bottom: -5px; width: 2px; background: var(--kit-ink); box-shadow: 0 0 8px var(--jgk-holo-tone); }
.${P}-cells { display: flex; gap: 4px; }
.${P}-cell { position: relative; flex: 1; height: 16px; background: var(--kit-line); clip-path: polygon(0 0, 74% 0, 100% 50%, 74% 100%, 0 100%, 26% 50%); }
.${P}-cell::before { content: ""; position: absolute; inset: 1px; background: rgba(4, 32, 42, 0.9); clip-path: polygon(0 0, 74% 0, 100% 50%, 74% 100%, 0 100%, 26% 50%); }
.${P}-cell[data-lit] { background: var(--jgk-holo-tone); box-shadow: 0 0 8px var(--kit-glow); }
.${P}-cell[data-lit]::before { background: var(--jgk-holo-tone); filter: none; box-shadow: inset 0 0 6px rgba(255, 255, 255, 0.6); }
.${P}-meter[data-variant="ring"] { grid-template-columns: auto 1fr; align-items: center; gap: 10px; min-width: 0; }
.${P}-ring { width: 46px; height: 46px; overflow: visible; }
.${P}-meter[data-size="sm"] .${P}-ring { width: 36px; height: 36px; }
.${P}-meter[data-size="lg"] .${P}-ring { width: 64px; height: 64px; }
.${P}-meter[data-variant="ring"] .${P}-meter-text { flex-direction: column; align-items: flex-start; gap: 3px; }
.${P}-tick { stroke: var(--kit-line); stroke-width: 1.2; }
.${P}-tick[data-lit] { stroke: var(--jgk-holo-tone); }
.${P}-ring-track { fill: rgba(4, 32, 42, 0.7); stroke: var(--kit-line); stroke-width: 1; }
.${P}-ring-fill { fill: none; stroke: var(--jgk-holo-tone); stroke-width: 3; stroke-linecap: butt; transition: stroke-dasharray calc(260ms * var(--kit-motion)) var(--kit-ease); }

/* Prompts: a hexagon holds the glyph and fills with the hold progress; a connector runs to a chamfered label. */
.${P}-prompt { --jgk-holo-tone: var(--kit-accent); display: inline-flex; align-items: center; gap: 0; padding: 0; border: 0; background: none; color: var(--kit-ink); font: inherit; cursor: default; animation: ${P}-project calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-prompt[data-tone="good"] { --jgk-holo-tone: var(--kit-good); }
.${P}-prompt[data-tone="warn"] { --jgk-holo-tone: var(--kit-warn); }
.${P}-prompt[data-tone="bad"] { --jgk-holo-tone: var(--kit-bad); }
button.${P}-prompt { cursor: pointer; }
button.${P}-prompt:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 5px; }
.${P}-prompt-hex { position: relative; isolation: isolate; display: grid; place-items: center; flex: none; width: 48px; height: 46px; clip-path: ${HEX}; background: var(--jgk-holo-tone); }
.${P}-prompt-hex[data-device="touch"] { width: 58px; height: 54px; }
.${P}-prompt-fill { position: absolute; inset: 2px; z-index: -1; clip-path: ${HEX}; background: conic-gradient(from 0deg, var(--jgk-holo-tone) var(--jgk-holo-progress, 0deg), rgba(4, 32, 42, 0.94) 0deg); }
.${P}-prompt-hex::before { content: ""; position: absolute; inset: 7px 9px; z-index: -1; clip-path: ${HEX}; background: rgba(4, 32, 42, 0.94); }
.${P}-prompt-glyph { position: relative; color: var(--kit-ink); font: 400 calc(20px * var(--kit-text)) / 1 var(--kit-font-display); text-shadow: 0 0 6px rgba(0, 8, 12, 0.9); }
.${P}-prompt-link { width: 16px; height: 1px; margin: 0 -1px; background: var(--jgk-holo-tone); box-shadow: 0 0 6px var(--kit-glow); }
.${P}-prompt-label { --jgk-holo-cut: 7px; --jgk-holo-edge: var(--jgk-holo-tone); position: relative; isolation: isolate; padding: 8px 16px 7px 14px; color: var(--kit-ink); font: 400 calc(17px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
.${P}-prompt-label .${P}-fill { background: linear-gradient(90deg, color-mix(in srgb, var(--jgk-holo-tone) 34%, transparent), rgba(4, 32, 42, 0.94) 62%); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }
button.${P}-prompt:focus-visible .${P}-prompt-label { outline: 2px dashed var(--kit-accent); outline-offset: 4px; }

/* Toasts: chamfered glass with a vertical bar (hazard stripes when bad or warn), a hex tag, and a scan line on entry. */
.${P}-toast { --jgk-holo-cut: 10px; --jgk-holo-tone: var(--kit-accent); --jgk-holo-edge: var(--kit-line); --jgk-holo-bar: linear-gradient(var(--jgk-holo-tone), var(--jgk-holo-tone)); position: relative; isolation: isolate; display: flex; align-items: center; gap: 12px; min-width: 220px; max-width: 360px; padding: 12px 22px 12px 20px; color: var(--kit-ink); font-family: var(--kit-font-body); animation: ${P}-project calc(var(--kit-enter-ms) * var(--kit-motion)) var(--kit-ease) both; }
.${P}-toast[data-tone="good"] { --jgk-holo-tone: var(--kit-good); --jgk-holo-edge: var(--kit-good); }
.${P}-toast[data-tone="warn"] { --jgk-holo-tone: var(--kit-warn); --jgk-holo-edge: var(--kit-warn); --jgk-holo-bar: repeating-linear-gradient(-45deg, var(--kit-warn) 0 4px, rgba(4, 32, 42, 0.9) 4px 8px); }
.${P}-toast[data-tone="bad"] { --jgk-holo-tone: var(--kit-bad); --jgk-holo-edge: var(--kit-bad); --jgk-holo-bar: repeating-linear-gradient(-45deg, var(--kit-bad) 0 4px, rgba(4, 32, 42, 0.9) 4px 8px); }
.${P}-toast[data-state="closed"] { animation: ${P}-collapse calc(var(--kit-exit-ms) * var(--kit-motion)) ease-in both; }
.${P}-toast > .${P}-edge > .${P}-fill { background: var(--jgk-holo-bar) 0 0 / 5px 100% no-repeat, linear-gradient(90deg, color-mix(in srgb, var(--jgk-holo-tone) 26%, transparent), rgba(4, 32, 42, 0.93) 62%), repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.06) 0 1px, transparent 1px 3px); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }
.${P}-toast > .${P}-edge > .${P}-fill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent calc(100% - 3px), rgba(217, 251, 255, 0.9) 100%); animation: ${P}-scan calc(360ms * var(--kit-motion)) linear 1 both; }
.${P}-toast-icon { position: relative; display: inline-grid; place-items: center; flex: none; font-size: calc(20px * var(--kit-text)); color: var(--jgk-holo-tone); }
.${P}-toast-tri { position: relative; display: grid; place-items: end center; width: 26px; height: 23px; padding-bottom: 1px; clip-path: polygon(50% 0, 100% 100%, 0 100%); background: var(--jgk-holo-tone); color: var(--kit-surface); font: 700 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-toast-text { display: grid; gap: 3px; min-width: 0; }
.${P}-toast-title { color: var(--jgk-holo-tone); font: 400 calc(16px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.14em; text-transform: uppercase; text-shadow: 0 0 8px var(--kit-glow); }
.${P}-toast-body { font: 400 calc(14px * var(--kit-text)) / 1.3 var(--kit-font-body); letter-spacing: 0.02em; }
.${P}-toast-hex { position: absolute; right: 12px; bottom: 4px; color: var(--kit-ink); opacity: 0.6; font: 500 calc(12px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.06em; text-transform: none; }
.${P}-toast-count { position: absolute; top: -11px; right: -8px; z-index: 2; padding: 3px 9px 2px; clip-path: polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px); background: var(--jgk-holo-tone); color: var(--kit-surface); font: 400 calc(14px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.04em; }

/* Menus: chamfered bars, a hex index, and a lit row with angle brackets and a bright fill. */
.${P}-menu { display: grid; gap: 8px; justify-items: start; padding: 4px; isolation: isolate; }
.${P}-menu[data-variant="pause"] { padding: 18px 28px 18px 18px; }
.${P}-menu-item { --jgk-holo-cut: 9px; --jgk-holo-edge: var(--kit-line); position: relative; isolation: isolate; display: flex; align-items: center; gap: 14px; min-width: 240px; padding: 9px 26px 9px 22px; border: 0; background: none; color: var(--kit-ink); font: 400 calc(18px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.14em; text-transform: uppercase; text-align: left; cursor: pointer; transition: transform calc(140ms * var(--kit-motion)) var(--kit-ease); }
.${P}-menu-item .${P}-fill { background: linear-gradient(90deg, rgba(56, 232, 255, 0.3), rgba(4, 32, 42, 0.9) 88%), repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.07) 0 1px, transparent 1px 3px); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }
.${P}-menu-item:not(:disabled):hover { transform: translateX(4px); }
.${P}-menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
.${P}-menu-item:focus-visible { outline: 2px dashed var(--kit-accent); outline-offset: 4px; }
.${P}-menu-item[data-active] { --jgk-holo-edge: var(--kit-accent); color: var(--kit-accent-ink); transform: translateX(12px); }
.${P}-menu-item[data-active]:not(:disabled):hover { transform: translateX(12px); }
.${P}-menu-item[data-active] .${P}-fill { background: linear-gradient(90deg, #eafcff 0%, var(--kit-accent) 40%, #1fd6ee 100%); box-shadow: inset 0 0 16px rgba(255, 255, 255, 0.75), inset 0 -10px 16px rgba(0, 90, 110, 0.25); }
.${P}-menu-idx { color: var(--kit-ink); font: 500 calc(12px * var(--kit-text)) / 1 var(--kit-font-mono); letter-spacing: 0.04em; text-transform: none; opacity: 0.9; }
.${P}-menu-item[data-active] .${P}-menu-idx { color: var(--kit-accent-ink); opacity: 1; }
.${P}-menu-bracket { position: absolute; top: 50%; width: 8px; height: 16px; margin-top: -8px; background: currentColor; opacity: 0; }
.${P}-menu-bracket[data-side="left"] { left: 7px; clip-path: polygon(100% 0, 100% 18%, 36% 50%, 100% 82%, 100% 100%, 0 50%); }
.${P}-menu-bracket[data-side="right"] { right: 7px; clip-path: polygon(0 0, 0 18%, 64% 50%, 0 82%, 0 100%, 100% 50%); }
.${P}-menu-item[data-active] .${P}-menu-bracket { opacity: 1; }
.${P}-menu-label { position: relative; }
.${P}-menu-hint { font: 500 calc(12px * var(--kit-text)) / 1.2 var(--kit-font-mono); letter-spacing: 0.04em; text-transform: none; opacity: 0.85; }
.${P}-menu-item[data-active] .${P}-menu-hint { opacity: 1; font-weight: 700; }
.${P}-menu-badge { padding: 3px 8px 2px; clip-path: polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px); background: var(--kit-bad); color: var(--kit-surface); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.1em; }
.${P}-menu-item[data-secondary] { --jgk-holo-cut: 6px; min-width: 0; padding: 6px 22px 5px 20px; font-size: calc(14px * var(--kit-text)); }
.${P}-menu-rule { width: 100%; height: 0; margin: 6px 0 2px; border-top: 1px dashed var(--kit-line); }
.${P}-menu[data-variant="title"] .${P}-menu-item { min-width: 320px; padding: 12px 34px 11px 30px; font-size: calc(26px * var(--kit-text)); }
.${P}-menu[data-variant="pause"] .${P}-menu-item { min-width: 280px; font-size: calc(20px * var(--kit-text)); }
.${P}-menu[data-variant="title"] .${P}-menu-item[data-secondary], .${P}-menu[data-variant="pause"] .${P}-menu-item[data-secondary] { min-width: 0; font-size: calc(14px * var(--kit-text)); }

/* Minimap: a round radar with a degree bezel and rings, or a chamfered window with corner brackets. */
.${P}-map { --jgk-holo-cut: 18px; --jgk-holo-tone: var(--kit-accent); --jgk-holo-edge: var(--kit-line); position: relative; flex: none; isolation: isolate; }
.${P}-bezel { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.${P}-bezel-ring { fill: color-mix(in srgb, var(--kit-surface) 80%, transparent); stroke: var(--kit-accent); stroke-width: 1.4; }
.${P}-bezel-inner { fill: none; stroke: var(--kit-line); stroke-width: 1; stroke-dasharray: 2 3; }
.${P}-bezel .${P}-tick { stroke: var(--kit-line); stroke-width: 1; }
.${P}-bezel .${P}-tick[data-major] { stroke: var(--kit-accent); stroke-width: 1.8; }
.${P}-map-window { position: absolute; inset: 9px; overflow: hidden; background: var(--kit-surface-alt); }
.${P}-map[data-shape="circle"] .${P}-map-window { inset: 14px; border-radius: 50%; }
.${P}-map[data-shape="square"] .${P}-map-window { clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.${P}-map-window > * { display: block; width: 100%; height: 100%; }
.${P}-map-window::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-radial-gradient(circle closest-side at 50% 50%, transparent 0 calc(25% - 1px), rgba(56, 232, 255, 0.4) calc(25% - 1px) 25%), linear-gradient(var(--kit-line), var(--kit-line)) 50% 0 / 1px 100% no-repeat, linear-gradient(var(--kit-line), var(--kit-line)) 0 50% / 100% 1px no-repeat, linear-gradient(180deg, rgba(56, 232, 255, 0.16), transparent 45%); }
.${P}-map[data-shape="square"] .${P}-map-window::after { background: linear-gradient(var(--kit-line), var(--kit-line)) 50% 0 / 1px 100% no-repeat, linear-gradient(var(--kit-line), var(--kit-line)) 0 50% / 100% 1px no-repeat, linear-gradient(180deg, rgba(56, 232, 255, 0.16), transparent 45%); }
.${P}-map-north { position: absolute; inset: 0; pointer-events: none; }
.${P}-map-north > span { position: absolute; top: -9px; left: 50%; display: grid; place-items: center; width: 24px; height: 24px; margin-left: -12px; clip-path: ${HEX}; background: var(--kit-accent); color: var(--kit-accent-ink); font: 700 calc(12px * var(--kit-text)) / 1 var(--kit-font-display); }
.${P}-map-label { --jgk-holo-cut: 6px; --jgk-holo-edge: var(--kit-accent); position: absolute; left: 50%; bottom: -15px; z-index: 2; padding: 5px 14px 4px; color: var(--kit-ink); font: 400 calc(13px * var(--kit-text)) / 1 var(--kit-font-display); letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; transform: translateX(-50%); isolation: isolate; }
.${P}-map-label .${P}-fill { background: linear-gradient(90deg, rgba(56, 232, 255, 0.3), rgba(4, 32, 42, 0.95) 70%); background-color: color-mix(in srgb, var(--kit-surface) 92%, transparent); }

@keyframes ${P}-project {
  0% { opacity: 0; transform: scaleY(0.02); }
  20% { opacity: 0.7; transform: scaleY(0.35); }
  40% { opacity: 0.3; transform: scaleY(0.7); }
  60% { opacity: 1; transform: scaleY(0.92); }
  100% { opacity: 1; transform: scaleY(1); }
}
@keyframes ${P}-collapse {
  0% { opacity: 1; transform: scaleY(1); }
  70% { opacity: 1; transform: scaleY(0.04); }
  100% { opacity: 0; transform: scaleY(0.02); }
}
@keyframes ${P}-sweep { from { transform: translateX(-120%); } to { transform: translateX(260%); } }
@keyframes ${P}-scan { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
`;

/**
 * Vector: an angular sci-fi hologram. Chamfered glass with scanlines and bracket corners, hex data tags,
 * radar frames with degree bezels, projection-in motion and tone-sweep sounds.
 *
 * @capability ui-kit-holo sci-fi hologram UI kit — chamfered glass, bracket corners, hex tags, radar frames, projection motion and tone sweeps
 */
export const holoKit: UiKit = {
  id: "holo",
  name: "Vector",
  description: "Angular sci-fi hologram: chamfered glass, scanlines, bracket corners, hex data tags and radar.",
  tokens: {
    // Corner of engine controls (settings rows, tabs) drawn on this kit's panes.
    radius: "2px",
    ink: "#d9fbff",
    surface: "#04202a",
    surfaceAlt: "#07323f",
    accent: "#38e8ff",
    accentInk: "#031318",
    good: "#3dffb5",
    warn: "#ffc94a",
    bad: "#ff4d6d",
    line: "rgba(56, 232, 255, 0.55)",
    scrim: "rgba(0, 10, 16, 0.65)",
    glow: "rgba(56, 232, 255, 0.35)",
    fontDisplay: "\"Bahnschrift\", \"Eurostile\", \"Avenir Next\", \"Segoe UI\", sans-serif",
    fontBody: "\"Bahnschrift\", \"Segoe UI\", \"Avenir Next\", Roboto, sans-serif",
    fontMono: "\"Consolas\", \"Menlo\", monospace",
  },
  components: { Button, Panel, Meter, Prompt, Toast, Menu, MinimapFrame },
  css: CSS,
  motion: { enterMs: 240, exitMs: 200, ease: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
  sounds: {
    click: kitCueSound("click", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1760, slideTo: 2640, duration: 0.05, gain: 0.22, attack: 0.001 }, { kind: "tone", wave: "sine", freq: 3520, duration: 0.03, gain: 0.06, attack: 0.001 }] } }),
    hover: kitCueSound("hover", { gain: 0.3, maxVoices: 1, synth: { voices: [{ kind: "noise", filterType: "highpass", filterFreq: 6000, duration: 0.02, gain: 0.05 }] } }),
    open: kitCueSound("open", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sine", freq: 330, slideTo: 990, duration: 0.2, gain: 0.22, attack: 0.01 }, { kind: "noise", filterType: "highpass", filterFreq: 5000, duration: 0.12, gain: 0.04 }] } }),
    close: kitCueSound("close", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sine", freq: 990, slideTo: 330, duration: 0.16, gain: 0.2 }] } }),
    confirm: kitCueSound("confirm", { gain: 0.5, maxVoices: 2, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1319, duration: 0.06, gain: 0.18 }, { kind: "tone", wave: "sine", freq: 1976, duration: 0.1, gain: 0.18, delay: 0.06 }] } }),
    deny: kitCueSound("deny", { gain: 0.55, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sawtooth", freq: 110, slideTo: 82, duration: 0.3, gain: 0.16, attack: 0.01 }, { kind: "noise", filterType: "lowpass", filterFreq: 260, duration: 0.3, gain: 0.1 }] } }),
    notify: kitCueSound("notify", { gain: 0.45, maxVoices: 1, synth: { voices: [{ kind: "tone", wave: "sine", freq: 1568, duration: 0.14, gain: 0.16 }, { kind: "tone", wave: "sine", freq: 2349, duration: 0.16, gain: 0.12, delay: 0.09 }] } }),
  },
};
