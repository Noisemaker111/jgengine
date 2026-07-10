import { useDisplayProfile } from "@jgengine/react/display";

import type { SessionSnapshot } from "../../race/session";
import { KeybindBadge } from "./KeybindBadge";
import { formatRaceTime, PALETTE } from "./theme";

const SPEED_FOR_FULL_BAR = 42;

export function FlightDeck({ snapshot }: { snapshot: SessionSnapshot }) {
  const { coarsePointer } = useDisplayProfile();
  const speed = snapshot.playerSpeed;
  const speedFraction = Math.min(1, speed / SPEED_FOR_FULL_BAR);
  const speedColor = snapshot.flow.inCore ? PALETTE.skyTeal : snapshot.flow.inTube ? PALETTE.windsockOrange : PALETTE.cloudWhite;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border px-4 py-3"
      style={{ borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1eda" }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-black tabular-nums" style={{ color: speedColor }}>
          {speed.toFixed(0)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: `${PALETTE.cloudWhite}77` }}>
          m/s
        </span>
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full" style={{ backgroundColor: `${PALETTE.citySlate}44` }}>
        <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${speedFraction * 100}%`, backgroundColor: speedColor }} />
      </div>
      <div className="flex items-center gap-2">
        {coarsePointer ? null : <KeybindBadge action="dodge" />}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: snapshot.dodge.maxCharges }, (_, i) => i).map((i) => {
            const filled = i < snapshot.dodge.charges;
            const charging = i === snapshot.dodge.charges && snapshot.dodge.rechargeFraction < 1;
            return (
              <span key={i} className="relative inline-block h-2.5 w-7 overflow-hidden rounded-full" style={{ backgroundColor: `${PALETTE.citySlate}44` }}>
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: filled ? "100%" : charging ? `${snapshot.dodge.rechargeFraction * 100}%` : "0%",
                    backgroundColor: filled ? PALETTE.windsockOrange : `${PALETTE.windsockOrange}88`,
                  }}
                />
              </span>
            );
          })}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: `${PALETTE.cloudWhite}77` }}>
          Barrel-shift
        </span>
      </div>
      {snapshot.ghost.bestTime !== null && (
        <span className="text-[9px] font-bold uppercase tracking-[0.25em]" style={{ color: PALETTE.skyTeal }}>
          Shadow lap {formatRaceTime(snapshot.ghost.bestTime)}
        </span>
      )}
    </div>
  );
}
