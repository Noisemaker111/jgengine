import { TOTAL_LEGS } from "../../relay/state";
import { formatClock } from "../../format";
import { TIME_CAP_SECONDS } from "../../tuning";

export function RelayClock({
  legIndex,
  legName,
  runnerName,
  elapsedSeconds,
  paceStreakSeconds,
}: {
  legIndex: number;
  legName: string;
  runnerName: string;
  elapsedSeconds: number;
  paceStreakSeconds: number;
}) {
  const streaking = paceStreakSeconds > 0;
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[#f2b950]/50 bg-black/55 px-5 py-2 text-center shadow-lg backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9c4b8]">
        Runner {legIndex + 1}/{TOTAL_LEGS} — {runnerName}
      </p>
      <p className="text-xs text-[#c9c4b8]/80">{legName}</p>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold tabular-nums text-[#f2b950]">{formatClock(elapsedSeconds)}</span>
        <span className="text-xs text-[#c9c4b8]/70">/ {formatClock(TIME_CAP_SECONDS)}</span>
        {streaking ? (
          <svg
            className="h-5 w-5 animate-pulse text-[#b3573f]"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="Pace streak active — shaving seconds"
          >
            <title>Pace streak active</title>
            <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-2 1 4-1 6-3 6-2.5 0-4-1.8-4-4.2C10 6 12 5 12 2z" />
            <path d="M9.5 13.5c.3 2.5 2 4.5 4.5 4.5 2.8 0 5-2.2 5-5 0-1.6-.7-2.8-1.3-3.6.4 3.3-1.5 5.6-4.2 5.6-1.6 0-2.9-.7-4-1.5z" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
