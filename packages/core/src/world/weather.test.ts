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
