import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { flat, type WorldFeature } from "@jgengine/core/world/features";

import { generateArchipelago } from "./game/world/archipelago";
import { buildCourses } from "./game/world/courses";
import { GRAVITY } from "./game/physics/constants";

export const ARCHIPELAGO_SEED = "skyhook-rally-dawn-run";

/**
 * `environment()`'s `terrain()` is one continuous heightfield with a single
 * waterline — it cannot host 18 disconnected floating islands at independent
 * altitudes with void between them. The archipelago is game-owned data
 * (`game/world/archipelago.ts`) rendered entirely by a custom `environment`
 * canvas component, so the declared world kind here is `flat()` — a plain
 * arena with no built-in ground the custom renderer would have to fight.
 */
export const world: WorldFeature = flat();
export const physics: PhysicsConfig = { gravity: GRAVITY };

export const archipelago = generateArchipelago(ARCHIPELAGO_SEED);
export const courses = buildCourses(archipelago);
