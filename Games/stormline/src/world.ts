import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { building, environment, grass, pad, rain, sky, terrain, type WorldFeature } from "@jgengine/core/world/features";
import { COURSE_LENGTH } from "./game/course/catalog";

export const COURSE_START_Z = -900;
const WORLD_MARGIN = 620;
export const WORLD_BOUNDS = { w: 260, d: COURSE_LENGTH + WORLD_MARGIN } as const;

export function worldZ(progress: number): number {
  return COURSE_START_Z + progress;
}

export const LANE_WORLD_WIDTH = 14;

export interface FarmsteadSite {
  readonly id: string;
  readonly progress: number;
  readonly x: number;
  readonly style: string;
  readonly count: number;
}

export const FARMSTEADS: readonly FarmsteadSite[] = [
  { id: "cutbank-farm", progress: 150, x: 55, style: "homestead", count: 3 },
  { id: "silo-row-farm", progress: 520, x: 62, style: "grain-co-op", count: 4 },
  { id: "coulee-farm", progress: 990, x: 50, style: "ranch", count: 3 },
  { id: "windbreak-farm", progress: 1450, x: 58, style: "barnyard", count: 3 },
  { id: "shelter-farm", progress: 1900, x: 40, style: "shelter", count: 2 },
];

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: WORLD_BOUNDS,
    material: "grass",
    colors: { low: "#8a7233", high: "#d9a441", waterline: "#3d4a5c" },
    seed: "stormline-terrain",
    height: 7,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 2,
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#f25c05",
    zenithColor: "#3d4a5c",
    sunIntensity: 1.1,
    ambientIntensity: 0.6,
    fog: { color: "#9fb8c8", near: 160, far: 780 },
  }),
  weather: rain({
    area: { w: WORLD_BOUNDS.w, d: WORLD_BOUNDS.d, h: 90 },
    density: 0.6,
    speed: 22,
    wind: [0.3, 1],
    color: "#9fb8c8",
  }),
  vegetation: grass({
    area: { w: WORLD_BOUNDS.w, d: WORLD_BOUNDS.d },
    density: 3,
    colors: ["#a98a3a", "#d9a441"],
  }),
  structures: FARMSTEADS.map((farm) =>
    building({
      position: [farm.x, worldZ(farm.progress)],
      count: farm.count,
      footprint: { w: 9, d: 9 },
      stories: [1, 2],
      storyHeight: 3.2,
      spacing: 4,
      style: farm.style,
      seed: `stormline-${farm.id}`,
    }),
  ),
  pads: FARMSTEADS.map((farm) => pad({ center: [farm.x, worldZ(farm.progress)], size: { radius: 22 } })),
});

export const physics: PhysicsConfig = { gravity: -24 };
