import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { COMMAND_RESTART } from "../../run/session";
import { RADIO_VOICE } from "../palette";
import { useRunState } from "../useRunView";

export function WinScreen() {
  const run = useRunState();
  const { commands } = useGame();
  if (run.status !== "won") return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#0f1f1c]/85">
      <div className="flex w-[24rem] max-w-[92vw] flex-col gap-4 rounded-2xl border border-[#4a7c59]/60 bg-[#26413c]/95 p-7 text-center shadow-2xl">
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#4a7c59]">Dispatch Complete</span>
        <h1 className="text-3xl font-black text-[#e8d5a3]">All Deliveries Made</h1>
        <p className="text-xs italic text-[#e8d5a3]/80">"{RADIO_VOICE.win}"</p>
        <div className="flex justify-center gap-8 py-1">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">{run.completed}</span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Deliveries</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">{run.elapsed.toFixed(0)}s</span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Run Time</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">{run.score}</span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Score</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => commands.run(COMMAND_RESTART, undefined)}
          className="rounded-xl bg-[#4a7c59] px-6 py-3 text-sm font-bold uppercase tracking-wide text-[#0f1f1c] shadow-lg transition hover:brightness-110"
        >
          Run Again ({actionLabel(keybinds, "restartRun")})
        </button>
      </div>
    </div>
  );
}
