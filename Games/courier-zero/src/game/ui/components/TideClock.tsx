import {
  SURGE_INTERVAL_SECONDS,
  nextTideStage,
  secondsToNextSurge,
  tideStageAt,
} from "../../tide/catalog";
import { useRunState } from "../useRunView";

export function TideClock() {
  const run = useRunState();
  const stage = tideStageAt(run.elapsed);
  const next = nextTideStage(run.elapsed);
  const remaining = secondsToNextSurge(run.elapsed);
  const progress = remaining === null ? 1 : 1 - remaining / SURGE_INTERVAL_SECONDS;

  return (
    <div className="pointer-events-none flex w-64 flex-col gap-1.5 rounded-xl border border-[#2a9d8f]/50 bg-[#26413c]/90 px-4 py-2.5 text-[#e8d5a3] shadow-lg backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]/70">Tide Clock</span>
        <span className="font-mono text-sm font-bold text-[#e8d5a3]">{stage.level.toFixed(1)}m</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#0f1f1c]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2a9d8f] to-[#e76f51] transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
      <span className="text-[11px] text-[#e8d5a3]/80">
        {remaining === null || next === null
          ? "Final surge has landed — this is high water."
          : `Next surge in ${Math.ceil(remaining)}s — ${next.name} at risk`}
      </span>
    </div>
  );
}
