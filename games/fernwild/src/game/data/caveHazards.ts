import type { VitalLink } from "@jgengine/core/stats/vitals";

/**
 * What a cave's air does to whoever stands in it: a shift to the temperature they feel, and vital rates a
 * second on top of their own. Each is an area that doses its occupants; the survivor's tick adds them in.
 */
export interface CaveHazard {
  label: string;
  warning: string;
  /** Degrees added to the ambient temperature inside. */
  temperatureC?: number;
  /** Per-second changes to the occupant's vitals. */
  rates?: readonly VitalLink[];
}

export const CAVE_HAZARDS: Readonly<Record<string, CaveHazard>> = {
  cave_swamp_cave: {
    label: "Swamp gas",
    warning: "Swamp gas: it burns your lungs. Get through fast.",
    rates: [
      { vital: "oxygen", rate: -5 },
      { vital: "health", rate: -0.5 },
    ],
  },
  cave_lava_cave: { label: "Searing heat", warning: "The air is searing. Drink, and do not linger.", temperatureC: 28 },
  cave_snow_cave: { label: "Bitter cold", warning: "Bitter cold. Wear furs or keep moving.", temperatureC: -30 },
};
