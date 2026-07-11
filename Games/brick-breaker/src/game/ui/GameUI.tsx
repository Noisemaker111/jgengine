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
    <div
      className="absolute inset-0 flex flex-col gap-2 px-3 pb-2 pt-3 font-sans text-white select-none"
      style={{ background: "radial-gradient(circle at 50% -10%, #1a1550 0%, #07061a 62%)" }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Hud snapshot={snapshot} compact={compact} />
        </div>
        <button
          type="button"
          onClick={togglePause}
          className="shrink-0 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-200 transition hover:bg-white/15"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Playfield />
        </div>
        <Overlays snapshot={snapshot} onRestart={restart} coarsePointer={coarsePointer} />
      </div>

      <PowerupBar snapshot={snapshot} />

      {!coarsePointer && (
        <div className="text-center text-[10px] uppercase tracking-[0.22em] text-slate-500">
          ← → / A D move · Space launch · P pause · R restart
        </div>
      )}

      <div className="text-center text-[10px] uppercase tracking-[0.28em] text-slate-500/80">
        Homage to Breakout (Atari, 1976)
      </div>
    </div>
  );
}
