import { describe, expect, test } from "bun:test";
import { createLandscapeEvolution, type CoastalParams, type LandscapeEvolution } from "../evolution/landscapeEvolution";
import { COVER, COVER_CLASSES } from "../materials/sedimentCover";

// A 20 m cliff facing 100 m of 30 m deep sea, in a strip one cell wide.
const COLS = 160;
const ROWS = 3;
const DX = 10;
const FRONT = 10;
const TOP = 20;
const RETREAT = 0.5;
const ATTENUATION = 200;

function coast(coastal: Omit<CoastalParams, "cliffRetreat">): LandscapeEvolution {
  const heights: number[] = [];
  for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) heights.push(col < FRONT ? -30 : TOP);
  return createLandscapeEvolution({
    grid: { cols: COLS, rows: ROWS, cellSize: DX, outlets: ["west"] },
    seed: "coast",
    initial: { heights, roughness: 0 },
    params: { uplift: 0, erodibility: 0, diffusivity: 0, marineDiffusivity: 0, soilProduction: 0, seaLevel: 0, timeStep: 100, coastal: { cliffRetreat: RETREAT, attenuation: ATTENUATION, ...coastal } },
  });
}

// Metres the cliff has retreated along the middle row, counting a part-cut cell by what is left of it.
function retreat(model: LandscapeEvolution): number {
  const { height } = model.fields();
  let x = 0;
  for (let col = 0; col < COLS; col += 1) {
    const z = height[COLS + col] ?? 0;
    if (z < 0) x += 1;
    else {
      x += (TOP - z) / (TOP + 1);
      break;
    }
  }
  return (x - FRONT) * DX;
}

// x(t) = W* ln(1 + R₀t/W*): the platform a cliff leaves behind damps the waves that reach it
// (Sunamura 1992; Anderson, Densmore & Ellis 1999).
const analytic = (t: number, w: number): number => w * Math.log(1 + (RETREAT * t) / w);

describe("coastal erosion", () => {
  test("a cliff retreats ever slower behind the platform it leaves, as x = W* ln(1 + R₀t/W*)", () => {
    const model = coast({ platformErosion: 0, beachShare: 0 });
    const times: number[] = [];
    const shores: number[] = [];
    for (let k = 1; k <= 60; k += 1) {
      model.step();
      if (k % 6 !== 0) continue;
      const t = k * 100;
      const x = retreat(model);
      times.push(t);
      shores.push(x);
      if (t >= 1200) expect(Math.abs(x / analytic(t, ATTENUATION) - 1)).toBeLessThan(0.08);
    }
    let best = 0;
    let bestError = Infinity;
    for (let w = 50; w <= 600; w += 1) {
      let error = 0;
      times.forEach((t, k) => {
        error += ((shores[k] ?? 0) - analytic(t, w)) ** 2;
      });
      if (error < bestError) {
        bestError = error;
        best = w;
      }
    }
    expect(Math.abs(best / ATTENUATION - 1)).toBeLessThan(0.1);
  });

  test("waves wear the platform down, deepest where it has been under water longest", () => {
    const model = coast({ platformErosion: 2e-3, beachShare: 0 });
    for (let k = 0; k < 60; k += 1) model.step();
    const { height } = model.fields();
    const shore = FRONT + Math.floor(retreat(model) / DX);
    const seaward = height[COLS + FRONT + 2] ?? 0;
    const landward = height[COLS + shore - 2] ?? 0;
    expect(seaward).toBeLessThan(-1.5);
    expect(seaward).toBeLessThan(landward - 0.3);
  });

  test("sand cut from the cliff stays as beach, and every cubic metre is accounted for", () => {
    const model = coast({ beachShare: 0.5 });
    const { height, cover } = model.fields();
    const volume = (): number => height.reduce((sum, h) => sum + h, 0) * DX * DX;
    const start = volume();
    let exported = 0;
    for (let k = 0; k < 30; k += 1) exported += model.step().exported;
    expect(exported).toBeGreaterThan(0);
    expect(Math.abs(volume() - start + exported) / exported).toBeLessThan(1e-9);
    let beach = 0;
    for (let i = 0; i < COLS * ROWS; i += 1) beach += cover[i * COVER_CLASSES.length + COVER.beach] ?? 0;
    expect(beach).toBeGreaterThan(0);
    expect(model.fields().waveEnergy.some((e) => e > 0 && e < 1)).toBe(true);
  });
});
