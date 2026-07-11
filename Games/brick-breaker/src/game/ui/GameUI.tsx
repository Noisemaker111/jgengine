import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";

import { brickBreakerStore } from "../breakout/store";
import { Hud } from "./components/Hud";
import { Overlays } from "./components/Overlays";
import { Playfield } from "./components/Playfield";
import { PowerupBar } from "./components/PowerupBar";

export function GameUI() {
  const snapshot = useEngineState(brickBreakerStore);
  const { commands } = useGame();
  const { compact, coarsePointer } = useDisplayProfile();

  const restart = () => commands.run("restart", {});
  const togglePause = () => commands.run("pause", {});
  const paused = snapshot.paused && snapshot.status !== "gameover" && snapshot.status !== "victory";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#040313] font-sans text-white select-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(91,76,255,0.24),transparent_34%),linear-gradient(#07051e,#02020b)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_3px,white_4px)]" />

      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
        <header className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-violet-400/25 px-1 pb-2">
          <div className="hidden text-[9px] font-black uppercase tracking-[0.35em] text-fuchsia-300/75 sm:block">JG-76 cabinet</div>
          <div className="min-w-0">
            <Hud snapshot={snapshot} compact={compact} />
          </div>
          <button
            type="button"
            onClick={togglePause}
            className="min-h-10 border border-cyan-300/45 bg-[#071429]/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200 shadow-[inset_0_0_16px_rgba(34,211,238,0.08)] transition hover:border-cyan-200 hover:bg-cyan-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 active:scale-[0.96]"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </header>

        <div className="relative mt-2 min-h-0 flex-1 border-x-2 border-t-2 border-violet-500/55 bg-[#06051b] shadow-[0_0_40px_rgba(76,29,149,0.38),inset_0_0_38px_rgba(34,211,238,0.04)]">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-5 w-5 border-l-4 border-t-4 border-cyan-300/70" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-5 w-5 border-r-4 border-t-4 border-cyan-300/70" />
          <div className="absolute inset-2 sm:inset-3">
            <Playfield />
          </div>
          <Overlays snapshot={snapshot} onRestart={restart} coarsePointer={coarsePointer} />
        </div>

        <div className="shrink-0 border-x-2 border-b-2 border-violet-500/55 bg-[#090721] px-3 py-2">
          <PowerupBar snapshot={snapshot} />
          <div className="mt-1 flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.22em] text-slate-500">
            <span>{coarsePointer ? "Drag to move · tap to launch" : "A / D move · Space launch · P pause"}</span>
            <span className="hidden sm:inline">Breakout tribute · 1976</span>
          </div>
        </div>
      </div>
    </div>
  );
}
