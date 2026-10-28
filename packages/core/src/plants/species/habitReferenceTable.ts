import type { HabitReference } from "./habitReference";

/**
 * USDA PLANTS heights and growth form of every shrub, palm, fern and herb in the library. Written by
 * `bun run jgengine plants import`; do not edit by hand.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const HABIT_REFERENCE: Readonly<Record<string, HabitReference>> = {
  "vaccinium-corymbosum": {
    "speciesId": "vaccinium-corymbosum",
    "usda": "VACO",
    "heightAt20M": 3.66,
    "matureHeightM": 3.66,
    "multiStem": true,
    "growthRate": "Moderate"
  }
};
