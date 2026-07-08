import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { flat, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = flat();

export const physics: PhysicsConfig = { gravity: -24 };
