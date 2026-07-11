import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";

import { starInvadersStore } from "../invaders/store";
import { Hud } from "./components/Hud";
import { Overlays } from "./components/Overlays";
import { Playfield } from "./components/Playfield";
import { TouchControls } from "./components/TouchControls";

export function GameUI() {
  const snapshot = useEngineState(starInvadersStore);
  const { commands } = useGame();
  const { compact, coarsePointer } = useDisplayProfile();

  const fire = () => commands.run("fire", {});
  const restart = () => commands.run("restart", {});
  const togglePause = () => commands.run("pause", {});

  return (
    <div
      className="absolute inset-0 flex flex-col gap-2 px-3 pb-2 pt-3 font-sans text-white select-none"
      style={{ background: "radial-gradient(circle at 50% -20%, #071227 0%, #010208 60%)" }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Hud snapshot={snapshot} compact={compact} />
        </div>
        {snapshot.status === "playing" && (
          <button
            type="button"
            onClick={togglePause}
            className="shrink-0 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-200 transition hover:bg-white/15"
          >
            {snapshot.paused ? "Resume" : "Pause"}
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Playfield />
        </div>
        <Overlays snapshot={snapshot} onRestart={restart} onStart={fire} coarsePointer={coarsePointer} />
      </div>

      {coarsePointer ? (
        <TouchControls onFire={fire} />
      ) : (
        <div className="text-center text-[10px] uppercase tracking-[0.22em] text-slate-500">
          ← → / A D move · Space fire · P pause · R restart
        </div>
      )}

      <div className="text-center text-[10px] uppercase tracking-[0.24em] text-slate-500/80">
        Homage to Space Invaders — Tomohiro Nishikado, Taito (1978)
      </div>
    </div>
  );
}
