import { KeyHint } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { sectors } from "../../course/sectors";
import { keyLabel } from "../keyLabel";
import { useStore } from "@jgengine/react/store";
import { runStore } from "../../systems/runState";

export function LoseScreen() {
  const { commands } = useGame();
  const run = useStore(runStore);
  const sector = sectors[run.loseSectorIndex ?? 0]!;

  return (
    <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#ff4b3e]/30 bg-[#20242a]/95 px-8 py-7 text-center shadow-2xl">
      <span className="text-xs font-bold tracking-widest text-[#ff4b3e]">RUN FAILED</span>
      <h2 className="text-2xl font-black text-[#dfe6ee]">{sector.label}</h2>
      <p className="text-sm text-[#dfe6ee]/75">
        3 crashes burned. Cause: <span className="font-semibold text-[#ff4b3e]">{run.loseCause ?? "unknown"}</span>
      </p>
      <span className="text-[11px] text-[#dfe6ee]/50">total run time: {run.totalElapsed.toFixed(1)}s</span>
      <button
        type="button"
        onClick={() => commands.run("startRun", {})}
        className="w-full rounded bg-[#ff4b3e] py-2.5 text-sm font-black tracking-widest text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
      >
        RESTART
        <KeyHint> — {keyLabel("startRun")}</KeyHint>
      </button>
    </div>
  );
}
