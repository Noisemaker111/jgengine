import { describe, expect, test } from "bun:test";

import { GRASS_DEFAULTS } from "../../grass/grassKind";
import { GRASS_LIBRARY, GROUND_COVER_LIBRARY, LEUCANTHEMUM_VULGARE, LOLIUM_PERENNE, PHLEUM_PRATENSE, POA_PRATENSIS, RHYTIDIADELPHUS_SQUARROSUS, TRIFOLIUM_REPENS } from "./groundCoverSpecies";
import { createTillerField, tillerCellLook, type TillerFieldSnapshot } from "./tillerSim";

const ALL = { col: 0, row: 0, cols: 99, rows: 99 };

/** Week 26 is the start of July: midsummer. */
const MIDSUMMER = 26;

describe("tiller field", () => {
  test("a lawn mown every two weeks stays dense and under 8 cm", () => {
    const field = createTillerField({ species: [LOLIUM_PERENNE, POA_PRATENSIS], cols: 2, rows: 2 });
    let tallest = 0;
    let densityInSummer = 0;
    for (let week = 0; week < 104; week += 1) {
      field.step();
      if (week % 2 === 1) field.mow(ALL, 0.04);
      if (week < 52) continue;
      tallest = Math.max(tallest, field.cell(0, 0).heightM);
      if (week === 52 + MIDSUMMER) densityInSummer = field.cell(0, 0).tillersPerM2;
    }
    expect(tallest).toBeLessThan(0.08);
    // Close-mown ryegrass and bluegrass turf carries 10 000 to 30 000 tillers per m².
    expect(densityInSummer).toBeGreaterThan(8000);
  });

  test("an unmown meadow flowers and tops 40 cm by midsummer", () => {
    const field = createTillerField({ species: [PHLEUM_PRATENSE, LOLIUM_PERENNE], cols: 1, rows: 1 });
    field.step(MIDSUMMER);
    const cell = field.cell(0, 0);
    expect(cell.heightM).toBeGreaterThan(0.4);
    expect(cell.cohorts.some((cohort) => cohort.inFlower)).toBe(true);
    const look = tillerCellLook(field, [PHLEUM_PRATENSE, LOLIUM_PERENNE], 0, 0, GRASS_DEFAULTS);
    expect(look.flowers.flowerShare).toBeGreaterThan(0.2);
    expect(look.blade.bladeHeight).toBeGreaterThan(0.4);
  });

  test("a meadow sets seed by late summer and its flowering tillers die", () => {
    const field = createTillerField({ species: [LOLIUM_PERENNE], cols: 1, rows: 1 });
    field.step(MIDSUMMER);
    const flowering = field.cell(0, 0).tillersPerM2;
    field.step(10);
    const cohort = field.cell(0, 0).cohorts[0];
    expect(cohort?.seeded).toBe(true);
    expect(field.cell(0, 0).tillersPerM2).toBeLessThan(flowering);
  });

  test("a trampled path drops more than 60% in density and recovers within two seasons", () => {
    const species = [LOLIUM_PERENNE, POA_PRATENSIS];
    const field = createTillerField({ species, cols: 9, rows: 3 });
    const path = { col: 0, row: 1, cols: 9, rows: 1 };
    const mownLawn = (week: number): void => {
      if (week % 2 === 1) field.mow(ALL, 0.05);
    };
    for (let week = 0; week < 52; week += 1) {
      field.step();
      mownLawn(week);
    }
    const before = field.cell(4, 1).tillersPerM2;
    for (let week = 52; week < 52 + 26; week += 1) {
      field.trample(path, 1);
      field.step();
      mownLawn(week);
    }
    const worn = field.cell(4, 1).tillersPerM2;
    expect(worn).toBeLessThan(0.4 * before);
    expect(field.cell(4, 0).tillersPerM2).toBeGreaterThan(0.8 * before);
    for (let week = 78; week < 78 + 104; week += 1) {
      field.step();
      mownLawn(week);
    }
    // Bluegrass rhizomes knit the path back to the density of the lawn beside it.
    expect(field.cell(4, 1).tillersPerM2).toBeGreaterThan(0.8 * field.cell(4, 0).tillersPerM2);
    expect(field.cell(4, 1).compaction).toBeLessThan(0.1);
  });

  test("grass under a closed canopy thins", () => {
    const field = createTillerField({ species: GRASS_LIBRARY, cols: 2, rows: 1 });
    field.setLight({ col: 1, row: 0 }, 0.1);
    field.step(52 + MIDSUMMER);
    const open = field.cell(0, 0);
    const shaded = field.cell(1, 0);
    expect(shaded.light).toBe(0.1);
    expect(shaded.tillersPerM2).toBeLessThan(0.5 * open.tillersPerM2);
    const openLook = tillerCellLook(field, GRASS_LIBRARY, 0, 0, GRASS_DEFAULTS);
    const shadedLook = tillerCellLook(field, GRASS_LIBRARY, 1, 0, GRASS_DEFAULTS);
    expect(shadedLook.blade.density).toBeLessThan(openLook.blade.density);
  });

  test("moss takes over a shaded lawn and stays sparse in sun", () => {
    const species = [LOLIUM_PERENNE, POA_PRATENSIS, TRIFOLIUM_REPENS, RHYTIDIADELPHUS_SQUARROSUS];
    const grow = (light: number) => {
      const field = createTillerField({ species, cols: 1, rows: 1 });
      field.setLight(ALL, light);
      for (let week = 0; week < 104 + MIDSUMMER; week += 1) {
        field.step();
        if (week % 2 === 1 && week % 52 > 12 && week % 52 < 44) field.mow(ALL, 0.04);
      }
      return field;
    };
    const sunny = grow(1).cell(0, 0).cohorts;
    const shaded = grow(0.15);
    const shadedCohorts = shaded.cell(0, 0).cohorts;
    const moss = (cohorts: typeof sunny) => cohorts[3]?.cover ?? 0;
    const sward = (cohorts: typeof sunny) => Math.max(...cohorts.slice(0, 3).map((cohort) => cohort.cover));
    expect(moss(sunny)).toBeLessThan(0.3);
    expect(moss(sunny)).toBeLessThan(sward(sunny));
    expect(moss(shadedCohorts)).toBeGreaterThan(0.7);
    expect(moss(shadedCohorts)).toBeGreaterThan(sward(shadedCohorts));
    expect(tillerCellLook(shaded, species, 0, 0, GRASS_DEFAULTS).colour.baseColor).toBe(RHYTIDIADELPHUS_SQUARROSUS.colors.leaf);
  });

  test("meadow daisies flower in June and their rosettes outlive the seed, while mowing keeps them flat", () => {
    const species = [PHLEUM_PRATENSE, LOLIUM_PERENNE, LEUCANTHEMUM_VULGARE];
    const meadow = createTillerField({ species, cols: 1, rows: 1 });
    meadow.step(52 + 20);
    let bloomWeek = -1;
    let rosettes = 0;
    let flowerColors = new Set<string>();
    for (let week = 52 + 20; week < 52 + 34; week += 1) {
      meadow.step();
      const daisy = meadow.cell(0, 0).cohorts[2];
      if (bloomWeek < 0 && daisy?.inFlower === true) {
        bloomWeek = week % 52;
        rosettes = daisy.tillersPerM2;
        const look = tillerCellLook(meadow, species, 0, 0, GRASS_DEFAULTS);
        flowerColors = new Set([look.flowers.flowerColor, look.flowers.flowerColor2]);
      }
    }
    // Late June to mid July.
    expect(bloomWeek).toBeGreaterThanOrEqual(23);
    expect(bloomWeek).toBeLessThanOrEqual(29);
    expect(flowerColors.has(LEUCANTHEMUM_VULGARE.colors.flower)).toBe(true);
    const after = meadow.cell(0, 0).cohorts;
    expect(after[2]?.seeded).toBe(true);
    expect(after[2]?.tillersPerM2).toBeGreaterThan(0.9 * rosettes);
    expect(after[1]?.seeded).toBe(true);

    const lawn = createTillerField({ species, cols: 1, rows: 1 });
    for (let week = 0; week < 52 + MIDSUMMER; week += 1) {
      lawn.step();
      if (week % 2 === 1) lawn.mow(ALL, 0.04);
    }
    const mown = lawn.cell(0, 0).cohorts[2];
    expect(mown?.inFlower).toBe(false);
    expect(mown?.cover).toBeGreaterThan(0.1);
  });

  test("grazing shortens the sward and a drier site grows less", () => {
    const grazed = createTillerField({ species: [LOLIUM_PERENNE], cols: 1, rows: 1 });
    const dry = createTillerField({ species: [LOLIUM_PERENNE], cols: 1, rows: 1 });
    const wet = createTillerField({ species: [LOLIUM_PERENNE], cols: 1, rows: 1 });
    dry.retune({ soilWater: 0.3 });
    for (let week = 0; week < 20; week += 1) {
      grazed.step();
      grazed.graze(ALL, 0.5);
      dry.step();
      wet.step();
    }
    expect(grazed.cell(0, 0).heightM).toBeLessThan(wet.cell(0, 0).heightM);
    expect(dry.cell(0, 0).heightM).toBeLessThan(wet.cell(0, 0).heightM);
  });

  test("snapshot, restore and reset replay the same field", () => {
    const options = { species: GROUND_COVER_LIBRARY, cols: 3, rows: 3 };
    const straight = createTillerField(options);
    straight.step(30);
    straight.trample({ col: 1, row: 0, rows: 3 }, 0.8);
    const snapshot: TillerFieldSnapshot = JSON.parse(JSON.stringify(straight.snapshot()));
    straight.step(30);
    const resumed = createTillerField(options);
    resumed.restore(snapshot);
    resumed.step(30);
    expect(resumed.week()).toBe(60);
    expect(resumed.cell(1, 1)).toEqual(straight.cell(1, 1));
    resumed.reset();
    expect(resumed.week()).toBe(0);
    expect(resumed.cell(1, 1)).toEqual(createTillerField(options).cell(1, 1));
  });
});
