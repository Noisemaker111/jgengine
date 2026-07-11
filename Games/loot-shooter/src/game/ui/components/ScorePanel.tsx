import { useCurrency } from "@jgengine/react/hooks";
import { useRun } from "./useRun";

export function ScorePanel() {
  const run = useRun();
  const scrap = useCurrency("scrap");
  if (run.status === "ready") return null;
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Score</span>
        <span className="text-2xl font-black tabular-nums text-cyan-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {run.score}
        </span>
      </div>
      <div className="flex gap-3 text-xs font-semibold uppercase tracking-wider">
        <span className="text-slate-300">{run.kills} kills</span>
        <span className="text-amber-300">{scrap} scrap</span>
      </div>
    </div>
  );
}
