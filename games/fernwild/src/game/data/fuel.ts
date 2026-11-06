import { createDoseTable } from "@jgengine/core/stats/doseTable";
import type { VitalDose } from "@jgengine/core/stats/vitals";

const burns = (seconds: number): readonly VitalDose[] => [{ vital: "fuel", amount: seconds }];

/**
 * What each fuel gives a station that burns, in seconds of burning, in the order it is reached for (ARK's
 * campfire and cooking pot: wood lasts longest, thatch is kindling; seconds approx). A station with a row
 * here burns: its fire is a fuel meter that drains a second a second, and while it is empty the station
 * cooks nothing and warms nobody.
 */
export const FUEL = createDoseTable({
  campfire: { wood: burns(30), thatch: burns(7.5), sparkpowder: burns(60) },
  cooking_pot: { wood: burns(30), thatch: burns(7.5), sparkpowder: burns(60) },
});

/** The most fuel a fire holds, seconds. */
export const FUEL_MAX = 3600;
