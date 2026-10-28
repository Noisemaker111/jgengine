import { describe, expect, test } from "bun:test";
import { createFireLandscape, type CanopyStand, type FireLandscape, type FireWeather } from "./fireLandscape";
import { M_PER_FT, MOISTURE_SCENARIOS, NON_BURNABLE_FUEL_MODELS, SCOTT_BURGAN_FUEL_MODELS, type FuelModel, type FuelMoisture } from "./fuelModels";
import { MPS_PER_MPH, surfaceFuelbed, surfaceSpread } from "./surfaceFire";
import { windAdjustmentFactor } from "./windAdjustment";

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture");
  return value;
}

const GR2 = need(SCOTT_BURGAN_FUEL_MODELS["GR2"]);
const GS4 = need(SCOTT_BURGAN_FUEL_MODELS["GS4"]);
const TU5 = need(SCOTT_BURGAN_FUEL_MODELS["TU5"]);
const NB9 = need(NON_BURNABLE_FUEL_MODELS["NB9"]);
const D1L1 = need(MOISTURE_SCENARIOS["D1L1"]);
const D2L2 = need(MOISTURE_SCENARIOS["D2L2"]);

function weather(wind: number, moisture: FuelMoisture = D2L2, direction = 0): FireWeather {
  return { twentyFootWind: wind, windDirection: direction, airTemperatureC: 25, moisture };
}

function uniform(cols: number, rows: number, cellSize: number, fuel: FuelModel, stencil: 8 | 16 | 32, extra: Partial<Parameters<typeof createFireLandscape>[0]> = {}): FireLandscape {
  return createFireLandscape({ cols, rows, cellSize, fuels: [fuel, NB9], fuel: new Uint8Array(cols * rows), seed: "test", tuning: { stencil, spotting: false }, ...extra });
}

function run(fire: FireLandscape, seconds: number, w: FireWeather, dt = 30): void {
  for (let t = 0; t < seconds; t += dt) fire.step(Math.min(dt, seconds - t), w);
}

/** Farthest burnt cell centre from the ignition centre along +x, −x, +z. */
function extents(fire: FireLandscape, col: number, row: number): { head: number; back: number; width: number; area: number } {
  const { arrival } = fire.layers;
  const t = fire.time;
  let head = 0;
  let back = 0;
  let area = 0;
  let width = 0;
  for (let r = 0; r < fire.rows; r++) {
    for (let c = 0; c < fire.cols; c++) {
      if ((arrival[r * fire.cols + c] ?? Infinity) > t) continue;
      area += fire.cellSize * fire.cellSize;
      if (r === row) {
        head = Math.max(head, (c - col) * fire.cellSize);
        back = Math.max(back, (col - c) * fire.cellSize);
      }
      width = Math.max(width, Math.abs(r - row) * fire.cellSize);
    }
  }
  return { head, back, width, area };
}

describe("fire growth against the analytic ellipse (flat, uniform fuel, steady wind)", () => {
  const wind = 6;
  const waf = windAdjustmentFactor(GR2.depthM);
  const spread = surfaceSpread(surfaceFuelbed(GR2, D2L2), { midflameWind: wind * waf, windAngle: 0, slope: 0 });
  const seconds = 600;

  for (const [stencil, shapeTolerance, areaTolerance] of [
    [16, 0.03, 0.025],
    [32, 0.02, 0.015],
  ] as const) {
    test(`${stencil}-direction stencil: head and back within one cell, width within ${shapeTolerance * 100} %, area within ${areaTolerance * 100} %`, () => {
      const cell = 2;
      const fire = uniform(320, 160, cell, GR2, stencil);
      fire.ignite(40, 80);
      run(fire, seconds, weather(wind));
      const got = extents(fire, 40, 80);
      const head = spread.headRate * seconds;
      const back = spread.backingRate * seconds;
      const halfWidth = spread.flankingRate * seconds;
      const area = Math.PI * halfWidth * ((spread.headRate + spread.backingRate) / 2) * seconds;
      expect(Math.abs(got.head - head)).toBeLessThan(cell * 1.01);
      expect(Math.abs(got.back - back)).toBeLessThan(cell * 1.01);
      expect(Math.abs(got.width - halfWidth) / halfWidth).toBeLessThan(shapeTolerance + cell / halfWidth);
      expect(Math.abs(got.area - area) / area).toBeLessThan(areaTolerance);
    });
  }

  test("no wind and no slope grows a circle at the no-wind rate, area within 2 %", () => {
    const r0Rate = surfaceFuelbed(GR2, D2L2).noWindNoSlopeRate;
    const seconds = 50 / r0Rate;
    const fire = uniform(121, 121, 1, GR2, 16);
    fire.ignite(60, 60);
    run(fire, seconds, weather(0), seconds / 20);
    const r0 = r0Rate * seconds;
    const got = extents(fire, 60, 60);
    expect(Math.abs(got.head - r0)).toBeLessThan(1.01);
    expect(Math.abs(got.back - r0)).toBeLessThan(1.01);
    expect(Math.abs(got.area - Math.PI * r0 * r0) / (Math.PI * r0 * r0)).toBeLessThan(0.02);
  });
});

describe("a published case: BehavePlus fire size", () => {
  test("GS4, 5 mph midflame wind, flat: 55.283555 acres after one hour, within 1.5 %", () => {
    const moisture: FuelMoisture = { oneHour: 0.06, tenHour: 0.07, hundredHour: 0.08, liveHerb: 0.6, liveWoody: 0.9 };
    const waf = windAdjustmentFactor(GS4.depthM);
    const fire = uniform(260, 110, 4, GS4, 32);
    fire.ignite(30, 55);
    run(fire, 3600, weather((5 * MPS_PER_MPH) / waf, moisture), 60);
    const acres = extents(fire, 30, 55).area / 4046.8564224;
    expect(Math.abs(acres - 55.283555) / 55.283555).toBeLessThan(0.015);
  });
});

describe("landscape behaviour", () => {
  test("a non-burnable line stops the fire, even on the 32-direction stencil", () => {
    const fire = uniform(80, 40, 2, GR2, 32);
    for (let r = 0; r < 40; r++) fire.setFuel(40, r, 1);
    fire.ignite(10, 20);
    run(fire, 3600, weather(8, D1L1));
    for (let r = 0; r < 40; r++) for (let c = 41; c < 80; c++) expect(fire.cell(c, r).state).toBe("unburnt");
  });

  test("fire runs faster upslope than down", () => {
    const cols = 101;
    const rows = 41;
    const elevation = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = c * 2 * 0.5;
    const fire = uniform(cols, rows, 2, GR2, 16, { elevation });
    fire.ignite(50, 20);
    run(fire, 240, weather(0));
    const got = extents(fire, 50, 20);
    expect(got.head).toBeGreaterThan(got.back * 2);
  });

  test("a dry, windy timber understory crowns and lofts embers that start spot fires", () => {
    const canopy: CanopyStand = { cover: 0.7, heightM: 18, baseHeightM: 2, bulkDensity: 0.2, foliarMoisture: 0.9 };
    const cols = 200;
    const rows = 60;
    const fire = createFireLandscape({
      cols,
      rows,
      cellSize: 5,
      fuels: [TU5],
      fuel: new Uint8Array(cols * rows),
      canopies: [canopy],
      canopy: new Uint8Array(cols * rows),
      seed: "embers",
      tuning: { stencil: 16 },
    });
    fire.ignite(10, 30);
    run(fire, 1800, weather(12, D1L1), 30);
    let crowned = 0;
    let spots = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = fire.cell(c, r);
        if (cell.kind === "crowning") crowned++;
        if (cell.spotted) spots++;
      }
    }
    expect(crowned).toBeGreaterThan(0);
    expect(spots).toBeGreaterThan(0);
  });

  test("cells flame, smoulder and burn out, leaving char and ash", () => {
    const fire = uniform(40, 40, 2, need(SCOTT_BURGAN_FUEL_MODELS["TL5"]), 16);
    fire.ignite(20, 20);
    fire.step(1, weather(2, D1L1));
    expect(fire.cell(20, 20).state).toBe("flaming");
    run(fire, 7200, weather(2, D1L1), 60);
    const cell = fire.cell(20, 20);
    expect(cell.state).toBe("burnt");
    expect(cell.char).toBeGreaterThan(0.5);
    expect(cell.ash).toBeGreaterThan(0);
    expect(cell.fuelLeft).toBeLessThan(0.5);
  });

  test("wet fuel does not catch, even when lit", () => {
    const fire = uniform(20, 20, 2, GR2, 16);
    fire.ignite(10, 10);
    run(fire, 600, weather(5, { oneHour: 0.4, tenHour: 0.4, hundredHour: 0.4, liveHerb: 2, liveWoody: 2 }));
    expect(fire.burnedArea()).toBe(0);
  });

  test("an extinguished cell stops burning and keeps the fuel it had not yet consumed", () => {
    const fire = uniform(20, 20, 2, need(SCOTT_BURGAN_FUEL_MODELS["TL5"]), 16);
    fire.ignite(10, 10);
    fire.step(5, weather(0, D1L1));
    expect(fire.extinguish(10, 10)).toBe(true);
    const cell = fire.cell(10, 10);
    expect(cell.state).toBe("burnt");
    expect(cell.fuelLeft).toBeGreaterThan(0.5 * (cell.fuelLeft + cell.ash / 0.0555));
    expect(fire.extinguish(10, 10)).toBe(false);
  });

  test("same seed, same fire; snapshot and restore resume it exactly", () => {
    const make = (): FireLandscape => {
      const canopy: CanopyStand = { cover: 0.7, heightM: 18, baseHeightM: 2, bulkDensity: 0.2, foliarMoisture: 0.9 };
      return createFireLandscape({ cols: 80, rows: 40, cellSize: 5, fuels: [TU5], fuel: new Uint8Array(3200), canopies: [canopy], canopy: new Uint8Array(3200), seed: 7 });
    };
    const a = make();
    const b = make();
    a.ignite(5, 20);
    b.ignite(5, 20);
    run(a, 600, weather(12, D1L1));
    run(b, 300, weather(12, D1L1));
    const saved = JSON.parse(JSON.stringify(b.snapshot()));
    const c = make();
    c.restore(saved);
    run(b, 300, weather(12, D1L1));
    run(c, 300, weather(12, D1L1));
    expect([...b.layers.arrival]).toEqual([...a.layers.arrival]);
    expect([...c.layers.arrival]).toEqual([...a.layers.arrival]);
    expect([...c.layers.ash]).toEqual([...a.layers.ash]);
    a.reset();
    expect(a.burnedArea()).toBe(0);
    expect(a.time).toBe(0);
  });

  test("the event budget bounds a step and the fire catches up later", () => {
    const fire = uniform(100, 100, 1, GR2, 8);
    fire.retune({ maxEventsPerStep: 50 });
    fire.ignite(50, 50);
    const stats = fire.step(600, weather(4, D1L1));
    expect(stats.ignitions).toBeLessThanOrEqual(50);
    expect(stats.budgetHit).toBe(true);
    fire.retune({ maxEventsPerStep: 1_000_000 });
    fire.step(0, weather(4, D1L1));
    expect(fire.burnedArea()).toBeGreaterThan(50);
  });

  test("feet and metres agree: the BehavePlus wind adjustment is unit-safe", () => {
    expect(windAdjustmentFactor(1 * M_PER_FT)).toBeCloseTo(1.83 / Math.log(20.36 / 0.13), 12);
  });
});
