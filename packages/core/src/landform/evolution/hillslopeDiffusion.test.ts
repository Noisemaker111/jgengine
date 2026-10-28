import { describe, expect, test } from "bun:test";
import { landformTopology } from "../grid/landformGrid";
import { createHillslopeDiffuser } from "./hillslopeDiffusion";
import { createLandscapeEvolution } from "./landscapeEvolution";

// Abramowitz & Stegun 7.1.26, |error| < 1.5e-7.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

describe("hillslope diffusion", () => {
  test("a fault scarp degrades into the analytic error-function profile (Hanks et al. 1984)", () => {
    // A 1D strip: a 2 m step at x = 0 between fixed ends; after t, z = a·erf(x / 2√(Dt)).
    const cols = 401;
    const cellSize = 1;
    const topology = landformTopology({ cols, rows: 3, cellSize, outlets: ["east", "west"] });
    const height = new Float64Array(cols * 3);
    const centre = (cols - 1) / 2;
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < cols; col += 1) height[row * cols + col] = col > centre ? 1 : col < centre ? -1 : 0;
    const diffusivity = new Float64Array(cols * 3).fill(0.01);
    const diffuser = createHillslopeDiffuser(topology);
    const years = 10_000;
    const steps = 2000;
    for (let k = 0; k < steps; k += 1) diffuser.diffuse(height, diffusivity, years / steps);
    const width = 2 * Math.sqrt(0.01 * years);
    let worst = 0;
    for (let col = 0; col < cols; col += 1) {
      const expected = erf(((col - centre) * cellSize) / width);
      worst = Math.max(worst, Math.abs((height[cols + col] ?? 0) - expected));
    }
    // Error under 1% of the scarp's half-height.
    expect(worst).toBeLessThan(0.01);
  });

  test("uplift balanced by creep holds a parabolic hill, z = U(L² − x²)/2D, at steady state", () => {
    const cols = 101;
    const cellSize = 10;
    const uplift = 1e-5;
    const diffusivity = 0.1;
    const model = createLandscapeEvolution({
      grid: { cols, rows: 3, cellSize, outlets: ["east", "west"] },
      seed: "parabola",
      initial: { roughness: 0 },
      params: { uplift, diffusivity, erodibility: 0, timeStep: 1e5 },
    });
    let report = model.step();
    for (let k = 0; k < 400 && report.maxRate > 1e-12; k += 1) report = model.step();
    expect(report.maxRate).toBeLessThan(1e-12);
    const half = ((cols - 1) / 2) * cellSize;
    const { height } = model.fields();
    let worst = 0;
    for (let col = 0; col < cols; col += 1) {
      const x = (col - (cols - 1) / 2) * cellSize;
      const expected = (uplift * (half * half - x * x)) / (2 * diffusivity);
      worst = Math.max(worst, Math.abs((height[cols + col] ?? 0) - expected));
    }
    const crest = (uplift * half * half) / (2 * diffusivity);
    expect(worst / crest).toBeLessThan(1e-6);
  });
});
