import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";

// World footprint and ground clearings come from the authored scene document, not hardcoded
// coordinates — the only content this file carries is engine tuning (relief, seed, sky). See #1018.
const content = environmentContentFromDocument(editorLayers, { minBounds: { w: 900, d: 900 } });

/**
 * Dramatic designed relief so the city districts read as real geography: rolling hills, a deep
 * river canyon cutting diagonally across the south, and damped flats under the original studio
 * yard (origin) and the downtown grid — cities climb the hills, avoid the cliff walls, and the
 * canyon-rim district builds down to the water.
 */
function relief(x: number, z: number): number {
  const hills = 12 * Math.sin(x * 0.011) * Math.cos(z * 0.009) + 5 * Math.sin(x * 0.027 + 1.7) * Math.sin(z * 0.021 + 0.4) + 13;
  const canyonAxis = z + 150 - 0.3 * x;
  const canyon = -26 * Math.exp(-(canyonAxis * canyonAxis) / (2 * 48 * 48));
  const flatYard = Math.exp(-(x * x + z * z) / (2 * 110 * 110));
  const flatDowntown = Math.exp(-((x + 190) * (x + 190) + (z - 270) * (z - 270)) / (2 * 150 * 150));
  return (hills + canyon) * (1 - 0.92 * flatYard - 0.75 * flatDowntown);
}

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: content.bounds,
    height: 26,
    heightField: relief,
    waterLevel: -3.5,
    // Sandy low ground so shorelines read as beach/riverbed, not flooded lawn.
    colors: { low: "#8f7f58", high: "#7f8b50", waterline: "#4b6d4e" },
    seed: "studio-showcase",
  }),
  clearings: content.clearings,
  ...(content.sculpt === undefined ? {} : { sculpt: content.sculpt }),
  sky: sky({
    preset: "day",
    // The city districts span hundreds of meters; the default 260m fog would swallow them whole.
    fog: { near: 500, far: 2500 },
    volumetricClouds: {
      coverage: 0.4,
      density: 1.6,
      height: 110,
      thickness: 58,
      speed: 1.1,
      scale: 140,
      sunScatter: 0.95,
      seed: "showcase-clouds",
    },
  }),
});

export const physics: PhysicsConfig = { gravity: -30 };
