import type { ReactNode } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { gameFontStacks } from "@jgengine/react/gameFonts";
import { customizeKit, type KitMenuProps, type KitPanelProps } from "@jgengine/react/uiKit";
import { UI_KITS } from "@jgengine/react/uiKits";
import { GAME_FONTS } from "../../../art/fonts/fonts";

const FONTS = gameFontStacks(GAME_FONTS);
const YELLOW = "#f2c230";
const INK = "#2a2419";
const ORANGE = "#c8461a";

/*
 * The pit wall. Menu verbs are stencilled steel plates bolted to the gate; the one you are on is
 * painted hazard yellow. Every detail pane is the pit sheet on a clipboard. No filters anywhere: the
 * menu sits over the live yard, and plain gradients and clip paths cost nothing per frame.
 */
function Menu({ items, activeId, itemProps, onSelect, variant = "list", className, style }: KitMenuProps): ReactNode {
  const primary = items.filter((item) => item.secondary !== true);
  const secondary = items.filter((item) => item.secondary === true);
  const row = (item: KitMenuProps["items"][number]) => {
    const active = item.id === activeId;
    const index = primary.indexOf(item);
    return (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        onClick={() => onSelect(item.id)}
        {...itemProps(item.id)}
        className="jgk-foundry-plate"
        data-active={active ? "" : undefined}
        data-secondary={item.secondary === true ? "" : undefined}
      >
        <span className="jgk-foundry-plate-face">
          {index >= 0 ? <span className="jgk-foundry-plate-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
          <span className="jgk-foundry-plate-text">
            <span className="jgk-foundry-plate-label">{item.label}</span>
            {item.hint === undefined ? null : <span className="jgk-foundry-plate-hint">{item.hint}</span>}
          </span>
          {item.badge === undefined ? null : <span className="jgk-foundry-plate-badge">{item.badge}</span>}
          <i className="jgk-foundry-bolt" aria-hidden="true" />
        </span>
      </button>
    );
  };
  return (
    <div className={`jgk-foundry-menu ${className ?? ""}`} data-variant={variant} style={style} role="menu">
      {primary.map(row)}
      {secondary.length === 0 ? null : <span className="jgk-foundry-rule" aria-hidden="true" />}
      {secondary.map(row)}
      <GameCursor variant="chevron" color={YELLOW} gap={8} arm={12} thickness={3} />
    </div>
  );
}

/** A pane is the pit sheet: paper under a steel clip on a hardboard clipboard. */
function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, style, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={`jgk-foundry-panel ${className ?? ""}`} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style}>
      <div className="jgk-foundry-board">
        <svg className="jgk-foundry-clip" viewBox="0 0 140 44" aria-hidden="true">
          <defs>
            <linearGradient id="jgk-foundry-clip-steel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d9dee0" />
              <stop offset="0.5" stopColor="#8b9397" />
              <stop offset="1" stopColor="#4a5155" />
            </linearGradient>
          </defs>
          <path d="M8 40 L14 14 Q16 6 26 6 L114 6 Q124 6 126 14 L132 40 Z" fill="#1d2123" />
          <path d="M11 38 L16 15 Q18 9 27 9 L113 9 Q122 9 124 15 L129 38 Z" fill="url(#jgk-foundry-clip-steel)" />
          <rect x="52" y="0" width="36" height="16" rx="7" fill="none" stroke="#2a2f31" strokeWidth="6" />
          <rect x="52" y="0" width="36" height="16" rx="7" fill="none" stroke="#a9b0b3" strokeWidth="3" />
          <circle cx="30" cy="27" r="3.5" fill="#2a2f31" />
          <circle cx="110" cy="27" r="3.5" fill="#2a2f31" />
        </svg>
        <div className="jgk-foundry-sheet">
          {head ? (
            <header className="jgk-foundry-sheet-head">
              {eyebrow === undefined ? null : <span>{eyebrow}</span>}
              {title === undefined ? null : <strong>{title}</strong>}
              {aside === undefined ? null : <span>{aside}</span>}
            </header>
          ) : null}
          <div className="jgk-foundry-sheet-body">{children}</div>
          {footer === undefined ? null : <footer className="jgk-foundry-sheet-foot">{footer}</footer>}
        </div>
      </div>
    </Tag>
  );
}

const CSS = `
.jgk-foundry-menu { position: relative; display: flex; flex-direction: column; gap: 7px; padding: 4px 4px 4px 22px; }
.jgk-foundry-plate { position: relative; appearance: none; border: 0; margin: 0; padding: 2px; background: #0c0e0f; font: inherit; text-align: left; cursor: pointer; display: block; width: 100%;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); transition: translate 120ms ease; }
.jgk-foundry-plate-face { position: relative; display: flex; align-items: center; gap: 14px; min-height: 50px; padding: 6px 34px 6px 16px; color: #ece3cc;
  clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 11px 100%, 0 calc(100% - 11px));
  background:
    linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.3) 100%),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, rgba(0,0,0,0.03) 1px 3px),
    #3a4044; }
.jgk-foundry-plate[data-active] { translate: 6px 0; background: #111; }
.jgk-foundry-plate[data-active] .jgk-foundry-plate-face { color: #141414;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.06) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.16) 100%),
    repeating-linear-gradient(-45deg, #141414 0 9px, ${YELLOW} 9px 18px) left / 12px 100% no-repeat,
    ${YELLOW}; padding-left: 26px; }
.jgk-foundry-plate:disabled { cursor: not-allowed; }
.jgk-foundry-plate:disabled .jgk-foundry-plate-face { color: rgba(236,227,204,0.42); background: #2a2e31; }
@media (hover: hover) { .jgk-foundry-plate:not(:disabled):not([data-active]):hover .jgk-foundry-plate-face { background-color: #485055; } }
.jgk-foundry-plate:focus-visible { outline: none; background: ${YELLOW}; }
.jgk-foundry-plate-no { flex: 0 0 auto; font-family: ${FONTS.fontDisplay}; font-size: 15px; letter-spacing: 0.04em; color: ${YELLOW}; opacity: 0.85; }
.jgk-foundry-plate[data-active] .jgk-foundry-plate-no { color: #141414; opacity: 0.7; }
.jgk-foundry-plate-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.jgk-foundry-plate-label { font-family: ${FONTS.fontDisplay}; font-size: clamp(19px, 1.65vw, 26px); line-height: 1.05; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jgk-foundry-menu[data-variant="pause"] .jgk-foundry-plate-label { font-size: clamp(17px, 1.35vw, 21px); }
.jgk-foundry-menu[data-variant="pause"] .jgk-foundry-plate-face { min-height: 46px; padding-top: 6px; padding-bottom: 6px; }
.jgk-foundry-plate[data-secondary] .jgk-foundry-plate-face { min-height: 38px; background: #24282b; }
.jgk-foundry-plate[data-secondary] .jgk-foundry-plate-label { font-size: 16px; color: rgba(236,227,204,0.8); }
.jgk-foundry-plate[data-secondary][data-active] .jgk-foundry-plate-label { color: #141414; }
.jgk-foundry-plate-hint { font-family: ${FONTS.fontBody}; font-size: 14px; line-height: 1.15; letter-spacing: 0.02em; color: rgba(236,227,204,0.66); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jgk-foundry-plate[data-active] .jgk-foundry-plate-hint { color: rgba(20,20,20,0.78); }
.jgk-foundry-plate-badge { margin-left: auto; font-family: ${FONTS.fontDisplay}; font-size: 13px; color: ${YELLOW}; }
.jgk-foundry-bolt { position: absolute; right: 12px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #c9ced0, #5b6266 55%, #24282a 100%); box-shadow: 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 1px rgba(0,0,0,0.6); }
.jgk-foundry-rule { display: block; height: 8px; margin: 4px 0; background: repeating-linear-gradient(-45deg, rgba(20,20,20,0.9) 0 7px, rgba(242,194,48,0.75) 7px 14px);
  clip-path: polygon(0 0, 100% 0, calc(100% - 4px) 100%, 0 100%); opacity: 0.8; }
@media (max-width: 700px) {
  .jgk-foundry-menu { gap: 5px; padding-left: 18px; }
  .jgk-foundry-plate-face, .jgk-foundry-menu[data-variant="pause"] .jgk-foundry-plate-face { min-height: 40px; padding: 3px 30px 3px 13px; gap: 11px; }
  .jgk-foundry-plate[data-active] .jgk-foundry-plate-face { padding-left: 22px; }
  .jgk-foundry-plate-label { font-size: 18px; }
  .jgk-foundry-plate-hint { font-size: 12px; }
}

.jgk-foundry-panel { display: flex; flex-direction: column; min-height: 0; color: ${INK}; font-family: ${FONTS.fontBody}; }
.jgk-foundry-board { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 30px 14px 14px; border-radius: 10px;
  background:
    radial-gradient(circle at 20% 30%, rgba(255,230,190,0.06) 0 1px, transparent 1.5px) 0 0 / 7px 7px,
    radial-gradient(circle at 70% 60%, rgba(0,0,0,0.12) 0 1px, transparent 1.5px) 0 0 / 5px 5px,
    linear-gradient(160deg, #7a5432 0%, #5e3f24 55%, #4a311c 100%);
  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,220,170,0.18), 0 18px 40px rgba(0,0,0,0.55); }
.jgk-foundry-clip { position: absolute; top: -10px; left: 50%; width: 150px; height: 47px; margin-left: -75px; z-index: 3; }
.jgk-foundry-sheet { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 26px 24px 16px; color: ${INK};
  background:
    linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0) 30%),
    repeating-linear-gradient(180deg, transparent 0 27px, rgba(70,110,150,0.13) 27px 28px),
    radial-gradient(140% 110% at 50% 40%, rgba(0,0,0,0) 60%, rgba(120,80,30,0.2) 100%),
    #efe7d2;
  box-shadow: 0 1px 0 rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.35);
  --jg-text: ${INK}; --jg-text-dim: rgba(42,36,25,0.72); --jg-accent: ${ORANGE}; --jg-accent-text: ${ORANGE}; --jg-on-accent: #fff4dc;
  --jg-accent-soft: rgba(200,70,26,0.14); --jg-accent-glow: rgba(200,70,26,0.25);
  --jg-surface: rgba(42,36,25,0.05); --jg-surface-deep: transparent; --jg-edge: rgba(42,36,25,0.28); --jg-edge-bright: rgba(42,36,25,0.6);
  --jg-control-radius: 0px; --jg-font-display: ${FONTS.fontDisplay}; --jg-font-body: ${FONTS.fontBody}; }
.jgk-foundry-sheet-head { display: flex; gap: 12px; align-items: baseline; font-family: ${FONTS.fontDisplay}; color: ${ORANGE}; margin-bottom: 10px; }
.jgk-foundry-sheet-body { position: relative; z-index: 1; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.jgk-foundry-sheet-foot { position: relative; z-index: 1; margin-top: 10px; font-size: 13px; color: rgba(42,36,25,0.6); }
@media (max-width: 700px) {
  .jgk-foundry-board { padding: 24px 9px 9px; }
  .jgk-foundry-sheet { padding: 16px 12px 10px; }
  .jgk-foundry-clip { width: 120px; height: 38px; margin-left: -60px; top: -8px; }
}

/* Engine settings written onto the pit sheet: divider tabs, ruled rows, toggle switches in ink. */
.jgk-foundry-sheet [data-settings-tab] { border-radius: 0 !important; font-family: ${FONTS.fontDisplay} !important; letter-spacing: 0.04em; color: ${INK} !important; background: rgba(42,36,25,0.07) !important; border: 1px solid rgba(42,36,25,0.25) !important; }
.jgk-foundry-sheet [data-settings-tab][aria-selected="true"], .jgk-foundry-sheet [data-settings-tab][data-active] { background: ${INK} !important; color: #f6eedb !important; border-color: ${INK} !important; }
.jgk-foundry-sheet [data-settings-row], .jgk-foundry-sheet [data-settings-keybind] { border: 0 !important; border-bottom: 1px solid rgba(42,36,25,0.22) !important; border-radius: 0 !important; background: transparent !important; font-family: ${FONTS.fontBody}; color: ${INK} !important; }
.jgk-foundry-sheet [data-settings-row] > span:first-child { font-size: 17px !important; letter-spacing: 0.01em; }
.jgk-foundry-sheet [data-settings-row] [role="switch"] { width: 48px !important; height: 22px !important; border-radius: 0 !important; border: 2px solid ${INK} !important; background: transparent !important; box-shadow: none !important; }
.jgk-foundry-sheet [data-settings-row] [role="switch"][aria-checked="true"] { background: ${ORANGE} !important; border-color: ${INK} !important; }
.jgk-foundry-sheet [data-settings-row] [role="switch"] > span { border-radius: 0 !important; top: 2px !important; width: 14px !important; height: 14px !important; background: ${INK} !important; box-shadow: none !important; }
.jgk-foundry-sheet [data-settings-row] [role="switch"][aria-checked="true"] > span { background: #fff4dc !important; left: 28px !important; }
.jgk-foundry-sheet [data-settings-row] span[style*="tabular-nums"] { font-family: ${FONTS.fontDisplay}; color: ${INK}; }
.jgk-foundry-sheet [data-settings-row] select, .jgk-foundry-sheet [data-settings-row] button:not([role="switch"]) { border-radius: 0 !important; font-family: ${FONTS.fontBody}; }
`;

/** Drift Foundry's kit: the signal kit's toasts and prompts, with the pit's stencil plates and clipboard pane. */
export const foundryKit = customizeKit(UI_KITS.signal, {
  name: "Row Six pit wall",
  tokens: {
    radius: "0px",
    ink: "#ece3cc",
    surface: "#2c3134",
    surfaceAlt: "#1c2022",
    accent: YELLOW,
    accentInk: "#141414",
    good: "#5de0ce",
    warn: YELLOW,
    bad: "#ff4934",
    line: "#6e777b",
    scrim: "rgba(10, 9, 8, 0.78)",
    fontDisplay: FONTS.fontDisplay,
    fontBody: FONTS.fontBody,
    fontMono: FONTS.fontDisplay,
  },
  components: { Menu, Panel },
  css: CSS,
});
