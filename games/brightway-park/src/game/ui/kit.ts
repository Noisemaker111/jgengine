import { customizeKit } from "@jgengine/react/uiKit";
import { UI_KITS } from "@jgengine/react/uiKits";

/**
 * Brightway's fair-day paper, recut from the park sign: cream ticket stock, teal sign-plate stickers
 * with a gold rim, sand cards and striped awning tape.
 */
export const parkKit = customizeKit(UI_KITS.paper, {
  name: "Brightway Fair",
  tokens: {
    ink: "#21424a",
    surface: "#fff4da",
    surfaceAlt: "#f2dfb2",
    accent: "#24535b",
    accentInk: "#fff1cf",
    good: "#2f8f68",
    warn: "#e3a23a",
    bad: "#d4553f",
    kraft: "#e8cd95",
    pencil: "#587779",
    tape: "repeating-linear-gradient(90deg, #ef7059 0 7px, #fff1cf 7px 14px)",
    scrim: "rgba(20, 50, 56, 0.5)",
    fontDisplay: "Georgia, \"Times New Roman\", serif",
  },
  css: `
.jgk-paper-title { box-shadow: 0 0 0 3px #edbc5c, 0 3px 0 3px rgba(33, 66, 74, 0.25); font-weight: 700; }
.jgk-paper-btn[data-variant="primary"] .jgk-paper-btn-ticket { outline-color: #edbc5c; }
.jgk-paper-panel[data-variant="strip"] { color: #fff1cf; border-block: 3px solid #edbc5c; }
.jgk-paper-panel[data-variant="strip"] .jgk-paper-title { font-size: calc(26px * var(--kit-text)); }
.jgk-paper-btn[data-pressed] .jgk-paper-btn-ticket { background: #edbc5c; color: #21424a; }
.jgk-paper-btn[data-variant="ghost"][data-pressed] .jgk-paper-btn-ticket { text-decoration-color: #ef7059; }
`,
});
