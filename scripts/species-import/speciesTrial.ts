import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../../packages/core/src/plants/growth/plantEnvironment";
import { createPlantGrowth } from "../../packages/core/src/plants/growth/plantGrowth";
import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { crownRatio, PLANT_REGION } from "../../packages/core/src/plants/structure/plantStructure";
import { basalStemCount, HABIT_CHECK_AGES } from "../../packages/core/src/plants/species/habitReference";
import { REFERENCE_STAND } from "../../packages/core/src/plants/species/speciesReference";
import { crownProfile } from "../../packages/core/src/plants/validation/crownAllometry";
import { CROWN_ARCHITECTURE_AGE, CROWN_ARCHITECTURE_SEEDS, crownArchitecture, type CrownArchitecture } from "../../packages/core/src/plants/validation/crownArchitecture";

export interface TrialReading {
  age: number;
  heightM: number;
  dbhCm: number;
  crownWidthM: number;
  crownRatio: number;
  centroid: number;
  shoulder: number;
  leafAreaM2: number;
  stems: number;
  alive: boolean;
}

export interface Trial {
  open: TrialReading[][];
  architecture: CrownArchitecture[];
  stand: TrialReading[][];
  shadeLeafAreaM2: number[];
  shadeAlive: boolean[];
  deepShadeAlive: boolean[];
  ms: number;
}

export const TRIAL_AGES = [20, 50, 100] as const;

function grow(species: PlantSpecies, env: PlantEnvironment, seed: string, ages: readonly number[] = TRIAL_AGES): TrialReading[] {
  const plant = createPlantGrowth(species, env, seed, { individual: "typical" });
  const readings: TrialReading[] = [];
  for (const age of ages) {
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
      stems: basalStemCount(structure.segments, PLANT_REGION.deadwood),
      alive: stats.alive,
    });
    if (!stats.alive) break;
  }
  return readings;
}

export function runHabitTrial(species: PlantSpecies, seeds: readonly string[]): Trial {
  const started = performance.now();
  const open = seeds.map((seed) => grow(species, OPEN_TEMPERATE_SITE, seed, HABIT_CHECK_AGES));
  return { open, architecture: [], stand: [], shadeLeafAreaM2: [], shadeAlive: [], deepShadeAlive: [], ms: performance.now() - started };
}

function seededArchitecture(species: PlantSpecies): CrownArchitecture[] {
  return CROWN_ARCHITECTURE_SEEDS.map((seed) => {
    const plant = createPlantGrowth(species, OPEN_TEMPERATE_SITE, seed);
    plant.step(CROWN_ARCHITECTURE_AGE);
    return crownArchitecture(plant.structure());
  });
}

export function runTrial(species: PlantSpecies, seeds: readonly string[], shade: boolean): Trial {
  const started = performance.now();
  const open = seeds.map((seed) => grow(species, OPEN_TEMPERATE_SITE, seed));
  const architecture = species.architecture.crownForm === undefined ? [] : seededArchitecture(species);
  const stand = seeds.map((seed) => grow(species, REFERENCE_STAND, seed));
  const shadeLeafAreaM2: number[] = [];
  const shadeAlive: boolean[] = [];
  const deepShadeAlive: boolean[] = [];
  if (shade) {
    for (const seed of seeds) {
      const plant = createPlantGrowth(species, { ...OPEN_TEMPERATE_SITE, light: 0.2 }, seed, { individual: "typical" });
      plant.step(100);
      shadeLeafAreaM2.push(plant.stats().leafAreaM2);
      shadeAlive.push(plant.stats().alive);
      const deep = createPlantGrowth(species, { ...OPEN_TEMPERATE_SITE, light: 0.05 }, seed, { individual: "typical" });
      deep.step(15);
      deepShadeAlive.push(deep.stats().alive);
    }
  }
  return { open, architecture, stand, shadeLeafAreaM2, shadeAlive, deepShadeAlive, ms: performance.now() - started };
}
