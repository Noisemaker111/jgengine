import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { sky, terrain } from "@jgengine/core/world/features";
import { environment } from "@jgengine/shell/gameKit";

export const physics: PhysicsConfig = { gravity: -24 };

export const world = environment({
  terrain: terrain({
    bounds: { w: 600, d: 600 },
    height: 14,
    seed: "flight-lab",
    colors: { low: "#5d7a3a", high: "#c8e6a0", waterline: "#7a8a5a" },
    detail: { detailScale: 3.2, macroScale: 64, strength: 0.85, rockSlopeStart: 0.45 },
    segments: 128,
    flatten: [
      { center: [0, 0], radius: 55, falloff: 22 },
      { center: [0, -120], radius: 22, falloff: 14 },
      { center: [0, 120], radius: 22, falloff: 14 },
    ],
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#a6c6e0",
    zenithColor: "#5f83b8",
    sunIntensity: 1.35,
    ambientIntensity: 1.05,
    fog: { color: "#a6c6e0", near: 280, far: 900 },
  }),
});
