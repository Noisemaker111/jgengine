import { describe, expect, test } from "bun:test";
import { createLandscapeEvolution, type GlacialParams, type LandscapeEvolution } from "../evolution/landscapeEvolution";
import { landformTopology } from "../grid/landformGrid";
import { COVER, COVER_CLASSES } from "../materials/sedimentCover";
import { fitPowerLaw } from "../validation/geomorphicLaws";
import { snowlineHistory } from "./glacialClimate";
import { createIceFlow, iceDeformationRate } from "./iceFlow";

describe("ice flow", () => {
  test("an ice sheet on a flat bed under even snowfall settles to Vialov's (1958) profile", () => {
    const half = 50_000;
    const dx = 1000;
    const cols = (2 * half) / dx + 1;
    const topology = landformTopology({ cols, rows: 3, cellSize: dx, outlets: ["east", "west"] });
    const flow = createIceFlow(topology);
    const bed = new Float64Array(topology.cells);
    const ice = new Float64Array(topology.cells);
    const snowfall = 0.3;
    const balance = new Float64Array(topology.cells).fill(snowfall);
    const gamma = iceDeformationRate();
    const settings = { deformation: gamma, sliding: 0, ela: 0, balanceGradient: 0, maxAccumulation: 0, lateralDrag: 0 };
    const report = flow.advance(bed, ice, 400_000, settings, { balance, maxStep: 5000, tolerance: 1e-10 });
    expect(report.rate).toBeLessThan(1e-9);
    // H(x) = H₀ (1 − (|x|/L)^(4/3))^(3/8), H₀ = 2^(3/8) (a/Γ)^(1/8) L^(1/2) for Glen's n = 3.
    const dome = 2 ** (3 / 8) * (snowfall / gamma) ** (1 / 8) * Math.sqrt(half);
    for (const [share, tolerance] of [
      [0, 0.005],
      [0.25, 0.005],
      [0.5, 0.005],
      [0.75, 0.01],
      [0.9, 0.02],
    ] as const) {
      const col = Math.round((half + share * half) / dx);
      const x = Math.abs(col * dx - half);
      const exact = dome * (1 - (x / half) ** (4 / 3)) ** (3 / 8);
      expect(Math.abs((ice[cols + col] ?? 0) / exact - 1)).toBeLessThan(tolerance);
    }
  });
});

// A river's V-shaped valley, 1.2 km deep, climbing to a high cirque basin above an ELA of 1500 m.
const COLS = 60;
const HALF = 12;
const ROWS = 2 * HALF + 9;
const MID = (ROWS - 1) / 2;
const DX = 100;

function vValley(): number[] {
  const heights: number[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const y = Math.abs(row - MID);
      const floor = 1000 + 0.05 * col * DX + (col > 40 ? 0.4 * (col - 40) * DX : 0);
      heights.push(floor + 0.6 * Math.min(y, HALF) * DX + (y > HALF ? 0.02 * (y - HALF) * DX : 0));
    }
  }
  return heights;
}

const START = vValley();

function glaciate(timeStep: number, glacial: GlacialParams = { ela: 1500, model: "shallow-ice" }): LandscapeEvolution {
  return createLandscapeEvolution({
    grid: { cols: COLS, rows: ROWS, cellSize: DX, outlets: ["west"] },
    seed: "valley",
    initial: { heights: START, roughness: 0 },
    params: { uplift: 0, erodibility: 0, diffusivity: 0, marineDiffusivity: 0, soilProduction: 0, timeStep, glacial },
  });
}

function rockAt(model: LandscapeEvolution, i: number): number {
  const { height, sediment } = model.fields();
  return (height[i] ?? 0) - (sediment[i] ?? 0);
}

// Exponent b of a cross-section's glacial trough, z − z_floor = a·|y|^b (Harbor 1992), fitted on each
// wall from the lowest rock out to the trimline (where the glacier lowered the rock by under 10 m).
function troughExponent(model: LandscapeEvolution, col: number): number {
  const at = (row: number): number => row * COLS + col;
  const lo = MID - HALF;
  const hi = MID + HALF;
  let floorRow = MID;
  for (let row = lo; row <= hi; row += 1) if (rockAt(model, at(row)) < rockAt(model, at(floorRow))) floorRow = row;
  const floor = rockAt(model, at(floorRow));
  const walls: number[] = [];
  for (const side of [-1, 1]) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let row = floorRow + side; row >= lo && row <= hi; row += side) {
      const rock = rockAt(model, at(row));
      if (rock > (START[at(row)] ?? 0) - 10) break;
      if (rock - floor <= 0.5) continue;
      xs.push(Math.abs(row - floorRow) * DX);
      ys.push(rock - floor);
    }
    if (xs.length >= 3) walls.push(fitPowerLaw(xs, ys).exponent);
  }
  return walls.length > 0 ? walls.reduce((sum, b) => sum + b, 0) / walls.length : Number.NaN;
}

function medianTroughExponent(model: LandscapeEvolution): number {
  const exponents: number[] = [];
  for (let col = 24; col <= 40; col += 1) {
    const b = troughExponent(model, col);
    if (!Number.isNaN(b)) exponents.push(b);
  }
  exponents.sort((a, b) => a - b);
  return exponents[Math.floor(exponents.length / 2)] ?? Number.NaN;
}

// Mean rock lowered on the valley axis and on its lower flanks (2 to 5 cells out) along the glacier.
function axisAndFlank(model: LandscapeEvolution): { axis: number; flank: number } {
  let axis = 0;
  let flank = 0;
  let count = 0;
  for (let col = 24; col <= 40; col += 1) {
    const i = MID * COLS + col;
    axis += (START[i] ?? 0) - rockAt(model, i);
    for (const y of [2, 3, 4, 5]) {
      for (const side of [-1, 1]) {
        const j = (MID + side * y) * COLS + col;
        flank += ((START[j] ?? 0) - rockAt(model, j)) / 8;
      }
    }
    count += 1;
  }
  return { axis: axis / count, flank: flank / count };
}

describe("glacial erosion by shallow ice, the fast path", () => {
  test("ice in the bottom of a V, walled by rock, slides slower, so the glacier cuts its flanks faster than its axis (Harbor 1992)", () => {
    for (const timeStep of [1000, 2000, 5000]) {
      const model = glaciate(timeStep);
      let thickest = 0;
      for (let t = timeStep; t <= 20_000; t += timeStep) {
        model.step();
        for (const h of model.fields().ice) thickest = Math.max(thickest, h);
      }
      const { axis, flank } = axisAndFlank(model);
      expect(axis).toBeGreaterThan(10);
      expect(flank / axis).toBeGreaterThan(1.5);
      // A valley glacier some hundreds of metres thick, not a numerical pile.
      expect(thickest).toBeGreaterThan(200);
      expect(thickest).toBeLessThan(800);
    }
  }, 60_000);

  test("glaciers drop till where the ice ends, and every cubic metre is accounted for", () => {
    const model = glaciate(2000);
    const { height, cover, ice } = model.fields();
    const volume = (): number => height.reduce((sum, h) => sum + h, 0) * DX * DX;
    const start = volume();
    let exported = 0;
    for (let k = 0; k < 15; k += 1) exported += model.step().exported;
    expect(Math.abs(volume() - start + exported) / exported).toBeLessThan(1e-9);
    const classes = COVER_CLASSES.length;
    let till = 0;
    for (let i = 0; i < COLS * ROWS; i += 1) till += cover[i * classes + COVER.till] ?? 0;
    expect(till).toBeGreaterThan(0);
    expect(ice.some((h) => h > 0)).toBe(true);
  }, 60_000);

  test("ice is part of the state: a snapshot restores it and the run resumes bit for bit", () => {
    const model = glaciate(2000);
    for (let k = 0; k < 5; k += 1) model.step();
    const saved = JSON.stringify(model.snapshot());
    for (let k = 0; k < 3; k += 1) model.step();
    const ahead = model.hash();
    model.restore(JSON.parse(saved));
    for (let k = 0; k < 3; k += 1) model.step();
    expect(model.hash()).toBe(ahead);
    model.reset();
    expect(model.fields().ice.every((h) => h === 0)).toBe(true);
  }, 60_000);
});

describe("glacial erosion by first-order (Blatter–Pattyn) ice flow", () => {
  const firstOrder: GlacialParams = { ela: 1500, model: "first-order", layers: 4 };

  // Shallow ice slides as fast on the thin ice up the walls as in the trough, so it lowers the whole V;
  // the walls' drag in first-order flow is what leaves them standing.
  test("the V's trough steepens toward a U: its cross-section exponent rises from 1", () => {
    const model = glaciate(2000, firstOrder);
    for (let k = 0; k < 10; k += 1) model.step();
    const exponent = medianTroughExponent(model);
    expect(exponent).toBeGreaterThan(1.2);
    expect(exponent).toBeLessThan(2.5);
  }, 120_000);

  test("the walls drag the ice in a V: it slides slower on the axis than beside it", () => {
    const model = glaciate(2000, firstOrder);
    for (let k = 0; k < 4; k += 1) model.step();
    const { ice, iceSliding } = model.fields();
    let slowerAxis = 0;
    let columns = 0;
    for (let col = 24; col <= 40; col += 1) {
      const axis = MID * COLS + col;
      if ((ice[axis] ?? 0) < 50) continue;
      columns += 1;
      let fastest = 0;
      for (let y = -HALF; y <= HALF; y += 1) fastest = Math.max(fastest, iceSliding[(MID + y) * COLS + col] ?? 0);
      if ((iceSliding[axis] ?? 0) < 0.9 * fastest) slowerAxis += 1;
    }
    expect(columns).toBeGreaterThan(5);
    expect(slowerAxis / columns).toBeGreaterThan(0.5);
  }, 60_000);

  test("its flux scale is state: a snapshot restores it and a run through the LR04 snowline resumes bit for bit", () => {
    const model = glaciate(2000, { model: "first-order", layers: 4, elaHistory: snowlineHistory({ presentEla: 2200, glacialEla: 1500, startKa: 24 }) });
    for (let k = 0; k < 2; k += 1) model.step();
    const saved = JSON.stringify(model.snapshot());
    model.step();
    const ahead = model.hash();
    model.restore(JSON.parse(saved));
    model.step();
    expect(model.hash()).toBe(ahead);
  }, 60_000);
});

describe("ice surface on a smooth steep bed", () => {
  // A straight trough, sloping 0.3 or 0.5, under a temperate glacier 100 m thick. Mismatched face
  // fluxes would pile ice into steps; the smooth bed allows none.
  test.each([0.3, 0.5])("at slope %p the first-order glacier's surface has no steps over 10 m", (slope) => {
    const cols = 60;
    const rows = 31;
    const mid = 15;
    const heights: number[] = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) heights.push(1000 + slope * col * 100 + 0.0004 * ((row - mid) * 100) ** 2);
    const model = createLandscapeEvolution({
      grid: { cols, rows, cellSize: 100, outlets: ["west"] },
      seed: "smooth",
      initial: { heights, roughness: 0 },
      params: { uplift: 0, erodibility: 0, diffusivity: 0, marineDiffusivity: 0, soilProduction: 0, timeStep: 1000, glacial: { ela: 1000 + slope * 4500, model: "first-order", layers: 4, erosion: 0, snowlineTemperature: 10 } },
    });
    for (let k = 0; k < 10; k += 1) model.step();
    const { height, ice } = model.fields();
    const surface = (i: number): number => (height[i] ?? 0) + (ice[i] ?? 0);
    let worst = 0;
    let measured = 0;
    // Away from the outlet edge and the head, wherever ice 20 m thick spans five cells.
    for (let col = 4; col < cols - 4; col += 1) {
      const i = mid * cols + col;
      if ([-2, -1, 0, 1, 2].some((k) => (ice[i + k] ?? 0) < 20)) continue;
      measured += 1;
      worst = Math.max(worst, Math.abs(surface(i + 1) - 2 * surface(i) + surface(i - 1)));
    }
    expect(measured).toBeGreaterThan(30);
    expect(worst).toBeLessThan(10);
  }, 60_000);
});
