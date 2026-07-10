import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { ZONES } from "./game/zones/catalog";

function zoneMid(start: number, end: number): number {
  return (start + end) / 2;
}

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 130, d: 1000 },
    height: 2.4,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 0,
    seed: "wreckway-yard",
    colors: { low: "#1c1a17", high: "#6b4226", waterline: "#1c1a17" },
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#d98a3d",
    zenithColor: "#3a2a1c",
    sunIntensity: 2.4,
    ambientIntensity: 0.9,
    fog: { color: "#4a3423", near: 90, far: 420 },
  }),
  structures: ZONES.flatMap((zone) => {
    const midZ = zoneMid(zone.start, zone.end);
    return [
      building({
        count: 9,
        position: [-38, midZ],
        footprint: { w: 11, d: 11 },
        stories: [2, 6],
        storyHeight: 3.2,
        spacing: 4,
        style: zone.buildingStyle,
        seed: `wreckway-${zone.id}-left`,
      }),
      building({
        count: 9,
        position: [38, midZ],
        footprint: { w: 11, d: 11 },
        stories: [2, 6],
        storyHeight: 3.2,
        spacing: 4,
        style: zone.buildingStyle,
        seed: `wreckway-${zone.id}-right`,
      }),
    ];
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
