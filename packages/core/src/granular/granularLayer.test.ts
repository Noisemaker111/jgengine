import { describe, expect, test } from "bun:test";

import { createGranularLayer } from "./granularLayer";
import { DAMP_SAND, DRY_SAND, plateSinkage, wheelSinkage } from "./granularMaterial";

function flatSand(n = 41, cell = 0.1, depth = 0.5, material = DRY_SAND) {
  return createGranularLayer({ cols: n, rows: n, spacingX: cell, materials: [material], depth: new Float64Array(n * n).fill(depth) });
}

function settle(layer: ReturnType<typeof flatSand>, seconds = 20): void {
  for (let t = 0; t < seconds && layer.awakeCount() > 0; t += 1 / 30) layer.step(1 / 30);
}

describe("granular layer", () => {
  test("a flat bed is stable and falls asleep at once", () => {
    const layer = flatSand();
    const report = layer.step(1 / 30);
    expect(report.moved).toBe(0);
    settle(layer);
    expect(layer.awakeCount()).toBe(0);
    expect(layer.step(1 / 30).substeps).toBe(0);
  });

  test("a hole dug in dry sand fills back to the repose angle and conserves every grain", () => {
    const layer = flatSand();
    const before = layer.totalSolid();
    const taken = layer.dig(2, 2, 0.8, 0.45);
    expect(taken).toBeGreaterThan(0.1);
    expect(Math.abs(layer.totalSolid() + taken - before) / before).toBeLessThan(1e-12);
    settle(layer);
    let steepest = 0;
    for (let gz = 1; gz < layer.rows - 1; gz += 1) {
      for (let gx = 1; gx < layer.cols - 1; gx += 1) {
        const c = layer.index(gx, gz);
        if (layer.depth(c) < 0.05 || layer.depth(c + 1) < 0.05) continue;
        steepest = Math.max(steepest, Math.abs(layer.surface(c + 1) - layer.surface(c)) / layer.spacingX);
      }
    }
    // No face left steeper than the start angle of thick sand.
    expect((Math.atan(steepest) * 180) / Math.PI).toBeLessThan(DRY_SAND.startAngle + 0.5);
  });

  test("a vertical cut stands in damp sand and slumps in dry sand", () => {
    const cut = (material: typeof DRY_SAND): number => {
      const n = 30;
      const depth = new Float64Array(n * n);
      for (let i = 0; i < n * n; i += 1) depth[i] = i % n < 15 ? 0.2 : 0;
      const layer = createGranularLayer({ cols: n, rows: n, spacingX: 0.05, materials: [material], depth });
      settle(layer, 5);
      return layer.depth(layer.index(14, 15));
    };
    // Culmann: damp sand (c 0.5 kPa, φ 36.8°) stands vertical to 0.31 m.
    expect(cut(DAMP_SAND)).toBeGreaterThan(0.19);
    expect(cut(DRY_SAND)).toBeLessThan(0.15);
  });

  test("a load sinks by Bekker's law, compacts first, and a second pass of the same load sinks no further", () => {
    const layer = flatSand(41, 0.05, 0.4);
    const soil = DRY_SAND.bekker;
    if (soil === undefined) throw new Error("dry sand has Bekker values");
    const load = 800;
    const radius = 0.15;
    const surface = layer.surface(layer.index(20, 20));
    const first = layer.press(1, 1, radius, load);
    const expected = plateSinkage(soil, load / (Math.PI * radius * radius), radius);
    expect(Math.abs(surface - layer.surface(layer.index(20, 20)) - expected) / expected).toBeLessThan(1e-9);
    expect(first.sinkage).toBeCloseTo(expected, 9);
    // 0.4 m of loose sand compacts by up to 0.4 (1 − 0.56/0.64) = 5 cm, more than this footprint sinks.
    expect(first.displaced).toBe(0);
    expect(layer.press(1, 1, radius, load).sinkage).toBe(0);
    expect(layer.press(1, 1, radius, 2 * load).sinkage).toBeGreaterThan(0);
  });

  test("a heavy load on a thin layer pushes a berm that holds the displaced volume", () => {
    const layer = flatSand(41, 0.05, 0.03);
    const before = layer.totalSolid();
    const report = layer.press(1, 1, 0.1, 20000);
    expect(report.displaced).toBeGreaterThan(0);
    expect(Math.abs(layer.totalSolid() - before) / before).toBeLessThan(1e-12);
    const rim = layer.surface(layer.index(20, 24));
    expect(rim).toBeGreaterThan(0.03);
  });

  test("a wheel leaves a rut as deep as Bekker's rigid-wheel sinkage", () => {
    const layer = flatSand(81, 0.05, 0.4);
    const soil = DRY_SAND.bekker;
    if (soil === undefined) throw new Error("dry sand has Bekker values");
    const z0 = wheelSinkage(soil, 3000, 0.2, 0.7);
    const report = layer.roll(0.5, 2, 3.5, 2, 0.2, 0.7, 3000);
    expect(report.sinkage).toBeCloseTo(z0, 9);
    expect(0.4 - layer.depth(layer.index(40, 40))).toBeCloseTo(z0, 9);
    expect(0.4 - layer.depth(layer.index(40, 46))).toBe(0);
  });

  test("work follows the disturbance: a dig wakes only cells near it", () => {
    const layer = flatSand(101, 0.1, 0.5);
    settle(layer);
    layer.dig(5, 5, 0.5, 0.4);
    expect(layer.awakeCount()).toBeLessThan(300);
    let most = 0;
    for (let k = 0; k < 60; k += 1) {
      layer.step(1 / 30);
      most = Math.max(most, layer.awakeCount());
    }
    expect(most).toBeLessThan(600);
  });

  test("a snapshot replays bit-identically", () => {
    const run = (layer: ReturnType<typeof flatSand>) => {
      for (let k = 0; k < 20; k += 1) layer.step(1 / 30);
    };
    const a = flatSand();
    a.dig(2, 2, 0.8, 0.45);
    a.deposit(1, 3, 0.4, 0.05);
    run(a);
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    run(a);
    const b = flatSand();
    b.restore(saved);
    run(b);
    for (let i = 0; i < a.solid.length; i += 1) expect(b.solid[i]).toBe(a.solid[i] ?? 0);
  });

  test("material that slides onto an empty bed takes the material it came from", () => {
    const n = 20;
    const depth = new Float64Array(n * n);
    const material = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i += 1) if (i % n < 5) depth[i] = 0.5;
    for (let i = 0; i < n * n; i += 1) material[i] = i % n < 5 ? 1 : 0;
    const layer = createGranularLayer({ cols: n, rows: n, spacingX: 0.1, materials: [DAMP_SAND, DRY_SAND], depth, material });
    settle(layer, 5);
    expect(layer.depth(layer.index(6, 10))).toBeGreaterThan(0);
    expect(layer.material[layer.index(6, 10)]).toBe(1);
  });
});
