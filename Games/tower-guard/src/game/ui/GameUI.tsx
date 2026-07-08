import { GameUiThemeProvider, fieldkitTheme } from "@jgengine/react/gameui";

import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { Hud } from "./components/Hud";

export function GameUI() {
  return (
    <GameUiThemeProvider theme={fieldkitTheme}>
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
    </GameUiThemeProvider>
  );
}
