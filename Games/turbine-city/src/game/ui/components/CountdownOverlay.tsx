import type { SessionSnapshot } from "../../race/session";
import { PALETTE } from "./theme";

const GO_HOLD_SECONDS = 1;

export function CountdownOverlay({ snapshot }: { snapshot: SessionSnapshot }) {
  if (snapshot.phase === "countdown") {
    const count = Math.max(1, Math.ceil(snapshot.countdown));
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
        <span
          key={count}
          className="font-mono text-[9rem] font-black leading-none"
          style={{ color: PALETTE.cloudWhite, textShadow: `0 0 42px ${PALETTE.skyTeal}` }}
        >
          {count}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: PALETTE.skyTeal }}>
          Fans spooling
        </span>
      </div>
    );
  }
  if (snapshot.phase === "racing" && snapshot.totalTime < GO_HOLD_SECONDS) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="font-mono text-[7rem] font-black uppercase leading-none"
          style={{ color: PALETTE.windsockOrange, textShadow: `0 0 48px ${PALETTE.windsockOrange}`, opacity: 1 - snapshot.totalTime / GO_HOLD_SECONDS }}
        >
          GO
        </span>
      </div>
    );
  }
  return null;
}
