import type { ReactNode } from "react";
import { gameFrameVars } from "@jgengine/react/gameFrame";
import { GameCursor } from "@jgengine/react/gameCursor";
import { gameFontStacks } from "@jgengine/react/gameFonts";
import { customizeKit, type KitMenuProps, type KitPanelProps } from "@jgengine/react/uiKit";
import { UI_KITS } from "@jgengine/react/uiKits";
import { GAME_FONTS } from "../../../art/fonts/fonts";

const FONTS = gameFontStacks(GAME_FONTS);
const AMBER = "#e2bd6e";

/**
 * Marrow's console. Menus are riveted hull switch plates with an indicator lamp; every detail pane is
 * the dive-log screen set in a hull bezel. The engine's `GameMenu` keeps the navigation, focus,
 * sound and stacking; this kit only draws its parts.
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
        className="jgk-deepward-plate"
        data-active={active ? "" : undefined}
        data-secondary={item.secondary === true ? "" : undefined}
        data-jg-frame="hull"
        data-interactive=""
        style={gameFrameVars({
          material: "hull",
          cut: item.secondary === true ? "slant" : "notch",
          depth: item.secondary === true ? 8 : 11,
          tint: active ? "#3d6170" : item.secondary === true ? "#1c2c33" : "#22363f",
          edge: active ? AMBER : "#071014",
          edgeWidth: active ? 2 : 1,
          padding: "0",
        })}
      >
        <span data-jg-frame-face="" className="jgk-deepward-plate-face">
          <i className="jgk-deepward-lamp" aria-hidden="true" />
          {index >= 0 ? <span className="jgk-deepward-plate-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
          <span className="jgk-deepward-plate-text">
            <span className="jgk-deepward-plate-label">{item.label}</span>
            {item.hint === undefined ? null : <span className="jgk-deepward-plate-hint">{item.hint}</span>}
          </span>
          {item.badge === undefined ? null : <span className="jgk-deepward-plate-badge">{item.badge}</span>}
        </span>
      </button>
    );
  };
  return (
    <div className={`jgk-deepward-menu ${className ?? ""}`} data-variant={variant} style={style} role="menu">
      {primary.map(row)}
      {secondary.length === 0 ? null : <span className="jgk-deepward-rule" aria-hidden="true" />}
      {secondary.map(row)}
      <GameCursor variant="brackets" color={AMBER} gap={5} arm={11} thickness={2} />
    </div>
  );
}

/** A pane is the dive-log screen: scanlined glass in a riveted hull bezel. */
function Panel({ eyebrow, title, aside, footer, tone, variant = "hud", as: Tag = "section", leaving, className, children, style, ...rest }: KitPanelProps): ReactNode {
  const head = title !== undefined || eyebrow !== undefined || aside !== undefined;
  return (
    <Tag {...rest} className={`jgk-deepward-panel ${className ?? ""}`} data-variant={variant} data-tone={tone} data-state={leaving === true ? "closed" : "open"} style={style}>
      <div className="jgk-deepward-bezel" data-jg-frame="hull" style={gameFrameVars({ material: "hull", cut: "chamfer", depth: 16, tint: "#22363f", edge: "#050b0e", edgeWidth: 2, padding: "12px" })}>
        <div data-jg-frame-face="" className="jgk-deepward-bezel-face">
          <div className="jgk-deepward-screen">
            {head ? (
              <header className="jgk-deepward-screen-head">
                {eyebrow === undefined ? null : <span>{eyebrow}</span>}
                {title === undefined ? null : <strong>{title}</strong>}
                {aside === undefined ? null : <span>{aside}</span>}
              </header>
            ) : null}
            <div className="jgk-deepward-screen-body">{children}</div>
            {footer === undefined ? null : <footer className="jgk-deepward-screen-foot">{footer}</footer>}
          </div>
        </div>
      </div>
    </Tag>
  );
}

const CSS = `
.jgk-deepward-menu { position: relative; display: flex; flex-direction: column; gap: 9px; padding: 4px 6px 4px 2px; }
.jgk-deepward-plate { appearance: none; border: 0; margin: 0; padding: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: #e8e4d4; display: block; width: 100%; }
.jgk-deepward-plate-face { display: flex !important; align-items: center; gap: 12px; min-height: 54px; padding: 8px 18px 8px 16px !important; }
.jgk-deepward-menu[data-variant="pause"] .jgk-deepward-plate-face { min-height: 44px; padding: 6px 16px 6px 14px !important; }
.jgk-deepward-plate[data-secondary] .jgk-deepward-plate-face { min-height: 38px; }
.jgk-deepward-lamp { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #4a3a1e, #1b150b 70%); box-shadow: inset 0 1px 2px rgba(0,0,0,0.8), 0 0 0 2px rgba(0,0,0,0.45); }
.jgk-deepward-plate[data-active] .jgk-deepward-lamp { background: radial-gradient(circle at 35% 30%, #fff2c8, ${AMBER} 45%, #9a6d22 100%); box-shadow: 0 0 10px ${AMBER}, 0 0 0 2px rgba(0,0,0,0.45); }
.jgk-deepward-plate:disabled .jgk-deepward-lamp { opacity: 0.35; }
.jgk-deepward-plate-no { font-family: ${FONTS.fontDisplay}; font-size: 12px; letter-spacing: 0.08em; color: rgba(232,228,212,0.45); }
.jgk-deepward-plate[data-active] .jgk-deepward-plate-no { color: ${AMBER}; }
.jgk-deepward-plate-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.jgk-deepward-plate-label { font-family: ${FONTS.fontDisplay}; font-size: clamp(17px, 1.5vw, 22px); line-height: 1.1; letter-spacing: 0.04em; color: #ebe6d4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 0 rgba(0,0,0,0.7); }
.jgk-deepward-menu[data-variant="pause"] .jgk-deepward-plate-label { font-size: clamp(15px, 1.2vw, 18px); }
.jgk-deepward-plate[data-secondary] .jgk-deepward-plate-label { font-family: ${FONTS.fontBody}; font-size: 15px; color: rgba(235,230,212,0.78); }
.jgk-deepward-plate-hint { font-family: ${FONTS.fontBody}; font-size: 13px; line-height: 1.2; color: rgba(214,226,220,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jgk-deepward-plate[data-active] .jgk-deepward-plate-hint { color: #f0d9a2; }
.jgk-deepward-plate-badge { margin-left: auto; font-family: ${FONTS.fontDisplay}; font-size: 12px; color: ${AMBER}; }
.jgk-deepward-rule { display: block; height: 0; margin: 6px 4px; border-top: 2px dashed rgba(226,189,110,0.28); }
@media (max-width: 700px) {
  .jgk-deepward-menu { gap: 6px; }
  .jgk-deepward-plate-face { min-height: 44px; padding: 5px 14px 5px 12px !important; gap: 10px; }
  .jgk-deepward-plate-label { font-size: 17px; }
  .jgk-deepward-plate-hint { font-size: 12px; }
}

.jgk-deepward-panel { display: flex; flex-direction: column; min-height: 0; color: var(--kit-ink); font-family: var(--kit-font-body); }
.jgk-deepward-bezel { flex: 1 1 auto; min-height: 0; }
.jgk-deepward-bezel-face { display: flex; flex-direction: column; min-height: 0; }
.jgk-deepward-screen { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 16px 20px 14px; border-radius: 3px;
  background: radial-gradient(120% 90% at 50% 35%, #0f2c31 0%, #081a1e 58%, #03090b 100%);
  box-shadow: inset 0 0 0 1px rgba(156,221,209,0.16), inset 0 0 38px rgba(0,0,0,0.85), inset 0 2px 0 rgba(0,0,0,0.6);
  --jg-text: #d6f1e9; --jg-text-dim: rgba(190,224,214,0.74); --jg-accent: ${AMBER}; --jg-accent-text: ${AMBER}; --jg-on-accent: #17120a;
  --jg-surface: rgba(156,221,209,0.06); --jg-surface-deep: transparent; --jg-edge: rgba(156,221,209,0.2); --jg-edge-bright: rgba(156,221,209,0.5);
  --jg-control-radius: 0px; --jg-font-display: ${FONTS.fontDisplay}; --jg-font-body: ${FONTS.fontBody}; }
.jgk-deepward-screen::before { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: 3px; z-index: 2;
  background: repeating-linear-gradient(180deg, rgba(156,221,209,0.045) 0 1px, transparent 1px 3px), linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 26%); }
.jgk-deepward-screen-head { display: flex; gap: 12px; align-items: baseline; font-family: var(--kit-font-display); color: ${AMBER}; margin-bottom: 10px; }
.jgk-deepward-screen-body { position: relative; z-index: 1; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.jgk-deepward-screen-foot { position: relative; z-index: 1; margin-top: 10px; font-family: var(--kit-font-display); font-size: 12px; color: rgba(190,224,214,0.6); }

/* Engine settings drawn as screen lines: no cards, no pills. */
.jgk-deepward-screen [data-settings-tab] { border-radius: 0 !important; font-family: ${FONTS.fontDisplay} !important; letter-spacing: 0.06em; text-transform: uppercase; }
.jgk-deepward-screen [data-settings-row], .jgk-deepward-screen [data-settings-keybind] { border: 0 !important; border-bottom: 1px dashed rgba(156,221,209,0.2) !important; border-radius: 0 !important; background: transparent !important; font-family: ${FONTS.fontBody}; }
.jgk-deepward-screen [data-settings-row] > span:first-child { font-size: 15px !important; letter-spacing: 0.02em; }
.jgk-deepward-screen [data-settings-row] [role="switch"] { width: 46px !important; height: 22px !important; border-radius: 0 !important; border: 1px solid rgba(156,221,209,0.45) !important; background: #04100f !important; box-shadow: inset 0 1px 3px rgba(0,0,0,0.8) !important; }
.jgk-deepward-screen [data-settings-row] [role="switch"][aria-checked="true"] { background: #2a2312 !important; border-color: ${AMBER} !important; box-shadow: inset 0 0 8px rgba(226,189,110,0.4) !important; }
.jgk-deepward-screen [data-settings-row] [role="switch"] > span { border-radius: 0 !important; top: 3px !important; width: 14px !important; height: 14px !important; background: rgba(156,221,209,0.55) !important; }
.jgk-deepward-screen [data-settings-row] [role="switch"][aria-checked="true"] > span { background: ${AMBER} !important; box-shadow: 0 0 8px ${AMBER}; left: 27px !important; }
.jgk-deepward-screen [data-settings-row] span[style*="tabular-nums"] { font-family: ${FONTS.fontDisplay}; color: #bfeee2; }
`;

/** Deepward's kit: the terminal kit's toasts and prompts, with Marrow's console menu and dive-log pane. */
export const deepwardKit = customizeKit(UI_KITS.terminal, {
  name: "Marrow console",
  tokens: {
    radius: "0px",
    ink: "#d6f1e9",
    surface: "#0a1d22",
    surfaceAlt: "#0f262c",
    accent: AMBER,
    accentInk: "#17120a",
    good: "#8fe3c8",
    warn: "#f0b25a",
    bad: "#ff6a52",
    line: "#4f8a86",
    scrim: "rgba(3, 10, 12, 0.8)",
    fontDisplay: FONTS.fontDisplay,
    fontBody: FONTS.fontBody,
    fontMono: FONTS.fontDisplay,
  },
  components: { Menu, Panel },
  css: CSS,
});
