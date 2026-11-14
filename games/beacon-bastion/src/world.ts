import { environment, sky, type WorldFeature } from "@jgengine/core/world/features";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";

import { CLEARINGS, TERRAIN_SCULPT } from "./editorLayers";
import { TERRAIN } from "./game/world/terrain";

/** The live map's ground: the base terrain, that map's authored sculpt and its gameplay clearings. */
function buildWorld(): WorldFeature {
  return environment({
    terrain: TERRAIN,
    // Authored relief layered over the base terrain — same snapshot the editor edits.
    sculpt: TERRAIN_SCULPT,
    // Level footing under the plots and spawns without flattening the draped streets.
    clearings: CLEARINGS,
    // A clear sky with a soft horizon haze; colours, sun and haze come from the game's `mood`.
    sky: sky({ preset: "day", hazeStrength: 0.4, sunGlowStrength: 1.2, radius: 240 }),
  });
}

/** A live binding: `rebindWorld` rebuilds it when the scene set switches maps. */
export let world: WorldFeature = buildWorld();

export function rebindWorld(): void {
  world = buildWorld();
}

export const physics: PhysicsConfig = { gravity: -20 };
