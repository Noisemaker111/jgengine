// The tree checks: read this before changing them or a tree record.
//
// Decision (2026-11-05): every tree species is held to the forestry tables with one envelope, the one
// `bun run jgengine plants fit --until-pass` fits into: stand-grown height within 15% of its Carmean or
// FIA curve and DBH within 25% of its FIA curve at 20, 50 and 100 years, crown width inside its Tallo
// band, alive, and open-grown individuals at 40 years keeping the crown kind of their form (fork,
// centroid, leaf shell, gaps) on at least two of three seeds (STAND_ENVELOPE, crownArchitecture.ts).
// There is no per-species band, slack table or skip set, and none is to be added: a record outside the
// envelope is refitted (`bun run background start -- bun run jgengine plants fit <id> --until-pass`,
// then `bun run jgengine plants write <id>`); a look the fit cannot reach is a fit-objective or
// growth-model change, where every species gets it; and a species neither reaches is not shipped (its
// data file is deleted, its traits stay in scripts/species-import/speciesTraits.ts, and the same fit and
// write bring it back once it meets the envelope). An unshipped species beats an implausible one.
//
// Why these numbers: the fit's own pass limits have been 15% height and 25% DBH since the fit existed,
// and measured on 2026-11-05 every one of the 53 tree records was within 14% of its height at every
// age, 46 of 53 within 25% of DBH, 47 of 53 inside the Tallo band, 50 of 53 with at most one seed off
// its crown kind. Height is what a player reads at a glance; DBH 25% off is a trunk a quarter thinner
// than the forest it imitates and is where the plausibility of a close-up ends; the Tallo band is the
// 10th to 90th percentile of measured crowns, so a crown outside it is one a forester would not find.
// A wider envelope would have passed the seven records that failed (acer-saccharum, fraxinus-nigra,
// prunus-serotina, quercus-coccinea, robinia-pseudoacacia, pinus-taeda, pinus-contorta): those are
// exactly the seven that #2921 kept on a per-species list, so widening it would have been that list
// again under one name. They were refitted instead (2 h 56 min, 40 generations each): acer-saccharum,
// quercus-coccinea, pinus-taeda and pinus-contorta now meet the envelope; fraxinus-nigra,
// prunus-serotina and robinia-pseudoacacia met the stand tables but, after 40 more generations from a
// wider search, still did not divide into a decurrent crown on two of three seeds (black ash forks at
// 73-78% of its height, black cherry carries its crown at 30-33%, black locust's crown is 45-57% gaps),
// so they left the library, as eastern redcedar did when the fit could not hold its column.
//
// How this file got here: #2919 (2026-11-03) swapped 27 species back to older growth numbers because
// they rendered fuller crowns, and loosened this test to 25% height, 45% DBH, 0.75x to 1.3x Tallo
// with the crown-kind check skipped for 28 species. #2921 (the same day) measured those records 25-43%
// thinner than FIA with cone-shaped or unforked crowns, put 21 back inside the strict bands, and kept
// seven on a per-species slack table "pending Jon". #2933 (2026-11-04) deleted every forestry-table
// comparison in the tree tests, leaving only the finite-mesh check below, with the records unchanged.
// Three changes of the same check in one day, each chosen for a few species by eye, is the failure this
// header exists to stop: the check is one envelope, the fit meets it, and the look is the fit's job.
import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE } from "../../growth/plantEnvironment";
import { createPlantGrowth } from "../../growth/plantGrowth";
import { CROWN_ARCHITECTURE_AGE, CROWN_ARCHITECTURE_MISSES_ALLOWED, CROWN_ARCHITECTURE_SEEDS, crownArchitecture, crownArchitectureMisses, crownArchitectureTarget } from "../../validation/crownArchitecture";
import { PLANT_LIBRARY } from "./plantLibrary";
import type { PlantSpecies } from "../plantSpecies";
import { crownWidthBandM, REFERENCE_STAND, STAND_ENVELOPE, standDbhAtCm, standHeightAtM } from "../speciesReference";
import { SPECIES_REFERENCE } from "../speciesReferenceTable";

function checkTree(species: PlantSpecies): void {
  const { heightShare, dbhShare, ages } = STAND_ENVELOPE;
  test(`${species.id}: a stand-grown tree is alive, within ${heightShare * 100}% of its height and ${dbhShare * 100}% of its DBH and inside the Tallo crown band at ${ages.join(", ")} years`, () => {
    const reference = SPECIES_REFERENCE[species.id];
    if (reference === undefined) throw new Error(`no reference for ${species.id}: run bun run jgengine plants import`);
    const plant = createPlantGrowth(species, REFERENCE_STAND, "a", { individual: "typical" });
    for (const age of ages) {
      plant.step(age - plant.ageYears());
      const { heightM, dbhCm, crownRadiusM } = plant.structure().stats;
      expect(plant.stats().alive, `${age} y alive`).toBe(true);
      expect(Math.abs(heightM / standHeightAtM(reference, age) - 1), `${age} y height ${heightM.toFixed(1)} m`).toBeLessThan(heightShare);
      expect(Math.abs(dbhCm / standDbhAtCm(reference, age) - 1), `${age} y DBH ${dbhCm.toFixed(1)} cm`).toBeLessThan(dbhShare);
      const band = crownWidthBandM(reference, dbhCm);
      if (band === null) throw new Error(`no Tallo record for ${species.id}`);
      expect(2 * crownRadiusM, `${age} y crown width`).toBeGreaterThanOrEqual(band.lowM);
      expect(2 * crownRadiusM, `${age} y crown width`).toBeLessThanOrEqual(band.highM);
    }
  }, 60_000);

  test(`${species.id}: open-grown ${species.architecture.crownForm ?? "tree"} individuals at ${CROWN_ARCHITECTURE_AGE} years keep its crown kind (fork, shape, openness, leaf shell) on all but ${CROWN_ARCHITECTURE_MISSES_ALLOWED} of ${CROWN_ARCHITECTURE_SEEDS.length} seeds`, () => {
    expect(species.architecture.crownForm, "crown form").toBeDefined();
    const target = crownArchitectureTarget(species);
    const misses: string[] = [];
    for (const seed of CROWN_ARCHITECTURE_SEEDS) {
      const plant = createPlantGrowth(species, OPEN_TEMPERATE_SITE, seed);
      plant.step(CROWN_ARCHITECTURE_AGE);
      const missed = crownArchitectureMisses(target, crownArchitecture(plant.structure()));
      if (missed.length > 0) misses.push(`seed ${seed}: ${missed.join(", ")}`);
    }
    expect(misses.length, misses.join("\n")).toBeLessThanOrEqual(CROWN_ARCHITECTURE_MISSES_ALLOWED);
  }, 60_000);
}

describe("tree envelope", () => {
  for (const species of PLANT_LIBRARY) if (species.habit === "tree") checkTree(species);
});
