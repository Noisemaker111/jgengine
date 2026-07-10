import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { fieldkitVars } from "@/components/ui/jg-theme";

import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { Hud } from "./components/Hud";

function GameUIInner() {
  const layout = useHudLayout({ storageKey: "tower-guard" });
  return (
    <HudCanvas layout={layout}>
      <HudPanel id="hud" anchor="top-left" inset={{ x: 18, y: 18 }}>
        <Hud />
      </HudPanel>
      <HudPanel id="build-bar" anchor="bottom" inset={{ x: 0, y: 18 }}>
        <BuildBar />
      </HudPanel>
      <EndScreens />
    </HudCanvas>
  );
}

export function GameUI() {
  return (
    <div style={{ ...fieldkitVars, display: "contents" }}>
      <GameUIInner />
    </div>
  );
}
