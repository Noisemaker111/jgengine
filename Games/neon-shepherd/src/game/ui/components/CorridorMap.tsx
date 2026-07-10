import { projectToMinimap } from "@jgengine/core/world/minimap";
import { CORRIDOR_HALF_WIDTH, PALETTE, PARK_Z, SANCTUARY_Z } from "../../constants";
import { ROADS } from "../../roads/catalog";
import type { RunState } from "../../session/store";

const WORLD_RADIUS = Math.abs(SANCTUARY_Z) + 14;

function project(x: number, z: number, size: number) {
  return projectToMinimap([x, z], { center: [0, 0], worldRadius: WORLD_RADIUS, size });
}

export function CorridorMap({
  run,
  shepherd,
  size = 132,
}: {
  run: RunState;
  shepherd: { x: number; z: number };
  size?: number;
}): React.ReactNode {
  const creatures = Object.values(run.creatures).filter((c) => c.alive);
  const centroid =
    creatures.length > 0
      ? { x: creatures.reduce((s, c) => s + c.x, 0) / creatures.length, z: creatures.reduce((s, c) => s + c.z, 0) / creatures.length }
      : { x: 0, z: PARK_Z };
  const herdPoint = project(centroid.x, centroid.z, size);
  const shepherdPoint = project(shepherd.x, shepherd.z, size);
  const parkPoint = project(0, PARK_Z, size);
  const sanctuaryPoint = project(0, SANCTUARY_Z, size);
  const corridorLeft = project(-CORRIDOR_HALF_WIDTH, 0, size).x;
  const corridorRight = project(CORRIDOR_HALF_WIDTH, 0, size).x;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#7ef9c8]/20 bg-[#101318]/80 backdrop-blur-sm"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute top-0 bottom-0 bg-[#181c22]"
        style={{ left: corridorLeft, width: Math.max(2, corridorRight - corridorLeft) }}
      />
      {ROADS.map((road) => {
        const point = project(0, road.z, size);
        return (
          <div
            key={road.id}
            className="absolute h-[2px] bg-[#f5c56b]/70"
            style={{ left: corridorLeft, width: Math.max(2, corridorRight - corridorLeft), top: point.y }}
          />
        );
      })}
      <div
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: parkPoint.x, top: parkPoint.y, backgroundColor: PALETTE.spiritMint, opacity: 0.6 }}
      />
      <div
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: sanctuaryPoint.x, top: sanctuaryPoint.y, backgroundColor: PALETTE.spiritRose, boxShadow: `0 0 8px ${PALETTE.spiritRose}` }}
      />
      <div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: herdPoint.x, top: herdPoint.y, backgroundColor: PALETTE.spiritMint, boxShadow: `0 0 8px ${PALETTE.spiritMint}` }}
      />
      <div
        className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#eef4f0]"
        style={{ left: shepherdPoint.x, top: shepherdPoint.y }}
      />
    </div>
  );
}
