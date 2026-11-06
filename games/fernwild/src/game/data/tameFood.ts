import { createDoseTable } from "@jgengine/core/stats/doseTable";
import type { VitalDose } from "@jgengine/core/stats/vitals";

const meal = (food: number): readonly VitalDose[] => [{ vital: "food", amount: food }];

/**
 * What a tame's food meter gains from each item it eats from its own inventory, by diet, most preferred
 * first (ARK: meat 50, berries 20 to 30; approximate). The same dose table shape as a taming diet.
 */
export const TAME_DIET = createDoseTable({
  carnivore: { raw_prime_meat: meal(50), raw_meat: meal(50), cooked_meat: meal(50) },
  herbivore: { mejoberry: meal(30), amarberry: meal(20), azulberry: meal(20), tintoberry: meal(20) },
});

/** A grown tame empties a full food meter in about three hours (approximate; ARK's rate is per species). */
export const TAME_FOOD_DRAIN_SECONDS = 10_800;
/**
 * A baby eats faster while small: ARK's FoodPerSec = R x (1 - maturation), on top of the grown rate. R here
 * empties a newborn's full food in about 40 minutes (approximate). A newborn starts with a tenth.
 */
export const BABY_FOOD_DRAIN_SECONDS = 2400;
export const NEWBORN_FOOD = 0.1;
/** A starving tame loses this share of its max health a second (approximate). */
export const STARVE_HEALTH_SHARE = 0.01;
