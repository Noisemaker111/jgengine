import { environment, grass, sky, type WorldFeature } from "@jgengine/core/world/features";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";

import { TERRAIN_SCULPT } from "./editorLayers";
import { TERRAIN } from "./game/world/terrain";

export const world: WorldFeature = environment({
  terrain: TERRAIN,
  // Authored perimeter mounds layered over the base terrain — same snapshot the editor edits.
  sculpt: TERRAIN_SCULPT,
  sky: sky({ preset: "day", horizonColor: "#d8e8c4", zenithColor: "#5fa0d0" }),
  vegetation: grass({
    area: { w: 70, d: 70 },
    density: 3.5,
    colors: ["#33502a", "#6f9a45"],
    seed: "tower-guard",
  }),
});

export const physics: PhysicsConfig = { gravity: -20 };
