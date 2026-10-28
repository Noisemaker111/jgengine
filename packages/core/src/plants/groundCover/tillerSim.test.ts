import { describe, expect, test } from "bun:test";

import { GRASS_DEFAULTS } from "../../grass/grassKind";
import { GRASS_LIBRARY, LOLIUM_PERENNE, PHLEUM_PRATENSE, POA_PRATENSIS } from "./grassSpecies";
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
    expect(look.flowerShare).toBeGreaterThan(0.2);
    expect(look.bladeHeight).toBeGreaterThan(0.4);
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
    expect(shadedLook.density).toBeLessThan(openLook.density);
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
    const options = { species: GRASS_LIBRARY, cols: 3, rows: 3 };
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
