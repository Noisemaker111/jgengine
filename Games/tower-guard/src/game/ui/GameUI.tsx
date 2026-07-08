import { fieldkitVars } from "@/components/ui/jg-theme";

import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { Hud } from "./components/Hud";

export function GameUI() {
  return (
    <div style={{ ...fieldkitVars, display: "contents" }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gridTemplateRows: "1fr auto",
          padding: 18,
          pointerEvents: "none",
        }}
      >
        <div style={{ gridColumn: "1", gridRow: "1", pointerEvents: "auto" }}>
          <Hud />
        </div>
        <div
          style={{
            gridColumn: "1 / span 2",
            gridRow: "2",
            display: "flex",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          <BuildBar />
        </div>
      </div>
      <EndScreens />
    </div>
  );
}
