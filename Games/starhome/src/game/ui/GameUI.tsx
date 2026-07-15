import type { ReactNode } from "react";

import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";

import { BuildPalette } from "./components/BuildPalette";
import { EventFeed } from "./components/EventFeed";
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { TopBar } from "./components/TopBar";

export function GameUI(): ReactNode {
  const layout = useHudLayout({ storageKey: "starhome" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="brand" anchor="top-left" compact="keep" interactive={false}>
        <div className="pointer-events-none select-none">
          <div className="text-lg font-black tracking-tight text-slate-100 drop-shadow">STARHOME</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-200/80">life sim habitat</div>
        </div>
      </HudPanel>

      <HudPanel id="topbar" anchor="top" compact="keep" interactive>
        <TopBar />
      </HudPanel>

      <HudPanel id="events" anchor="top-right" compact="keep" interactive={false}>
        <EventFeed />
      </HudPanel>

      <HudPanel id="roster" anchor="left" compact="keep" interactive>
        <RosterPanel />
      </HudPanel>

      <HudPanel id="inspector" anchor="right" compact="keep" interactive>
        <Inspector />
      </HudPanel>

      <HudPanel id="build" anchor="bottom" compact="keep" interactive>
        <BuildPalette />
      </HudPanel>
    </HudCanvas>
  );
}
