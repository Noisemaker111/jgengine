// The tree checks: read this before changing them or a tree record.
//
// Decision (2026-11-05): every tree species is held to the forestry tables with one envelope, the one
// `bun run jgengine plants fit --until-pass` fits into: stand-grown height within 15% of its Carmean or
// FIA curve and DBH within 25% of its FIA curve at 20, 50 and 100 years, crown width inside its Tallo
// band, alive, and open-grown individuals at 40 years keeping the crown kind of their form (fork,
// centroid, leaf shell, gaps) on at least two of three seeds (STAND_ENVELOPE, crownArchitecture.ts).
// There is no per-species band, slack table or skip set, and none is to be added: a record outside the
// envelope is refitted (`bun run background start -- bun run jgengine plants fit <id> --until-pass`,
// then `bun run jgengine plants write <id>`), and a look the fit cannot reach is a fit-search,
// fit-objective or growth-model change, where every species gets it. A species is never removed to
// make this file pass: the fix is the fit or the model, not the library.
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
// quercus-coccinea, pinus-taeda and pinus-contorta met the envelope; black ash, black cherry and black
// locust did not divide into a decurrent crown and #2959 removed them. That removal was wrong and was
// undone: their searches had only ever carried on near their own last best, in basins they could not
// leave (black cherry's crown sat at 29-34% of its height), while the fitted parameters of other
// shipped decurrent trees on their traits grew the right crown kind on the first trial. A new search
// now starts from whichever shipped tree of the same form misses least of these checks on the
// species, or from one named with --from (bestBasin in scripts/species-import/plantsCommand.ts), and
// a missed check costs the fit 100, above any trade of the fit-only terms (TEST_MISS_COST in
// speciesScore.ts, 10 before). Black ash and black locust passed from a new search around their own
// starts; black cherry passed from black oak's parameters (--from quercus-velutina) after its own,
// paper birch's and red oak's basins did not.
//
// Known limit, measured 2026-11-05: the crown kind holds on the three seeds checked here, not on most
// others. Over 12 other seeds the 23 shipped decurrent trees missed it on 3 to 12 (acer-rubrum,
// fagus-grandifolia, fraxinus-pennsylvanica and quercus-nigra on all 12), and over 24 the three
// restored ones on 16 to 20 of 24, in line with them: a tree divides on a few
// random codominant events, and the fit, scored on these seeds, fits their draws. Splitting a
// codominant stem's vigour beside the leader instead of as a lateral (plantGrowth.ts distributeVigour)
// thickened it from 0.2-0.4 to 0.45-0.73 of the leader but moved black ash only from 13 to 12 misses
// in 24 seeds. A reliable fork is a growth-model change and a refit of every decurrent tree, not a
// wider band here.
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
