import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  grass,
  pad,
  sky,
  terrain,
  type WorldFeature,
} from "@jgengine/core/world/features";

import { groundMaterial } from "./game/assets";

export const world: WorldFeature = environment({
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 0,
    material: "grass",
    colors: { low: "#5c9440", high: "#84bd54", waterline: "#4a7d8a" },
    segments: 160,
    detail: {
      strength: 1,
      macroScale: 22,
      detailScale: 3,
      material: { maps: groundMaterial.maps, repeat: 26, strength: 0.9 },
    },
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#cfe8f2",
    zenithColor: "#4ea6dd",
    sunIntensity: 1.15,
    ambientIntensity: 0.85,
  }),
  vegetation: grass({
    area: { w: 130, d: 130 },
    density: 3.4,
    bladeHeight: [0.25, 0.75],
    colors: ["#4f8a35", "#7cb648", "#5f9d3c"],
    seed: "loopline",
  }),
  pads: [
    pad({ center: [0, 54], size: [16, 8], height: 0.06, color: "#cbb78c" }),
    pad({ center: [0, 8], size: { radius: 7 }, height: 0.05, color: "#c7b389" }),
  ],
  structures: [
    building({
      count: 6,
      position: [0, -92],
      footprint: { w: 12, d: 10 },
      stories: [2, 5],
      spacing: 6,
      style: "coastal",
      palette: { wall: "#ecdcc0", roof: "#c85a44" },
      seed: "loopline-town",
    }),
    building({
      count: 4,
      position: [-78, -30],
      footprint: { w: 10, d: 10 },
      stories: [1, 3],
      spacing: 6,
      style: "village",
      palette: { wall: "#f0e3c8", roof: "#5a86b0" },
      seed: "loopline-west",
    }),
    building({
      count: 4,
      position: [78, -30],
      footprint: { w: 10, d: 10 },
      stories: [1, 3],
      spacing: 6,
      style: "village",
      palette: { wall: "#f0e3c8", roof: "#c8a24a" },
      seed: "loopline-east",
    }),
  ],
});

export const physics: PhysicsConfig = { gravity: -20 };
