import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { useRunState } from "../hooks";

export function WinScreen() {
  const run = useRunState();
  const { commands } = useGame();
  const fast = Object.values(run.forkChoices).filter((choice) => choice === "fast").length;
  const safe = Object.values(run.forkChoices).filter((choice) => choice === "safe").length;
  const closestCall = Number.isFinite(run.minLead) ? Math.max(0, Math.round(run.minLead)) : 0;

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1e2633]/90 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[#d9a441] bg-[#1e2633] p-6 text-center shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-[#d9a441]">Shelter Reached</p>
        <h1 className="text-3xl font-bold text-[#d9a441]">You Outran the Line</h1>
        <div className="grid grid-cols-3 gap-2 text-sm text-[#9fb8c8]">
          <div className="rounded border border-[#3d4a5c] bg-[#141b23] p-2">
            <div className="text-lg font-bold text-[#d9a441]">{run.now.toFixed(1)}s</div>
            <div className="text-[10px] uppercase tracking-wide">Time</div>
          </div>
          <div className="rounded border border-[#3d4a5c] bg-[#141b23] p-2">
            <div className="text-lg font-bold text-[#f25c05]">{closestCall}m</div>
            <div className="text-[10px] uppercase tracking-wide">Closest call</div>
          </div>
          <div className="rounded border border-[#3d4a5c] bg-[#141b23] p-2">
            <div className="text-lg font-bold text-[#d9a441]">
              {fast}/{safe}
            </div>
            <div className="text-[10px] uppercase tracking-wide">Fast / safe forks</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => commands.run("restart", undefined)}
          className="rounded-lg bg-[#d9a441] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[#1e2633] shadow transition-transform hover:scale-[1.02] active:scale-95"
        >
          Run it again — {actionLabel(keybinds, "restart") ?? "R"}
        </button>
      </div>
    </div>
  );
}
