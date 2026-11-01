import type { GameErrorScreenProps } from "@jgengine/shell/registry";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

const FONTS = gameFontStacks(GAME_FONTS);

/** The pit wall's own recoverable error plate: shown when the HUD or the tick fails, with a retry. */
export function ErrorScreen({ report, retry }: GameErrorScreenProps) {
  return (
    <div
      role="alertdialog"
      aria-label="Run interrupted"
      style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#141617ef", color: "#ece3cc", fontFamily: FONTS.fontBody }}
    >
      <div style={{ background: "#2c3134", border: "2px solid #0c0e0f", padding: "24px 32px", maxWidth: 420 }}>
        <h1 style={{ margin: 0, color: "#f2c230", fontFamily: FONTS.fontDisplay, letterSpacing: "0.08em", textTransform: "uppercase" }}>Run interrupted</h1>
        <p style={{ color: "#b9b4a6" }}>The pit wall lost the feed. Your garage is safe.{report === null ? "" : ` Ref ${report.id}.`}</p>
        <button
          type="button"
          onClick={retry}
          style={{ background: "#f2c230", color: "#1c2022", border: "2px solid #0c0e0f", padding: "8px 20px", fontFamily: FONTS.fontDisplay, textTransform: "uppercase", cursor: "pointer" }}
        >
          Back to the track
        </button>
      </div>
    </div>
  );
}
