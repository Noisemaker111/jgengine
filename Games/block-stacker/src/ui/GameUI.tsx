import { useGame } from "@jgengine/react/hooks";
import { useEngineState } from "@jgengine/react/engineStore";

import { blockStackerStore } from "../tetris/store";
import { Board } from "./components/Board";
import { ControlsPanel, HoldPanel, NextPanel, StatsPanel } from "./components/SidePanel";

export function GameUI() {
  const snapshot = useEngineState(blockStackerStore);
  const { commands } = useGame();
  const restart = () => commands.run("restart", {});

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-6 p-6 font-sans text-white select-none">
      <div className="pointer-events-auto flex w-40 flex-col gap-4">
        <HoldPanel snapshot={snapshot} />
        <StatsPanel snapshot={snapshot} />
      </div>

      <div className="relative pointer-events-auto">
        <div className="mb-3 text-center text-2xl font-black uppercase tracking-[0.3em] text-cyan-300 drop-shadow">
          Block Stacker
        </div>
        <Board snapshot={snapshot} />
        {snapshot.status === "gameover" && (
          <div className="absolute inset-0 top-11 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/80 backdrop-blur-sm">
            <div className="text-3xl font-black uppercase tracking-widest text-red-400">Game Over</div>
            <div className="font-mono text-lg text-slate-200">Score {snapshot.score}</div>
            <button
              type="button"
              onClick={restart}
              className="rounded-md border border-cyan-400/50 bg-cyan-500/20 px-5 py-2 text-sm font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/40"
            >
              Restart
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-auto flex w-44 flex-col gap-4">
        <NextPanel snapshot={snapshot} />
        <ControlsPanel />
      </div>
    </div>
  );
}
