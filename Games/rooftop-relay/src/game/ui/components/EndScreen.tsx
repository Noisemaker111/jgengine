import type { LegSplit } from "../../relay/state";
import { formatClock } from "../../format";
import { TIME_CAP_SECONDS } from "../../tuning";
import { SplitsTable } from "./SplitsTable";

export function EndScreen({
  won,
  elapsedSeconds,
  fallCount,
  splits,
  onRestart,
}: {
  won: boolean;
  elapsedSeconds: number;
  fallCount: number;
  splits: readonly LegSplit[];
  onRestart: () => void;
}) {
  return (
    <div className="pointer-events-auto flex max-h-full w-[min(92vw,32rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-[#f2b950]/40 bg-[#2b2320]/92 p-6 shadow-2xl backdrop-blur">
      <div>
        <h1 className={`text-3xl font-black tracking-tight ${won ? "text-[#f2b950]" : "text-[#b3573f]"}`}>
          {won ? "RELAY COMPLETE" : "CLOCK RAN OUT"}
        </h1>
        <p className="mt-1 text-sm text-[#c9c4b8]">
          {won
            ? `Baton home in ${formatClock(elapsedSeconds)}, under the ${formatClock(TIME_CAP_SECONDS)} cap.`
            : `${formatClock(elapsedSeconds)} on the clock — the ${formatClock(TIME_CAP_SECONDS)} cap beat the crew.`}
        </p>
        <p className="mt-1 text-xs text-[#c9c4b8]/70">{fallCount} rooftop fall{fallCount === 1 ? "" : "s"} along the way.</p>
      </div>

      <SplitsTable splits={splits} />

      <button
        type="button"
        onClick={onRestart}
        className="mt-1 min-h-12 rounded-lg bg-[#b3573f] px-4 py-3 text-base font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-[#c96448] active:translate-y-px"
      >
        Restart (R)
      </button>
    </div>
  );
}
