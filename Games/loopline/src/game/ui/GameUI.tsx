import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import { BuildBar } from "./components/BuildBar";
import { GameOver } from "./components/GameOver";
import { Inspector } from "./components/Inspector";
import { TimeControls } from "./components/TimeControls";
import { Toasts } from "./components/Toasts";
import { TopBar } from "./components/TopBar";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "loopline" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="stats" anchor="top-left" inset={{ x: 16, y: 16 }} interactive>
        <TopBar />
      </HudPanel>
      <HudPanel id="time" anchor="top-right" inset={{ x: 16, y: 16 }} interactive>
        <div className="flex items-center gap-2">
          <TimeControls />
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-slate-900/85 text-base text-slate-300 shadow-lg backdrop-blur transition hover:text-amber-300" />
        </div>
      </HudPanel>
      <HudPanel id="toasts" anchor="top" inset={{ x: 0, y: 128 }} compact="keep" interactive={false}>
        <Toasts />
      </HudPanel>
      <HudPanel id="inspector" anchor="right" inset={{ x: 16, y: 0 }} interactive>
        <Inspector />
      </HudPanel>
      <HudPanel id="build" anchor="bottom" inset={{ x: 0, y: 16 }} interactive>
        <BuildBar />
      </HudPanel>
      <GameOver />
    </HudCanvas>
  );
}
