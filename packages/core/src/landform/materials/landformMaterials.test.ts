import { describe, expect, test } from "bun:test";
import { createLandscapeEvolution, type LandscapeEvolution } from "../evolution/landscapeEvolution";
import { fitPowerLaw } from "../validation/geomorphicLaws";
import { LANDFORM_SURFACE_KINDS, landformSurface } from "./landformSurface";
import { COVER, COVER_CLASSES, relativeDeposition, settlingVelocity, weatheredDepth } from "./sedimentCover";

const CLASSES = COVER_CLASSES.length;

function checkCover(model: LandscapeEvolution, step: number): void {
  const fields = model.fields();
  if (Object.values(fields).some((field) => field.some((value) => !Number.isFinite(value)))) throw new Error(`non-finite field at step ${step}`);
  for (let i = 0; i < fields.sediment.length; i += 1) {
    let sum = 0;
    for (let c = 0; c < CLASSES; c += 1) {
      const value = fields.cover[i * CLASSES + c] ?? 0;
      if (value < 0) throw new Error(`negative cover at step ${step}, cell ${i}`);
      sum += value;
    }
    if (sum !== fields.sediment[i]) throw new Error(`cover mismatch at step ${step}, cell ${i}`);
  }
}

describe("grain settling", () => {
  test("vertical concentration tends to a mixed column in fast flow and bed concentration in slow flow", () => {
    const sand = settlingVelocity(5e-4);
    const gravel = settlingVelocity(0.02);
    const silt = settlingVelocity(2e-5);
    expect(relativeDeposition(gravel, sand, 1, 0)).toBeCloseTo(gravel / sand, 12);
    expect(relativeDeposition(gravel, sand, 1, 1e-320)).toBeCloseTo(gravel / sand, 12);
    expect(relativeDeposition(gravel, sand, 1e9, 1)).toBeCloseTo(gravel / sand, 7);
    expect(relativeDeposition(gravel, sand, 0, 1)).toBeCloseTo((gravel / sand) ** 2, 10);
    expect(relativeDeposition(silt, sand, 0, 1)).toBeCloseTo((silt / sand) ** 2, 10);
    expect(relativeDeposition(sand, sand, 0.1, 1)).toBeCloseTo(1, 12);
    expect(relativeDeposition(gravel, sand, 0.01, 1)).toBeGreaterThan(relativeDeposition(gravel, sand, 1, 1));
    expect(relativeDeposition(gravel, sand, 0.1, 4)).toBeGreaterThan(relativeDeposition(gravel, sand, 0.1, 1));
    expect(relativeDeposition(silt, sand, 0.01, 1)).toBeLessThan(relativeDeposition(silt, sand, 1, 1));
  });

  test("sorting parameters reject invalid values without changing a running model", () => {
    const model = createLandscapeEvolution({ grid: { cols: 3, rows: 3, cellSize: 100 }, seed: "sorting-params" });
    expect(() => model.retune({ bankfullRunoff: 0 })).toThrow();
    expect(() => model.retune({ concentrationStrength: -1 })).toThrow();
    expect(model.params().bankfullRunoff).toBeUndefined();
    model.retune({ bankfullRunoff: 2, concentrationStrength: 4 });
    expect(model.params().bankfullRunoff).toBe(2);
    expect(model.params().concentrationStrength).toBe(4);
  });
  test("settling speeds match Ferguson & Church (2004): 0.5 mm sand about 7 cm/s, 20 mm gravel about 0.66 m/s, silt Stokes-slow", () => {
    expect(settlingVelocity(5e-4)).toBeCloseTo(0.071, 3);
    expect(settlingVelocity(0.02)).toBeCloseTo(0.656, 3);
    // Fine silt settles by Stokes' law, v = R g D² / 18ν.
    expect(settlingVelocity(2e-5) / ((1.65 * 9.81 * 4e-10) / 18e-6)).toBeCloseTo(1, 1);
  });
});

describe("soil", () => {
  test("uplifted landscape stays finite", () => {
    const model = createLandscapeEvolution({
      grid: { cols: 64, rows: 64, cellSize: 200 }, seed: "weathering",
      params: { uplift: 4e-3, erodibility: 6e-6, diffusivity: 0.05, timeStep: 5e3 },
    });
    for (let k = 0; k < 300; k += 1) {
      const report = model.step();
      if (Object.values(report).some((value) => !Number.isFinite(value))) {
        throw new Error(`non-finite state at step ${k + 1}: ${JSON.stringify(report)}`);
      }
      checkCover(model, k + 1);
    }
  }, 30_000);
  test("weathering integrates P = P₀ e^(−h/h₀) exactly", () => {
    // Bare rock for 1000 years in one step or a thousand gives the same soil.
    let stepped = 0;
    for (let k = 0; k < 1000; k += 1) stepped = weatheredDepth(stepped, 7.7e-5, 0.5, 1);
    expect(weatheredDepth(0, 7.7e-5, 0.5, 1000)).toBeCloseTo(stepped, 12);
  });

  test("weathering stays finite and monotone from bare rock to extreme cover", () => {
    for (const depth of [0, 0.1, 1, 100, 354, 355, 1000, 1e100, Number.MAX_VALUE]) {
      const next = weatheredDepth(depth, 7.7e-5, 0.5, 1e4);
      expect(Number.isFinite(next)).toBe(true);
      expect(next).toBeGreaterThanOrEqual(depth);
      expect(next - depth).toBeLessThanOrEqual(0.77 + 1e-12);
    }
    for (const depth of [0, 0.1, 1, 10, 100]) {
      const expected = 0.5 * Math.log(Math.exp(depth / 0.5) + 0.77 / 0.5);
      expect(weatheredDepth(depth, 7.7e-5, 0.5, 1e4)).toBeCloseTo(expected, 12);
    }
    expect(weatheredDepth(0, 1e-308, 1e308, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(weatheredDepth(0, 1e308, 1e308, 1e308))).toBe(true);
    expect(weatheredDepth(1000, 1, 0.5, 1)).toBe(1000);
    expect(weatheredDepth(1, 2, 0.5, 2)).toBeGreaterThan(weatheredDepth(1, 1, 0.5, 2));
  });

  test("on an eroding hillslope soil settles at the depth where production equals erosion, h = h₀ ln(P₀/E)", () => {
    const cols = 101;
    const model = createLandscapeEvolution({
      grid: { cols, rows: 3, cellSize: 10, outlets: ["east", "west"] },
      seed: "soil",
      initial: { roughness: 0 },
      params: { uplift: 1e-5, diffusivity: 0.1, erodibility: 0, soilProduction: 1e-4, soilDepthScale: 0.5, timeStep: 1e4 },
    });
    for (let k = 0; k < 400; k += 1) model.step();
    for (let k = 0; k < 600; k += 1) model.step(200);
    const expected = 0.5 * Math.log(1e-4 / 1e-5);
    const { sediment, cover } = model.fields();
    for (let col = 5; col < cols - 5; col += 5) {
      const i = cols + col;
      expect(Math.abs((sediment[i] ?? 0) - expected) / expected).toBeLessThan(0.01);
      expect(cover[i * CLASSES + COVER.soil]).toBeCloseTo(sediment[i] ?? 0, 9);
    }
  }, 30_000);
});

describe("river sorting", () => {
  test("an alluvial fan fines downstream: mean grain size decays with distance from the range front (Sternberg's law)", () => {
    const cols = 64;
    const rows = 96;
    const upliftMap: number[] = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) upliftMap.push(row < 32 ? 1 : 0);
    const model = createLandscapeEvolution({
      grid: { cols, rows, cellSize: 100, outlets: ["south"] },
      seed: "fan",
      params: { uplift: 2e-3, upliftMap, erodibility: 2e-5, deposition: 3, diffusivity: 0.01, timeStep: 1e4 },
    });
    const start = model.fields().height.reduce((a, b) => a + b, 0);
    let exported = 0;
    for (let k = 0; k < 300; k += 1) {
      const report = model.step();
      exported += report.exported;
      if (Object.values(report).some((value) => !Number.isFinite(value))) {
        throw new Error(`non-finite state at step ${k + 1}: ${JSON.stringify(report)}`);
      }
      checkCover(model, k + 1);
    }
    const { cover } = model.fields();
    const sizes = [0.02, 5e-4, 2e-5];
    const distance: number[] = [];
    const grain: number[] = [];
    let gravelNear = 0;
    let gravelFar = 0;
    for (let row = 34; row < rows - 2; row += 1) {
      let logSum = 0;
      let carried = 0;
      let gravel = 0;
      for (let col = 1; col < cols - 1; col += 1) {
        const i = row * cols + col;
        for (let c = 0; c < 3; c += 1) {
          const t = cover[i * CLASSES + c] ?? 0;
          logSum += t * Math.log(sizes[c] ?? 1);
          carried += t;
        }
        gravel += cover[i * CLASSES + COVER.gravel] ?? 0;
      }
      if (carried <= 0) continue;
      distance.push((row - 31) * 100);
      grain.push(Math.exp(logSum / carried));
      if (row < 50) gravelNear += gravel / carried;
      else if (row >= 78) gravelFar += gravel / carried;
    }
    // D = D₀ e^(−αx): an exponential fit of grain size against distance has a falling rate.
    const logs = grain.map((d) => Math.log(d));
    const n = distance.length;
    const mx = distance.reduce((a, b) => a + b, 0) / n;
    const my = logs.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k += 1) {
      sxy += ((distance[k] ?? 0) - mx) * ((logs[k] ?? 0) - my);
      sxx += ((distance[k] ?? 0) - mx) ** 2;
    }
    const alpha = -sxy / sxx;
    const end = model.fields().height.reduce((a, b) => a + b, 0);
    const uplift = model.fields().exhumation.reduce((a, b) => a + b, 0);
    expect(Math.abs((end - start - uplift) * 10000 + exported) / exported).toBeLessThan(1e-9);
    expect(alpha).toBeGreaterThan(1e-4);
    expect(gravelNear / 16).toBeGreaterThan((gravelFar / 16) * 1.5);
    // Silt passes the fan and leaves the map.
    expect(fitPowerLaw(distance, grain).exponent).toBeLessThan(0);
  }, 30_000);

  test("a lake keeps its coarse load in a delta at the river mouth and its silt settles toward the far shore", () => {
    const cols = 40;
    const rows = 48;
    const heights = new Float64Array(cols * rows);
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) heights[row * cols + col] = row < 20 ? 400 - row * 15 : row < 44 ? 20 : 60;
    for (let row = 44; row < rows; row += 1) heights[row * cols + 20] = 50;
    const model = createLandscapeEvolution({
      grid: { cols, rows, cellSize: 100, outlets: ["south"] },
      seed: "lake-sort",
      initial: { heights, roughness: 1 },
      params: { uplift: 1e-3, erodibility: 4e-5, deposition: 0, diffusivity: 0, marineDiffusivity: 0, soilProduction: 0, timeStep: 2e3 },
    });
    for (let k = 0; k < 8; k += 1) model.step();
    const { cover } = model.fields();
    const fractions = (from: number, to: number): { coarse: number; silt: number } => {
      let coarse = 0;
      let silt = 0;
      let total = 0;
      for (let row = from; row < to; row += 1) {
        for (let col = 1; col < cols - 1; col += 1) {
          const i = row * cols + col;
          coarse += (cover[i * CLASSES + COVER.gravel] ?? 0) + (cover[i * CLASSES + COVER.sand] ?? 0);
          silt += cover[i * CLASSES + COVER.silt] ?? 0;
          total += (cover[i * CLASSES + COVER.gravel] ?? 0) + (cover[i * CLASSES + COVER.sand] ?? 0) + (cover[i * CLASSES + COVER.silt] ?? 0);
        }
      }
      return { coarse: coarse / total, silt: silt / total };
    };
    const mouth = fractions(20, 25);
    const far = fractions(36, 44);
    expect(mouth.coarse).toBeGreaterThan(0.9);
    expect(far.silt).toBeGreaterThan(0.6);
    expect(far.silt).toBeGreaterThan(mouth.silt * 5);
  }, 30_000);
});

describe("ground surface", () => {
  test("a collapsing spire leaves scree at its foot, painted as gravel, and bare rock above", () => {
    const side = 41;
    const heights = new Float64Array(side * side);
    for (let row = 0; row < side; row += 1) for (let col = 0; col < side; col += 1) heights[row * side + col] = Math.max(0, 500 - 40 * Math.hypot(col - 20, row - 20));
    const model = createLandscapeEvolution({
      grid: { cols: side, rows: side, cellSize: 10 },
      seed: "spire",
      initial: { heights, roughness: 0 },
      params: { uplift: 0, erodibility: 0, diffusivity: 0, soilProduction: 0, timeStep: 1, strata: { layers: [{ id: "granite", thickness: 1, erodibility: 1, criticalAngle: 55 }] } },
    });
    const report = model.step();
    expect(report.landslid).toBeGreaterThan(0);
    const { cover, debris } = model.fields();
    let scree = 0;
    for (let i = 0; i < side * side; i += 1) {
      scree += cover[i * CLASSES + COVER.scree] ?? 0;
      expect(cover[i * CLASSES + COVER.scree]).toBeCloseTo(debris[i] ?? 0, 9);
    }
    expect(scree * 100 + report.exported).toBeCloseTo(report.landslid, 3);

    const surface = landformSurface(model);
    expect(surface.kinds).toEqual(LANDFORM_SURFACE_KINDS);
    const kinds = surface.kinds.length;
    let footGravel = 0;
    let footCells = 0;
    for (let i = 0; i < side * side; i += 1) {
      let sum = 0;
      for (let k = 0; k < kinds; k += 1) sum += surface.weights[i * kinds + k] ?? 0;
      expect(sum).toBeCloseTo(1, 5);
      if ((debris[i] ?? 0) > 2) {
        footCells += 1;
        footGravel += surface.weights[i * kinds + 1] ?? 0;
      }
    }
    expect(footCells).toBeGreaterThan(10);
    expect(footGravel / footCells).toBeGreaterThan(0.99);
    // The summit is bare granite.
    const summit = 20 * side + 20;
    expect(surface.weights[summit * kinds]).toBe(1);
    expect(surface.bedrockIds[surface.bedrock[summit] ?? 0]).toBe("granite");
  });
});
