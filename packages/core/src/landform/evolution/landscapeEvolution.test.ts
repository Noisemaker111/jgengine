import { describe, expect, test } from "bun:test";
import { landformTopology } from "../grid/landformGrid";
import { hackLawFit, slopeAreaFit } from "../validation/geomorphicLaws";
import { createLandscapeEvolution, type LandformParams, type LandscapeEvolution } from "./landscapeEvolution";

function settle(model: LandscapeEvolution, limit: number, rate = 1e-12): number {
  let report = model.step();
  for (let k = 0; k < limit && report.maxRate > rate; k += 1) report = model.step();
  return report.maxRate;
}

function steadyModel(seed: string, params: Partial<LandformParams>, side = 64): LandscapeEvolution {
  return createLandscapeEvolution({ grid: { cols: side, rows: side, cellSize: 100 }, seed, params: { diffusivity: 0, soilProduction: 0, timeStep: 2e4, ...params } });
}

describe("landscape evolution: steady state and river laws", () => {
  test("uplift balanced by incision reaches steady state, and channels obey Flint's law with θ = m/n and k_s = (U/K)^(1/n)", () => {
    const model = steadyModel("flint", { uplift: 1e-3, erodibility: 2e-5 });
    expect(settle(model, 1500)).toBeLessThan(1e-12);
    const fit = slopeAreaFit(model.routing(), model.fields().height, { minArea: 1e5 });
    expect(fit.concavity).toBeCloseTo(0.5, 6);
    expect(fit.coefficient / (1e-3 / 2e-5)).toBeCloseTo(1, 6);
    expect(fit.r2).toBeGreaterThan(0.999999);
  }, 30_000);

  test("a nonlinear slope exponent (n = 2) and a lower area exponent keep the same law", () => {
    const quadratic = steadyModel("n2", { uplift: 2.5e-4, erodibility: 1e-7, areaExponent: 1, slopeExponent: 2 });
    // Newton converges to 1e-10 relative, so the rate settles near 1e-12 m/yr instead of 0.
    expect(settle(quadratic, 2000, 1e-9)).toBeLessThan(1e-9);
    const fit = slopeAreaFit(quadratic.routing(), quadratic.fields().height, { minArea: 1e5 });
    expect(fit.concavity).toBeCloseTo(0.5, 4);
    expect(fit.coefficient / Math.sqrt(2.5e-4 / 1e-7)).toBeCloseTo(1, 4);

    const shallow = steadyModel("m045", { uplift: 1e-3, erodibility: 4e-5, areaExponent: 0.45 });
    expect(settle(shallow, 1500)).toBeLessThan(1e-12);
    expect(slopeAreaFit(shallow.routing(), shallow.fields().height, { minArea: 1e5 }).concavity).toBeCloseTo(0.45, 6);
  }, 30_000);

  test("river networks grown from random roughness obey Hack's law, h between 0.5 and 0.65", () => {
    for (const seed of ["hack-a", "hack-b"]) {
      const model = steadyModel(seed, { diffusivity: 0.01 }, 96);
      settle(model, 400, 1e-9);
      const fit = hackLawFit(model.routing(), model.fields().height, { minArea: 1e5 });
      expect(fit.exponent).toBeGreaterThan(0.5);
      expect(fit.exponent).toBeLessThan(0.65);
      expect(fit.r2).toBeGreaterThan(0.9);
    }
  }, 30_000);

  test("the implicit solver stays stable at million-year steps: no cell is cut below its receiver", () => {
    const model = steadyModel("stable", { uplift: 5e-3, erodibility: 1e-4, timeStep: 1e6 });
    for (let k = 0; k < 6; k += 1) model.step();
    const { height } = model.fields();
    const { receiver, water } = model.routing();
    for (let i = 0; i < height.length; i += 1) {
      expect(Number.isFinite(height[i])).toBe(true);
      const r = receiver[i] ?? i;
      if (r !== i && (water[i] ?? 0) <= (height[i] ?? 0)) expect(height[i] ?? 0).toBeGreaterThanOrEqual((water[r] ?? 0) - 1e-6);
    }
  });
});

describe("landscape evolution: rock strata", () => {
  test("at steady state rivers steepen in hard rock by the erodibility contrast, k_s,hard / k_s,soft = K_soft / K_hard", () => {
    // Vertical layers striking north–south: soft shale in the east third, hard quartzite to the west.
    const side = 48;
    const model = steadyModel(
      "strata",
      {
        uplift: 5e-4,
        erodibility: 2e-5,
        strata: {
          top: side * 100,
          dip: 90,
          dipDirection: 90,
          layers: [
            { id: "shale", thickness: (side * 100) / 3, erodibility: 2 },
            { id: "quartzite", thickness: 1, erodibility: 0.5 },
          ],
        },
      },
      side,
    );
    expect(settle(model, 2000)).toBeLessThan(1e-12);
    const { height, layer } = model.fields();
    const routing = model.routing();
    const inLayer = (index: number): number => {
      const masked = new Float64Array(height);
      for (let i = 0; i < masked.length; i += 1) if (layer[i] !== index) masked[i] = Number.NaN;
      return slopeAreaFit(routing, masked, { minArea: 1e5 }).coefficient;
    };
    const soft = inLayer(0);
    const hard = inLayer(1);
    expect(soft).toBeCloseTo(5e-4 / (2e-5 * 2), 4);
    expect(hard / soft).toBeCloseTo(4, 4);
  }, 30_000);

  test("a hard caprock over soft shale retreats as a cliffed escarpment with flat tops and outlying buttes", () => {
    const model = createLandscapeEvolution({
      grid: { cols: 64, rows: 64, cellSize: 50 },
      seed: "mesa",
      params: {
        uplift: 1e-3,
        erodibility: 1e-5,
        diffusivity: 0.002,
        timeStep: 5e3,
        strata: {
          top: 1,
          layers: [
            { id: "basalt", thickness: 30, erodibility: 0.02, criticalAngle: 75, weathering: 0.05 },
            { id: "shale", thickness: 1, erodibility: 3, criticalAngle: 35, diffusivity: 3 },
          ],
        },
      },
    });
    // 200 m of uplift, then erosion alone.
    for (let k = 0; k < 40; k += 1) model.step();
    model.retune({ uplift: 0 });
    for (let k = 0; k < 150; k += 1) model.step();
    const { height, layer } = model.fields();
    const topology = landformTopology(model.grid);
    let capCells = 0;
    let shaleCells = 0;
    let lowestTop = Number.POSITIVE_INFINITY;
    let cliffs = 0;
    for (let i = 0; i < height.length; i += 1) {
      if (topology.base[i] === 1) continue;
      if (layer[i] !== 0) {
        shaleCells += 1;
        continue;
      }
      capCells += 1;
      lowestTop = Math.min(lowestTop, height[i] ?? 0);
      for (let k = 0; k < 8; k += 1) {
        const n = topology.neighbour[i * 8 + k] ?? -1;
        // A cliff: the cap stands well above the 35° the shale beside it could hold.
        if (n >= 0 && layer[n] !== 0 && ((height[i] ?? 0) - (height[n] ?? 0)) / (topology.distance[k] ?? 1) > 1.2) {
          cliffs += 1;
          break;
        }
      }
    }
    expect(capCells).toBeGreaterThan(0.2 * height.length);
    expect(shaleCells).toBeGreaterThan(0.3 * height.length);
    // The surviving tops are the caprock itself, worn by under its 30 m thickness.
    expect(lowestTop).toBeGreaterThan(200 - 30);
    expect(cliffs).toBeGreaterThan(50);
  }, 30_000);
});

describe("landscape evolution: sediment", () => {
  test("every cubic metre is accounted for: change in land volume = uplift − export", () => {
    const model = createLandscapeEvolution({
      grid: { cols: 48, rows: 48, cellSize: 100, outlets: ["south"] },
      seed: "budget",
      params: { diffusivity: 0, marineDiffusivity: 0, deposition: 1, timeStep: 1e4 },
    });
    const topology = landformTopology(model.grid);
    const volume = (): number => model.fields().height.reduce((sum, h) => sum + h, 0) * topology.cellArea;
    let interior = 0;
    for (let i = 0; i < topology.cells; i += 1) if (topology.base[i] !== 1) interior += 1;
    const start = volume();
    let exported = 0;
    let deposited = 0;
    const steps = 300;
    for (let k = 0; k < steps; k += 1) {
      const report = model.step();
      exported += report.exported;
      deposited += report.deposited;
    }
    const uplifted = interior * 1e-3 * 1e4 * steps * topology.cellArea;
    expect(deposited).toBeGreaterThan(0);
    expect(Math.abs(volume() - start - (uplifted - exported)) / uplifted).toBeLessThan(1e-9);
  });

  test("a lake fills with sediment from its inflowing river and never above its water surface", () => {
    const cols = 40;
    const rows = 40;
    const heights = new Float64Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        // A ramp falling south into a basin closed by a 30 m sill near the outlet row.
        heights[row * cols + col] = row < 24 ? 300 - row * 12 : row < 36 ? 0 : 30;
      }
    }
    for (let row = 36; row < rows; row += 1) heights[row * cols + 20] = 25;
    const model = createLandscapeEvolution({
      grid: { cols, rows, cellSize: 100, outlets: ["south"] },
      seed: "lake",
      initial: { heights, roughness: 0.5 },
      params: { uplift: 0, erodibility: 5e-5, diffusivity: 0, marineDiffusivity: 0, deposition: 0, timeStep: 2e3 },
    });
    const lakeVolume = (): number => {
      const { water } = model.routing();
      const { height } = model.fields();
      let total = 0;
      for (let i = 0; i < height.length; i += 1) total += Math.max(0, (water[i] ?? 0) - (height[i] ?? 0));
      return total;
    };
    const first = lakeVolume();
    const surface = model.routing().water[30 * cols + 20] ?? 0;
    expect(surface).toBeGreaterThan(25);
    expect(first).toBeGreaterThan(1000);
    let previous = first;
    for (let k = 0; k < 30; k += 1) {
      model.step();
      const now = lakeVolume();
      expect(now).toBeLessThanOrEqual(previous + 1e-6 * first);
      previous = now;
    }
    expect(previous).toBeLessThan(first * 0.9);
    const { height, sediment } = model.fields();
    let lakeFill = 0;
    for (let i = 24 * cols; i < 36 * cols; i += 1) {
      lakeFill += sediment[i] ?? 0;
      expect(height[i] ?? 0).toBeLessThanOrEqual(surface + 1e-9);
    }
    expect(lakeFill).toBeGreaterThan(0);
  });

  test("rivers leaving an uplifting range build alluvial fans that thin away from the mountain front", () => {
    const cols = 64;
    const rows = 64;
    const upliftMap: number[] = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) upliftMap.push(row < 32 ? 1 : 0);
    const model = createLandscapeEvolution({
      grid: { cols, rows, cellSize: 100, outlets: ["south"] },
      seed: "fan",
      params: { uplift: 2e-3, upliftMap, erodibility: 2e-5, deposition: 1.5, diffusivity: 0.01, timeStep: 1e4 },
    });
    for (let k = 0; k < 300; k += 1) model.step();
    const { sediment } = model.fields();
    const rowMean = (row: number): number => {
      let total = 0;
      for (let col = 1; col < cols - 1; col += 1) total += sediment[row * cols + col] ?? 0;
      return total / (cols - 2);
    };
    const nearFront = rowMean(34);
    const farOut = rowMean(58);
    expect(nearFront).toBeGreaterThan(1);
    expect(nearFront).toBeGreaterThan(farOut);
  }, 30_000);
});

describe("landscape evolution: state", () => {
  const options = { grid: { cols: 40, rows: 32, cellSize: 100 }, seed: "state", params: { deposition: 0.5, timeStep: 1e4 } } as const;

  test("the same seed and params grow the same landscape; another seed grows another", () => {
    const a = createLandscapeEvolution(options);
    const b = createLandscapeEvolution(options);
    const c = createLandscapeEvolution({ ...options, seed: "other" });
    a.run(1e6);
    b.run(1e6);
    c.run(1e6);
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  test("a snapshot taken mid-run, saved as JSON and restored, resumes bit for bit; reset returns to the start", () => {
    const model = createLandscapeEvolution(options);
    const startHash = model.hash();
    model.run(5e5);
    const saved = JSON.stringify(model.snapshot());
    model.run(5e5);
    const straight = model.hash();
    model.restore(JSON.parse(saved));
    expect(model.time()).toBe(5e5);
    model.run(5e5);
    expect(model.hash()).toBe(straight);
    expect(model.steps()).toBe(100);
    model.reset();
    expect(model.hash()).toBe(startHash);
    expect(model.time()).toBe(0);
  });

  test("params retune between steps", () => {
    const model = createLandscapeEvolution(options);
    model.run(2e5);
    model.retune({ uplift: 0, erodibility: 1e-4 });
    expect(model.params().uplift).toBe(0);
    const before = model.fields().height.reduce((sum, h) => sum + h, 0);
    model.step();
    expect(model.fields().height.reduce((sum, h) => sum + h, 0)).toBeLessThan(before);
    expect(() => model.retune({ rainfall: [1, 2] })).toThrow();
  });
});
