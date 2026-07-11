import { SettingsTrigger } from "@jgengine/react";
import { useEngineState } from "@jgengine/react/engineStore";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { freecellStore } from "../freecell/store";
import { Board } from "./components/Board";
import { StatsPanel } from "./components/StatsPanel";
import { Toolbar } from "./components/Toolbar";
import { WinOverlay } from "./components/WinOverlay";

const CREDIT = "FreeCell — Paul Alfille (1978); popularized by Jim Horne's Windows FreeCell";

export function GameUI() {
  const snapshot = useEngineState(freecellStore);
  const layout = useHudLayout({ storageKey: "freecell" });

  return (
    <HudCanvas layout={layout} className="font-sans text-slate-100">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-auto p-3">
        <div className="pointer-events-auto">
          <Board snapshot={snapshot} />
        </div>
      </div>

      <HudPanel id="controls" anchor="top-left" compact="chip" chip="Menu">
        <Toolbar snapshot={snapshot} />
      </HudPanel>

      <HudPanel id="stats" anchor="top-right" compact="chip" chip="Stats">
        <div className="flex flex-col items-end gap-2">
          <SettingsTrigger className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-slate-300/25 bg-slate-800/70 text-slate-200 transition hover:border-sky-300/60 hover:bg-slate-700/80" />
          <StatsPanel snapshot={snapshot} />
        </div>
      </HudPanel>

      <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
        <p className="text-[11px] font-medium tracking-wide text-slate-400/80 drop-shadow">{CREDIT}</p>
      </HudPanel>

      {snapshot.message !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-[16%] flex justify-center">
          <span className="text-lg font-bold text-rose-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
            {snapshot.message}
          </span>
        </div>
      )}

      <WinOverlay snapshot={snapshot} />
    </HudCanvas>
  );
}
