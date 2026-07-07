import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { biomes, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = biomes({
  map: "world/biomes",
  zones: "world/zones",
  bounds: { w: 2048, d: 2048 },
});

export const physics: PhysicsConfig = { gravity: -32 };
