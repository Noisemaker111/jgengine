import type { SessionSnapshot } from "../../race/session";
import { PALETTE } from "./theme";

const SIZE = 150;
const CENTER = SIZE / 2;
const RING_COUNT = 3;
const MAX_RADIUS = 62;
const MIN_RADIUS = 14;

export function CenteringHud({ snapshot }: { snapshot: SessionSnapshot }) {
  const { flow, laminar } = snapshot;
  const lockColor = flow.inCore ? PALETTE.skyTeal : flow.inTube ? PALETTE.windsockOrange : `${PALETTE.cloudWhite}55`;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {Array.from({ length: RING_COUNT }, (_, i) => i).map((i) => {
          const spread = 1 - flow.centering * 0.72;
          const baseRadius = MIN_RADIUS + ((MAX_RADIUS - MIN_RADIUS) * (i + 1)) / RING_COUNT;
          const radius = MIN_RADIUS + (baseRadius - MIN_RADIUS) * spread;
          return (
            <circle
              key={i}
              cx={CENTER}
              cy={CENTER}
              r={radius}
              fill="none"
              stroke={lockColor}
              strokeWidth={flow.inCore ? 2.4 : 1.4}
              strokeOpacity={flow.inTube ? 0.85 - i * 0.15 : 0.3}
            />
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={3} fill={lockColor} />
        <line x1={CENTER - 9} y1={CENTER} x2={CENTER - 4} y2={CENTER} stroke={lockColor} strokeWidth={1.5} />
        <line x1={CENTER + 4} y1={CENTER} x2={CENTER + 9} y2={CENTER} stroke={lockColor} strokeWidth={1.5} />
        <line x1={CENTER} y1={CENTER - 9} x2={CENTER} y2={CENTER - 4} stroke={lockColor} strokeWidth={1.5} />
        <line x1={CENTER} y1={CENTER + 4} x2={CENTER} y2={CENTER + 9} stroke={lockColor} strokeWidth={1.5} />
      </svg>
      <div
        className="flex flex-col items-center gap-0.5 rounded-full border px-4 py-1"
        style={{ borderColor: `${lockColor}88`, backgroundColor: "#0f1d1ecc" }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: lockColor }}>
          {laminar.tierLabel}
        </span>
        <span className="font-mono text-sm font-black" style={{ color: PALETTE.cloudWhite }}>
          Streak {laminar.streak}
          <span className="ml-1 text-xs" style={{ color: `${PALETTE.cloudWhite}77` }}>
            x{laminar.multiplier.toFixed(2)}
          </span>
        </span>
      </div>
    </div>
  );
}
