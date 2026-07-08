import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, terrain } from "@jgengine/core/world/features";

import { BOARD_EXTENT } from "./game/board";

export const world = environment({
  terrain: terrain({
    bounds: { w: BOARD_EXTENT, d: BOARD_EXTENT },
    height: 0.16,
    frequency: 0.05,
    seed: "grid-tactics-outpost",
  }),
  vegetation: grass({
    area: { w: BOARD_EXTENT, d: BOARD_EXTENT },
    density: 1.4,
    bladeHeight: [0.16, 0.4],
    bladeWidth: 0.035,
    windStrength: 0.3,
    colors: ["#37472f", "#5b6e46"],
  }),
});

export const physics: PhysicsConfig = { gravity: 0 };
