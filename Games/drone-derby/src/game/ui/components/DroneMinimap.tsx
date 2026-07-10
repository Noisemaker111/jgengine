import { compassBearing, headingToBearing, projectToMinimap } from "@jgengine/core/world/minimap";

const SIZE = 176;
const WORLD_RADIUS = 130;

export interface MinimapRing {
  id: string;
  x: number;
  z: number;
  state: "done" | "next" | "pending";
}

export interface MinimapPad {
  id: string;
  x: number;
  z: number;
  charging: boolean;
}

export function DroneMinimap({
  center,
  heading,
  rings,
  pads,
  rangeMeters,
  windVector,
  gustActive,
}: {
  center: readonly [number, number];
  heading: number;
  rings: readonly MinimapRing[];
  pads: readonly MinimapPad[];
  rangeMeters: number;
  windVector: readonly [number, number];
  gustActive: boolean;
}) {
  const view = { center, worldRadius: WORLD_RADIUS, size: SIZE };
  const clampedRange = Number.isFinite(rangeMeters) ? rangeMeters : WORLD_RADIUS;
  const rangeRadiusPx = Math.min(SIZE / 2, clampedRange * (SIZE / 2 / WORLD_RADIUS));
  const windBearingDeg = (compassBearing([0, 0], windVector) * 180) / Math.PI;
  const playerBearingDeg = (headingToBearing(heading) * 180) / Math.PI;

  return (
    <div
      className="relative overflow-hidden rounded-full"
      data-jg="drone-minimap"
      style={{
        width: SIZE,
        height: SIZE,
        background: "var(--jg-surface-deep)",
        border: "2px solid var(--jg-edge-bright)",
        boxShadow: "inset 0 0 24px rgba(0,0,0,0.85), 0 4px 14px rgba(0,0,0,0.6)",
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="absolute inset-0">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={rangeRadiusPx}
          fill="none"
          stroke="var(--jg-accent)"
          strokeOpacity={0.55}
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        {rings.map((ring) => {
          const point = projectToMinimap([ring.x, ring.z], view);
          if (!point.inside) return null;
          const color = ring.state === "done" ? "var(--jg-text-dim)" : "var(--jg-mana)";
          return (
            <circle
              key={ring.id}
              cx={point.x}
              cy={point.y}
              r={ring.state === "next" ? 4.5 : 3}
              fill={color}
              opacity={ring.state === "done" ? 0.35 : 1}
              style={ring.state === "next" ? { filter: "drop-shadow(0 0 3px var(--jg-mana))" } : undefined}
            />
          );
        })}
        {pads.map((pad) => {
          const point = projectToMinimap([pad.x, pad.z], view);
          if (!point.inside) return null;
          return (
            <rect
              key={pad.id}
              x={point.x - 3.5}
              y={point.y - 3.5}
              width={7}
              height={7}
              transform={`rotate(45 ${point.x} ${point.y})`}
              fill={pad.charging ? "var(--jg-accent)" : "var(--jg-stamina)"}
            />
          );
        })}
        <polygon
          points={`${SIZE / 2},${SIZE / 2 - 7} ${SIZE / 2 - 5},${SIZE / 2 + 6} ${SIZE / 2 + 5},${SIZE / 2 + 6}`}
          fill="var(--jg-text)"
          transform={`rotate(${playerBearingDeg} ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div
        className="absolute flex items-center gap-1"
        style={{ right: 6, top: 6, opacity: gustActive ? 1 : 0.4 }}
        data-jg="wind-arrow"
      >
        <span
          style={{
            display: "inline-block",
            transform: `rotate(${windBearingDeg}deg)`,
            color: "var(--jg-mana)",
            fontSize: 14,
            filter: "drop-shadow(0 0 3px var(--jg-mana))",
          }}
        >
          ▲
        </span>
      </div>
    </div>
  );
}
