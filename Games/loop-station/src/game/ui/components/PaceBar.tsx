import { useMemo } from "react";

import { paceDelta } from "../../run/pace";
import { LOOP_TEAL, TAPE_MAGENTA } from "../../track/palette";
import type { RunState } from "../../run/types";

export function PaceBar({ run }: { run: RunState }) {
  const currentElapsed = run.now - run.lapStartTime;
  const reading = useMemo(
    () => paceDelta(run.previousLapFrames, currentElapsed, run.position.s),
    [run.previousLapFrames, currentElapsed, run.position.s],
  );

  const label =
    reading.status === "unknown" ? "FIRST LAP — NO GHOST YET" : reading.status === "even" ? "EVEN PACE" : reading.status === "ahead" ? "AHEAD" : "BEHIND";
  const color = reading.status === "ahead" ? LOOP_TEAL : reading.status === "behind" ? TAPE_MAGENTA : "#f5f2fa";
  const magnitude = Math.min(Math.abs(reading.deltaSeconds) / 4, 1);

  return (
    <div className="pointer-events-none flex w-64 flex-col items-center gap-1">
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-[#6247aa]/60 bg-[#1c1830]/80">
        <div className="absolute left-1/2 top-0 h-full w-px bg-[#6247aa]/80" />
        <div
          className="absolute top-0 h-full rounded-full transition-[width]"
          style={{
            width: `${magnitude * 50}%`,
            left: reading.status === "ahead" ? "50%" : `${50 - magnitude * 50}%`,
            background: color,
          }}
        />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color }}>
        {label}
        {reading.status !== "unknown" && reading.status !== "even"
          ? ` ${Math.abs(reading.deltaSeconds).toFixed(2)}s`
          : ""}
      </p>
    </div>
  );
}
