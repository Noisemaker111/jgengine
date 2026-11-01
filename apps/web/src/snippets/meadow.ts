import { environment, grass, sky, terrain } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/gameKit";

// The same meadow: 256 m of noise hills, sun and haze,
// 200 × 200 m of grass that sits on the hills and sways.
const world = environment({
  terrain: terrain({
    bounds: { w: 256, d: 256 },
    segments: 200,
    seed: "meadow",
    height: 8,
    frequency: 0.01,
    octaves: 4,
    colors: { low: "#3f7d2d", high: "#4f8a35" },
  }),
  sky: sky({ preset: "day", fog: { color: "#bfd8f0", near: 120, far: 900 } }),
  vegetation: [
    grass({
      area: { w: 200, d: 200 },
      // Every look knob is optional, grouped by the part of the field it shapes. These are a few of about forty.
      blade: { bladeHeight: 0.6, density: 0.85, curvature: 0.35 },
      season: { season: 0.1, dryness: 0 },
      species: { mixShare: 0.08 },
      flowers: { flowerShare: 0.05 },
      wind: { windStrength: 0.5 },
      colour: { baseColor: "#3f7d2d", tipColor: "#6bbf4a" },
    }),
  ],
});

// The player walks on the same hills the grass grows on.
export const game = defineGame({ name: "Meadow", world });
