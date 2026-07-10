import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { elapsedSecondsFor, MAX_STRIKES, type HeistState } from "../../state/heistState";
import { mansionClockAt } from "../../schedule/mansionClock";

export function DawnClockHud(): ReactNode {
  const reading = useGameStore((ctx) => {
    const heist = ctx.game.store.get("heist") as HeistState | undefined;
    if (heist === undefined) return null;
    const elapsed = elapsedSecondsFor(heist, ctx.time.now());
    return { clock: mansionClockAt(elapsed), strikes: heist.strikes, sneaking: heist.sneaking };
  });
  if (reading === null) return null;

  return (
    <div className="flex flex-col items-center gap-1 rounded-b-lg border border-t-0 border-[#c9a227]/60 bg-[#0b0f1c]/85 px-5 py-2 shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-2xl font-bold tabular-nums text-[#f2e3c2]">{reading.clock.label}</span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#c9a227]">until dawn</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_STRIKES }, (_, index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 rounded-full border border-[#7a1f2b]"
              style={{ backgroundColor: index < reading.strikes ? "#7a1f2b" : "transparent" }}
            />
          ))}
        </div>
        {reading.sneaking ? (
          <span className="rounded border border-[#1d2b4a] bg-[#1d2b4a]/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#a9c2ff]">
            Sneaking
          </span>
        ) : null}
      </div>
    </div>
  );
}
