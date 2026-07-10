import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { REQUIRED_DELIVERIES } from "../../delivery/catalog";
import { COMMAND_RESTART } from "../../run/session";
import { RADIO_VOICE } from "../palette";
import { useRunState } from "../useRunView";

export function LoseScreen() {
  const run = useRunState();
  const { commands } = useGame();
  if (run.status !== "lost") return null;

  const cause = run.loseReason === "tide" ? "Swallowed by the Tide" : "Out of Parcels";
  const line = run.loseReason === "tide" ? RADIO_VOICE.loseTide : RADIO_VOICE.loseDeadline;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#0f1f1c]/85">
      <div className="flex w-[24rem] max-w-[92vw] flex-col gap-4 rounded-2xl border border-[#e76f51]/60 bg-[#26413c]/95 p-7 text-center shadow-2xl">
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#e76f51]">Run Over</span>
        <h1 className="text-3xl font-black text-[#e8d5a3]">{cause}</h1>
        <p className="text-xs italic text-[#e8d5a3]/80">"{line}"</p>
        <div className="flex justify-center gap-8 py-1">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">
              {run.completed}/{REQUIRED_DELIVERIES}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Deliveries</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">{run.drownCount}</span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Times Caught</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[#e8d5a3]">{run.elapsed.toFixed(0)}s</span>
            <span className="text-[10px] uppercase tracking-wide text-[#e8d5a3]/60">Run Time</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => commands.run(COMMAND_RESTART, undefined)}
          className="rounded-xl bg-[#e76f51] px-6 py-3 text-sm font-bold uppercase tracking-wide text-[#26413c] shadow-lg transition hover:brightness-110"
        >
          Try Again ({actionLabel(keybinds, "restartRun")})
        </button>
      </div>
    </div>
  );
}
