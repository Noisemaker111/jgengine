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
  },
  "cocos-nucifera": {
    "speciesId": "cocos-nucifera",
    "usda": "CONU",
    "heightAt20M": 18.29,
    "matureHeightM": 18.29,
    "multiStem": false,
    "growthRate": "Moderate"
  },
  "sabal-palmetto": {
    "speciesId": "sabal-palmetto",
    "usda": "SAPA",
    "heightAt20M": 4.57,
    "matureHeightM": 27.43,
    "multiStem": false,
    "growthRate": "Slow"
  },
  "cibotium-glaucum": {
    "speciesId": "cibotium-glaucum",
    "usda": "CIGL",
    "heightAt20M": 3.66,
    "matureHeightM": 2.44,
    "multiStem": false,
    "growthRate": "Slow"
  },
  "pteridium-aquilinum": {
    "speciesId": "pteridium-aquilinum",
    "usda": "PTAQ",
    "heightAt20M": null,
    "matureHeightM": 2.01,
    "multiStem": false,
    "growthRate": "Moderate"
  },
  "polystichum-munitum": {
    "speciesId": "polystichum-munitum",
    "usda": "POMU",
    "heightAt20M": null,
    "matureHeightM": 1.07,
    "multiStem": false,
    "growthRate": "Moderate"
  }
};
