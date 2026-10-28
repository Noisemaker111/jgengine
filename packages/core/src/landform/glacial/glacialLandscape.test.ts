import { describe, expect, test } from "bun:test";
import { createLandscapeEvolution, type LandformParams, type LandscapeEvolution } from "../evolution/landscapeEvolution";
import { COVER, COVER_CLASSES } from "../materials/sedimentCover";
import { snowlineAt, snowlineHistory } from "./glacialClimate";

// A river-cut range, grown at 1 mm/yr of uplift until erosion keeps pace, then run 70 kyr through the
// LR04 snowline (two glacial maxima) beside an ice-free twin with the same uplift, so the difference is the ice's.
const COARSE = 24;
const SIDE = 2 * COARSE - 1;
const CELLS = SIDE * SIDE;
const DX = 100;
const RIVERS: LandformParams = { uplift: 1e-3, erodibility: 1.5e-6, diffusivity: 0.05, soilProduction: 0, timeStep: 2000 };
const START_KA = 70;

function riverRange(): number[] {
  const grow = createLandscapeEvolution({ grid: { cols: COARSE, rows: COARSE, cellSize: 2 * DX }, seed: "range", initial: { roughness: 5 }, params: { ...RIVERS, timeStep: 2e4 } });
  for (let k = 0; k < 400; k += 1) grow.step();
  const { height, sediment } = grow.fields();
  const at = (col: number, row: number): number => (height[row * COARSE + col] ?? 0) - (sediment[row * COARSE + col] ?? 0);
  const heights: number[] = [];
  for (let row = 0; row < SIDE; row += 1) {
    for (let col = 0; col < SIDE; col += 1) {
      const c = Math.min(COARSE - 2, col >> 1);
      const r = Math.min(COARSE - 2, row >> 1);
      const fx = col / 2 - c;
      const fy = row / 2 - r;
      heights.push((1 - fy) * ((1 - fx) * at(c, r) + fx * at(c + 1, r)) + fy * ((1 - fx) * at(c, r + 1) + fx * at(c + 1, r + 1)));
    }
  }
  return heights;
}

function rock(model: LandscapeEvolution): Float64Array {
  const { height, sediment } = model.fields();
  return Float64Array.from(height, (h, i) => h - (sediment[i] ?? 0));
}

describe("a range through glacial cycles", () => {
  test("glaciers plane the range down to the snowline (the glacial buzzsaw) and leave their till inside the ice's furthest reach", () => {
    const heights = riverRange();
    const history = snowlineHistory({ presentEla: 0.85 * Math.max(...heights), glacialEla: 1300, startKa: START_KA });
    const grid = { cols: SIDE, rows: SIDE, cellSize: DX };
    const model = createLandscapeEvolution({ grid, seed: "range", initial: { heights, roughness: 0 }, params: { ...RIVERS, glacial: { elaHistory: history, model: "first-order", layers: 4 } } });
    const twin = createLandscapeEvolution({ grid, seed: "range", initial: { heights, roughness: 0 }, params: RIVERS });
    const reach = new Uint8Array(CELLS);
    let snowline = 0;
    let glaciated = 0;
    for (let year = 2000; year <= START_KA * 1000; year += 2000) {
      model.step();
      twin.step();
      const { ice } = model.fields();
      let any = false;
      for (let i = 0; i < CELLS; i += 1) {
        if ((ice[i] ?? 0) <= 0) continue;
        reach[i] = 1;
        any = true;
      }
      if (any) {
        snowline += snowlineAt(history, year - 1000);
        glaciated += 1;
      }
    }
    snowline /= glaciated;

    // Brozović, Burbank & Meigs (1997); Egholm et al. (2009): glacial erosion caps a range near the
    // mean snowline. The rivers alone keep the range's high ground; the ice leaves little above it.
    const above = (z: Float64Array): number => z.filter((h) => h > snowline + 100).length;
    const iceFree = above(rock(twin));
    expect(iceFree).toBeGreaterThan(100);
    expect(above(rock(model))).toBeLessThan(0.4 * iceFree);

    // Till lies where the ice reached, never more than two cells beyond it.
    const { cover } = model.fields();
    let till = 0;
    let beyond = 0;
    for (let i = 0; i < CELLS; i += 1) {
      const t = cover[i * COVER_CLASSES.length + COVER.till] ?? 0;
      if (t <= 0) continue;
      till += t;
      const row = Math.floor(i / SIDE);
      const col = i % SIDE;
      let near = false;
      for (let r = Math.max(0, row - 2); r <= Math.min(SIDE - 1, row + 2); r += 1) for (let c = Math.max(0, col - 2); c <= Math.min(SIDE - 1, col + 2); c += 1) if (reach[r * SIDE + c] === 1) near = true;
      if (!near) beyond += t;
    }
    expect(till * DX * DX).toBeGreaterThan(1e6);
    expect(beyond).toBe(0);
  }, 120_000);
});
