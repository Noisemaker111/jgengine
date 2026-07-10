import { GATES } from "../../course/catalog";
import { useRunState } from "../hooks";

export function GateSplits() {
  const run = useRunState();
  const lastSplit = run.gateSplits.at(-1);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 px-3 py-1.5 text-xs text-[#9fb8c8] shadow-lg">
      <span className="font-semibold text-[#d9a441]">
        Gate {Math.min(run.gatesPassed + 1, GATES.length)}/{GATES.length}
      </span>
      {lastSplit !== undefined ? <span>· last split {lastSplit.time.toFixed(1)}s</span> : null}
    </div>
  );
}
