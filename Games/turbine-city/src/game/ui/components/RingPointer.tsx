import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/world/minimap";

import type { SessionSnapshot } from "../../race/session";
import { RING_COUNT, RING_NODES } from "../../race/route";
import { PALETTE } from "./theme";

const HIDE_WITHIN_METERS = 26;
const VERTICAL_CUE_METERS = 8;

export function RingPointer({ snapshot }: { snapshot: SessionSnapshot }) {
  const target = RING_NODES[snapshot.ringIndex % RING_COUNT]!;
  const player = snapshot.playerPose;
  const dx = target.position[0] - player.position[0];
  const dy = target.position[1] - player.position[1];
  const dz = target.position[2] - player.position[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance < HIDE_WITHIN_METERS) return null;

  const bearing = compassBearing([player.position[0], player.position[2]], [target.position[0], target.position[2]]);
  const relative = relativeBearing(bearing, headingToBearing(player.heading));
  const relativeDegrees = (relative * 180) / Math.PI;
  const verticalCue = dy > VERTICAL_CUE_METERS ? "▲" : dy < -VERTICAL_CUE_METERS ? "▼" : null;
  const offLine = Math.abs(relative) > Math.PI / 2;
  const color = offLine ? PALETTE.windsockOrange : PALETTE.skyTeal;

  return (
    <div className="pointer-events-none absolute left-1/2 top-[26%] flex -translate-x-1/2 flex-col items-center gap-1">
      <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: `rotate(${relativeDegrees}deg)` }}>
        <path d="M22 6 L32 30 L22 24 L12 30 Z" fill={color} stroke="#0f1d1e" strokeWidth={1.4} />
      </svg>
      <span
        className="rounded-full border px-3 py-0.5 font-mono text-xs font-bold tabular-nums"
        style={{ borderColor: `${color}77`, backgroundColor: "#0f1d1ecc", color }}
      >
        {verticalCue !== null && <span className="mr-1">{verticalCue}</span>}
        {Math.round(distance)}m · Ring {Math.min(snapshot.ringIndex + 1, snapshot.ringsTotal)}
      </span>
      {offLine && (
        <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: PALETTE.windsockOrange }}>
          Turn around
        </span>
      )}
    </div>
  );
}
