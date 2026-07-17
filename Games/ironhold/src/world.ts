import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

/** The skirmish field — a flat 96×96 meadow between the two keeps. Kept a single ground plane so
 * units read clearly from the RTS camera; cover and gold are authored props in the scene. */
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({ bounds: { w: 96, d: 96 }, height: 0, material: "grass" }),
  sky: sky({ preset: "day" }),
  vegetation: grass({ area: { w: 92, d: 92 }, density: 2, colors: ["#3f7d2d", "#5aa83c", "#6bbf4a"], seed: "ironhold" }),
});

export const physics: PhysicsConfig = { gravity: -24 };
