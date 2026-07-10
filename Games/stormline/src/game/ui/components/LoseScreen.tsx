import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { useRunState } from "../hooks";

export function LoseScreen() {
  const run = useRunState();
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1e2633]/90 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[#f25c05] bg-[#1e2633] p-6 text-center shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-[#f25c05]">Swallowed</p>
        <h1 className="text-2xl font-bold text-[#f25c05]">
          THE LINE TOOK YOU AT GATE {run.loseGate ?? 1}
        </h1>
        <p className="text-sm text-[#9fb8c8]">
          Held out {run.now.toFixed(1)}s before the wall closed over the cab.
        </p>
        <button
          type="button"
          onClick={() => commands.run("restart", undefined)}
          className="rounded-lg bg-[#f25c05] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[#1e2633] shadow transition-transform hover:scale-[1.02] active:scale-95"
        >
          Try again — {actionLabel(keybinds, "restart") ?? "R"}
        </button>
      </div>
    </div>
  );
}
