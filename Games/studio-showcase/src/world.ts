import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";

// World footprint and ground clearings come from the authored scene document, not hardcoded
// coordinates — the only content this file carries is engine tuning (relief, seed, sky). See #1018.
const content = environmentContentFromDocument(editorLayers, { minBounds: { w: 160, d: 160 } });

/** Gentle textured ground so the studios read against a real world, not a flat void. */
export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: content.bounds,
    height: 2.2,
    frequency: 0.02,
    seed: "studio-showcase",
  }),
  clearings: content.clearings,
  ...(content.sculpt === undefined ? {} : { sculpt: content.sculpt }),
  sky: sky({
    preset: "day",
    volumetricClouds: {
      coverage: 0.4,
      density: 1.6,
      height: 82,
      thickness: 58,
      speed: 1.1,
      scale: 140,
      sunScatter: 0.95,
      seed: "showcase-clouds",
    },
  }),
});

export const physics: PhysicsConfig = { gravity: -30 };
