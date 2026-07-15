import { describe, expect, test } from "bun:test";
import {
  CONTRAST_MURK_THRESHOLD,
  DOMINANT_SHARE_SPARSE_THRESHOLD,
  EDGE_DENSITY_PRIMITIVE_THRESHOLD,
  ENTROPY_SPARSE_THRESHOLD,
  computeShotMetrics,
  evaluateThresholds,
} from "./shot-metrics";

const WIDTH = 320;
const HEIGHT = 180;

function makeBuffer(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return data;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noisyBuffer(seed: number): Uint8Array {
  const random = mulberry32(seed);
  return makeBuffer(WIDTH, HEIGHT, () => [
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    255,
  ]);
}

describe("computeShotMetrics", () => {
  test("flat single-color buffer reads as sparse, primitive, and blank", () => {
    const data = makeBuffer(WIDTH, HEIGHT, () => [90, 130, 90, 255]);
    const metrics = computeShotMetrics(WIDTH, HEIGHT, data);

    expect(metrics.colorEntropyBits).toBeLessThan(ENTROPY_SPARSE_THRESHOLD);
    expect(metrics.dominantColorShare).toBeGreaterThan(DOMINANT_SHARE_SPARSE_THRESHOLD);
    expect(metrics.edgeDensity).toBeLessThan(EDGE_DENSITY_PRIMITIVE_THRESHOLD);
    expect(metrics.nonblank).toBe(false);
  });

  test("noisy buffer reads as detailed, high-contrast, and nonblank", () => {
    const metrics = computeShotMetrics(WIDTH, HEIGHT, noisyBuffer(42));

    expect(metrics.colorEntropyBits).toBeGreaterThan(ENTROPY_SPARSE_THRESHOLD);
    expect(metrics.dominantColorShare).toBeLessThan(DOMINANT_SHARE_SPARSE_THRESHOLD);
    expect(metrics.edgeDensity).toBeGreaterThan(EDGE_DENSITY_PRIMITIVE_THRESHOLD);
    expect(metrics.luminance.contrast).toBeGreaterThan(CONTRAST_MURK_THRESHOLD);
    expect(metrics.nonblank).toBe(true);
  });

  test("fully transparent buffer fails the blank guard regardless of color", () => {
    const data = makeBuffer(WIDTH, HEIGHT, (x, y) => [(x * 37) % 256, (y * 53) % 256, 0, 0]);
    const metrics = computeShotMetrics(WIDTH, HEIGHT, data);

    expect(metrics.nonblank).toBe(false);
  });

  test("a dull two-tone gradient stays nonblank while still reading sparse", () => {
    const data = makeBuffer(WIDTH, HEIGHT, (x) => (x < WIDTH / 2 ? [40, 50, 40, 255] : [46, 58, 46, 255]));
    const metrics = computeShotMetrics(WIDTH, HEIGHT, data);

    expect(metrics.nonblank).toBe(true);
    expect(metrics.colorEntropyBits).toBeLessThan(ENTROPY_SPARSE_THRESHOLD);
  });
});

describe("evaluateThresholds", () => {
  test("flags every look-quality metric for a flat buffer", () => {
    const metrics = computeShotMetrics(WIDTH, HEIGHT, makeBuffer(WIDTH, HEIGHT, () => [90, 130, 90, 255]));
    const warnings = evaluateThresholds(metrics);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.map((w) => w.metric)).toContain("colorEntropyBits");
  });

  test("clears every look-quality metric for a noisy buffer", () => {
    const metrics = computeShotMetrics(WIDTH, HEIGHT, noisyBuffer(7));
    expect(evaluateThresholds(metrics)).toEqual([]);
  });
});
