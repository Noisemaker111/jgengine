import { describe, expect, test } from "bun:test";

import {
  createFireGrid,
  resolveWeather,
  type WeatherModifierTable,
  type WeatherState,
} from "./weather";

const table: WeatherModifierTable = {
  clear: {},
  rain: { grip: 0.6, visibility: 0.7, spread: 0.3, chill: -4 },
  storm: { grip: 0.4, visibility: 0.4, structureDamage: 5, ignition: 0.2, spread: 0.2 },
};

describe("resolveWeather", () => {
  test("clear weather is neutral", () => {
    const out = resolveWeather({ kind: "clear", intensity: 1 }, table);
    expect(out).toEqual({ grip: 1, visibility: 1, structureDamage: 0, chill: 0, ignition: 0, spread: 1 });
  });

  test("multipliers interpolate from neutral by intensity (Grounded mud)", () => {
    const half = resolveWeather({ kind: "rain", intensity: 0.5 }, table);
    expect(half.grip).toBeCloseTo(0.8, 5);
    expect(half.visibility).toBeCloseTo(0.85, 5);
    expect(half.spread).toBeCloseTo(0.65, 5);
  });

  test("rate effects scale linearly (Icarus storm damage)", () => {
    const full = resolveWeather({ kind: "storm", intensity: 1 }, table);
    expect(full.structureDamage).toBe(5);
    expect(full.ignition).toBeCloseTo(0.2, 5);
    const quarter = resolveWeather({ kind: "storm", intensity: 0.25 }, table);
    expect(quarter.structureDamage).toBeCloseTo(1.25, 5);
  });

  test("unknown kind throws with the catalog keys", () => {
    expect(() => resolveWeather({ kind: "fog", intensity: 1 }, table)).toThrow(
      /Unknown weather kind "fog".*Known kinds: clear, rain, storm/,
    );
  });

  test("table keys are the static weather catalog", () => {
    const kinds = Object.keys(table).sort();
    expect(kinds).toEqual(["clear", "rain", "storm"]);
    for (const kind of kinds) {
      expect(resolveWeather({ kind, intensity: 0 }, table).grip).toBe(1);
    }
  });
});

describe("createFireGrid", () => {
  test("ignites and spreads to neighbours over time", () => {
    const grid = createFireGrid({ cols: 5, rows: 5, cellSize: 1, spreadRate: 1, burnRate: 0.1, ignitionThreshold: 1 });
    grid.igniteCell(2, 2);
    expect(grid.cell(2, 2).state).toBe("burning");
    expect(grid.cell(3, 2).state).toBe("unburnt");
    grid.step(1.5);
    expect(grid.cell(3, 2).state).toBe("burning");
  });

  test("a burning cell consumes fuel and becomes burnt", () => {
    const grid = createFireGrid({ cols: 3, rows: 3, cellSize: 1, burnRate: 1, spreadRate: 0 });
    grid.igniteCell(1, 1);
    grid.step(1.1);
    expect(grid.cell(1, 1).state).toBe("burnt");
    expect(grid.cell(1, 1).fuel).toBe(0);
  });

  test("no fuel stops propagation (firebreak)", () => {
    const grid = createFireGrid({
      cols: 5,
      rows: 1,
      cellSize: 1,
      spreadRate: 5,
      burnRate: 0.01,
      fuelAt: (col) => (col === 2 ? 0 : 1),
    });
    grid.igniteCell(0, 0);
    for (let i = 0; i < 20; i += 1) grid.step(0.5);
    expect(grid.cell(2, 0).state).toBe("unburnt");
    expect(grid.cell(3, 0).state).toBe("unburnt");
  });

  test("rain suppression via step spread multiplier slows ignition", () => {
    const dry = createFireGrid({ cols: 3, rows: 3, cellSize: 1, spreadRate: 1, burnRate: 0.01, ignitionThreshold: 1 });
    const wet = createFireGrid({ cols: 3, rows: 3, cellSize: 1, spreadRate: 1, burnRate: 0.01, ignitionThreshold: 1 });
    dry.igniteCell(1, 1);
    wet.igniteCell(1, 1);
    dry.step(1.1, { spread: 1 });
    wet.step(1.1, { spread: 0.1 });
    expect(dry.cell(2, 1).state).toBe("burning");
    expect(wet.cell(2, 1).state).toBe("unburnt");
  });

  test("wetnessAt resists ignition per cell", () => {
    const grid = createFireGrid({ cols: 3, rows: 3, cellSize: 1, spreadRate: 1, burnRate: 0.01, ignitionThreshold: 1 });
    grid.igniteCell(1, 1);
    grid.step(1.1, { wetnessAt: (col, row) => (col === 2 && row === 1 ? 1 : 0) });
    expect(grid.cell(2, 1).state).toBe("unburnt");
    expect(grid.cell(0, 1).state).toBe("burning");
  });

  test("wind biases spread downwind", () => {
    const grid = createFireGrid({
      cols: 7,
      rows: 3,
      cellSize: 1,
      spreadRate: 0.6,
      burnRate: 0.01,
      ignitionThreshold: 1,
      wind: [1, 0],
      windBias: 1,
    });
    grid.igniteCell(3, 1);
    grid.step(1);
    expect(grid.cell(4, 1).heat).toBeGreaterThan(grid.cell(2, 1).heat);
  });

  test("world-position ignite maps to the right cell", () => {
    const grid = createFireGrid({ cols: 5, rows: 5, cellSize: 2, origin: [-4, -4] });
    expect(grid.ignite(0, 0)).toBe(true);
    expect(grid.cell(2, 2).state).toBe("burning");
    expect(grid.ignite(100, 100)).toBe(false);
  });

  test("burning count tracks live cells", () => {
    const grid = createFireGrid({ cols: 3, rows: 3, cellSize: 1, burnRate: 1, spreadRate: 0 });
    grid.igniteCell(0, 0);
    grid.igniteCell(1, 1);
    expect(grid.burning).toBe(2);
    grid.step(1.1);
    expect(grid.burning).toBe(0);
  });
});

describe("weather → fire integration", () => {
  test("resolved spread feeds the fire step", () => {
    const state: WeatherState = { kind: "rain", intensity: 1 };
    const resolved = resolveWeather(state, table);
    const grid = createFireGrid({ cols: 3, rows: 3, cellSize: 1, spreadRate: 1, burnRate: 0.01, ignitionThreshold: 1 });
    grid.igniteCell(1, 1);
    grid.step(1, { spread: resolved.spread });
    expect(grid.cell(2, 1).state).toBe("unburnt");
  });
});

describe("fire authority and persistence", () => {
  test("fixed-step restore resumes identical propagation and live wind retunes direction", () => {
    const config = { cols: 7, rows: 3, cellSize: 2, origin: [-6, -2] as const, burnRate: 0.01, spreadRate: 0.2, windBias: 1 };
    const first = createFireGrid(config);
    first.igniteCell(3, 1);
    for (let i = 0; i < 10; i += 1) first.step(0.1, { windAt: (x, z) => { expect(Number.isFinite(x + z)).toBe(true); return [1, 0]; } });
    const saved = first.snapshot();
    const second = createFireGrid(config);
    second.restore(saved);
    expect(second.burning).toBe(first.burning);
    for (const grid of [first, second]) {
      grid.retune({ wind: [-1, 0], spreadRate: 0.5 });
      for (let i = 0; i < 20; i += 1) grid.step(0.1);
    }
    expect(second.snapshot()).toEqual(first.snapshot());
    expect(first.cell(2, 1).heat).toBeGreaterThan(first.cell(4, 1).heat);
    first.step(0);
    expect(first.snapshot()).toEqual(second.snapshot());
    saved[0]!.fuel = 999;
    expect(second.cell(0, 0).fuel).toBe(1);
  });

  test("dimensions, dt and malformed restore fail without destroying live state", () => {
    expect(() => createFireGrid({ cols: 1.5, rows: 1, cellSize: 1 })).toThrow();
    expect(() => createFireGrid({ cols: 256, rows: 256, cellSize: 1, maxCells: 10 })).toThrow();
    expect(() => createFireGrid({ cols: 1, rows: 1, cellSize: 0 })).toThrow();
    const grid = createFireGrid({ cols: 1, rows: 1, cellSize: 1 });
    grid.igniteCell(0, 0);
    const saved = grid.snapshot();
    expect(() => grid.restore([{ fuel: 0, heat: 1, state: "burning" }])).toThrow();
    expect(grid.snapshot()).toEqual(saved);
    expect(() => grid.step(NaN)).toThrow();
    expect(() => grid.retune({ spreadRate: Infinity })).toThrow();
    expect(grid.cellAt(NaN, 0)).toBe(null);
    expect(() => grid.cell(0.5, 0)).toThrow();
  });
});

describe("fire extinction", () => {
  test("explicit tools preserve remaining fuel, cool heat and permit re-ignition", () => {
    const grid = createFireGrid({ cols: 3, rows: 1, cellSize: 2, origin: [-2, 0], burnRate: 0.2, spreadRate: 0 });
    grid.ignite(0, 0);
    grid.step(0.5);
    const remaining = grid.cell(1, 0).fuel;
    expect(grid.extinguish(0, 0)).toBe(true);
    expect(grid.cell(1, 0)).toEqual({ fuel: remaining, heat: 0, state: "unburnt" });
    expect(grid.burning).toBe(0);
    expect(grid.extinguish(0, 0)).toBe(false);
    expect(grid.extinguishCell(-1, 0)).toBe(false);
    grid.igniteCell(1, 0);
    expect(grid.burning).toBe(1);
    expect(grid.cell(1, 0).fuel).toBe(remaining);
    grid.retune({ burnRate: 10 });
    grid.step(1);
    expect(grid.extinguishCell(1, 0)).toBe(false);
    expect(grid.cell(1, 0).state).toBe("burnt");
  });

  test("wetness can extinguish open burning cells while a sheltered cell keeps burning", () => {
    const grid = createFireGrid({ cols: 3, rows: 1, cellSize: 1, burnRate: 0.2, spreadRate: 0 });
    grid.igniteCell(0, 0);
    grid.igniteCell(2, 0);
    grid.step(1, { extinguishRate: 2, wetnessAt: (col) => col === 0 ? 1 : 0 });
    expect(grid.cell(0, 0)).toEqual({ fuel: 0.9, heat: 0, state: "unburnt" });
    expect(grid.cell(2, 0).state).toBe("burning");
    expect(grid.cell(2, 0).fuel).toBe(0.8);
    expect(grid.burning).toBe(1);
  });

  test("cooling suppresses residual ignition heat and snapshot replay preserves extinction", () => {
    const config = { cols: 3, rows: 1, cellSize: 1, burnRate: 0.01, spreadRate: 0.5 };
    const first = createFireGrid(config);
    first.igniteCell(1, 0);
    first.step(0.5);
    expect(first.cell(0, 0).heat).toBe(0.25);
    const second = createFireGrid(config);
    second.restore(first.snapshot());
    for (let i = 0; i < 15; i += 1) {
      const options = { extinguishRate: 1, wetnessAt: () => 1 };
      first.step(0.1, options);
      second.step(0.1, options);
    }
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.burning).toBe(0);
    expect(first.cell(0, 0).heat).toBe(0);
    expect(first.cell(1, 0).fuel).toBeGreaterThan(0.98);
    const saved = first.snapshot();
    expect(() => first.step(1, { extinguishRate: -1 })).toThrow();
    expect(first.snapshot()).toEqual(saved);
  });
});
