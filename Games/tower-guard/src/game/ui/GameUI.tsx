import { SettingsTrigger } from "@jgengine/react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";
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
      <HudPanel id="settings" anchor="top-right" inset={{ x: 18, y: 18 }}>
        <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-[var(--jg-edge-bright)] bg-[var(--jg-surface)]/80 text-base text-[var(--jg-text-dim)] shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition hover:bg-[var(--jg-surface-deep)] hover:text-[var(--jg-accent)]" />
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
