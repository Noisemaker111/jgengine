import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../../packages/core/src/plants/growth/plantEnvironment";
import { createPlantGrowth } from "../../packages/core/src/plants/growth/plantGrowth";
import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { crownRatio } from "../../packages/core/src/plants/structure/plantStructure";
import { REFERENCE_STAND } from "../../packages/core/src/plants/species/speciesReference";
import { crownProfile } from "../../packages/core/src/plants/validation/crownAllometry";

/** One reading of a grown plant at an age. */
export interface TrialReading {
  age: number;
  heightM: number;
  dbhCm: number;
  crownWidthM: number;
  crownRatio: number;
  centroid: number;
  shoulder: number;
  leafAreaM2: number;
  alive: boolean;
}

/** Open-grown and stand-grown runs of one species per seed, and a shaded sapling run. */
export interface Trial {
  open: TrialReading[][];
  stand: TrialReading[][];
  shadeLeafAreaM2: number[];
  shadeAlive: boolean[];
  ms: number;
}

export const TRIAL_AGES = [20, 50, 100] as const;

function grow(species: PlantSpecies, env: PlantEnvironment, seed: string): TrialReading[] {
  const plant = createPlantGrowth(species, env, seed);
  const readings: TrialReading[] = [];
  for (const age of TRIAL_AGES) {
    plant.step(age - plant.ageYears());
    const structure = plant.structure();
    const stats = plant.stats();
    readings.push({
      age,
      heightM: structure.stats.heightM,
      dbhCm: structure.stats.dbhCm,
      crownWidthM: 2 * structure.stats.crownRadiusM,
      crownRatio: crownRatio(structure),
      ...crownProfile(structure),
      leafAreaM2: stats.leafAreaM2,
      alive: stats.alive,
    });
    if (!stats.alive) break;
  }
  return readings;
}

/** Grow `species` open, in a stand and (when `shade`) under 0.2 light, once per seed. */
export function runTrial(species: PlantSpecies, seeds: readonly string[], shade: boolean): Trial {
  const started = performance.now();
  const open = seeds.map((seed) => grow(species, OPEN_TEMPERATE_SITE, seed));
  const stand = seeds.map((seed) => grow(species, REFERENCE_STAND, seed));
  const shadeLeafAreaM2: number[] = [];
  const shadeAlive: boolean[] = [];
  if (shade) {
    for (const seed of seeds) {
      const plant = createPlantGrowth(species, { ...OPEN_TEMPERATE_SITE, light: 0.2 }, seed);
      plant.step(100);
      shadeLeafAreaM2.push(plant.stats().leafAreaM2);
      shadeAlive.push(plant.stats().alive);
    }
  }
  return { open, stand, shadeLeafAreaM2, shadeAlive, ms: performance.now() - started };
}
