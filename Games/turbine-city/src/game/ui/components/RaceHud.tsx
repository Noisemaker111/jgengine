import type { SessionSnapshot } from "../../race/session";
import { formatDelta, formatRaceTime, PALETTE } from "./theme";

export function RaceHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const deltaColor = snapshot.pacerDelta === null ? PALETTE.cloudWhite : snapshot.pacerDelta <= 0 ? PALETTE.skyTeal : PALETTE.windsockOrange;
  const deltaLabel = snapshot.pacerDelta === null ? "reading pace" : snapshot.pacerDelta <= 0 ? "ahead of pacer" : "behind pacer";

  return (
    <div
      className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg border px-6 py-3"
      style={{ borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1eda" }}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: PALETTE.skyTeal }}>
          Lap {snapshot.lap}/{snapshot.laps}
        </span>
        <span className="font-mono text-lg font-black" style={{ color: PALETTE.cloudWhite }}>
          Ring {Math.min(snapshot.ringIndex + 1, snapshot.ringsTotal)}
          <span className="text-xs" style={{ color: `${PALETTE.cloudWhite}66` }}>
            /{snapshot.ringsTotal}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: `${PALETTE.cloudWhite}77` }}>
            Time
          </span>
          <span className="font-mono text-sm font-bold" style={{ color: PALETTE.cloudWhite }}>
            {formatRaceTime(snapshot.totalTime)}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: deltaColor }}>
            {deltaLabel}
          </span>
          <span className="font-mono text-sm font-bold" style={{ color: deltaColor }}>
            {formatDelta(snapshot.pacerDelta)}
          </span>
        </div>
      </div>
    </div>
  );
}
