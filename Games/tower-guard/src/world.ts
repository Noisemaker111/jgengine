import { environment, grass, type WorldFeature } from "@jgengine/core/world/features";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";

import { TERRAIN } from "./game/world/terrain";

export const world: WorldFeature = environment({
  terrain: TERRAIN,
  vegetation: grass({
    area: { w: 70, d: 70 },
    density: 3.5,
    colors: ["#33502a", "#6f9a45"],
    seed: "tower-guard",
  }),
});

export const physics: PhysicsConfig = { gravity: -20 };
