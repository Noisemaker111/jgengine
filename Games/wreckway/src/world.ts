import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import type { BuildingPaletteOverrides } from "@jgengine/core/world/buildings";
import { building, environment, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";

import { YARD_FLOOR_MATERIAL } from "./game/assets";
import { ZONES, type ZoneDef } from "./game/zones/catalog";

function zoneMid(start: number, end: number): number {
  return (start + end) / 2;
}

function zonePalette(zone: ZoneDef): BuildingPaletteOverrides | undefined {
  return zone.id === "gantry" ? { storeSign: "#f0c419", guardrail: "#f0c419" } : undefined;
}

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 130, d: 1000 },
    height: 2.4,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 0,
    seed: "wreckway-yard",
    segments: 260,
    colors: { low: "#1c1a17", high: "#6b4226", waterline: "#1c1a17" },
    detail: {
      rockColor: "#4a3423",
      material: { maps: YARD_FLOOR_MATERIAL, repeat: 5, strength: 0.85 },
    },
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
    const palette = zonePalette(zone);
    return [
      building({
        count: 9,
        position: [-38, midZ],
        footprint: { w: 11, d: 11 },
        stories: [2, 6],
        storyHeight: 3.2,
        spacing: 4,
        style: zone.buildingStyle,
        ...(palette === undefined ? {} : { palette }),
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
        ...(palette === undefined ? {} : { palette }),
        seed: `wreckway-${zone.id}-right`,
      }),
    ];
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
