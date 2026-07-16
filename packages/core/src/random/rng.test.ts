import { describe, expect, test } from "bun:test";
import { hashString, randomSeedFrom, seededRng, seededStreams, stepRandomSeed } from "./rng";

function draw(rng: () => number, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe("seededRng", () => {
  test("same seed reproduces the same sequence", () => {
    expect(draw(seededRng("vaelmere"), 8)).toEqual(draw(seededRng("vaelmere"), 8));
    expect(draw(seededRng(1234567), 8)).toEqual(draw(seededRng(1234567), 8));
  });

  test("different seeds diverge", () => {
    expect(draw(seededRng("vaelmere"), 8)).not.toEqual(draw(seededRng("osterholt"), 8));
  });

  test("values stay in [0, 1)", () => {
    const rng = seededRng(42);
    for (const value of draw(rng, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("stepRandomSeed", () => {
  test("same seed steps to the same value and next seed", () => {
    const seed = randomSeedFrom(1234567);
    expect(stepRandomSeed(seed)).toEqual(stepRandomSeed(seed));
  });

  test("chained steps stay in [0, 1) and reproduce a hand-rolled state machine", () => {
    let cursor = randomSeedFrom(42);
    for (let i = 0; i < 1000; i += 1) {
      const [value, next] = stepRandomSeed(cursor);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      cursor = next;
    }
  });
});

describe("seededStreams", () => {
  test("same seed and stream name reproduce the same sequence", () => {
    const a = seededStreams(1234567)("worldgen");
    const b = seededStreams(1234567)("worldgen");
    expect(draw(a, 8)).toEqual(draw(b, 8));
  });

  test("different stream names are decorrelated", () => {
    const streams = seededStreams(1234567);
    expect(draw(streams("worldgen"), 8)).not.toEqual(draw(streams("history"), 8));
  });

  test("draws on one stream never perturb another", () => {
    const interleaved = seededStreams("realm");
    const history = interleaved("history");
    const worldgen = interleaved("worldgen");
    const mixed: number[] = [];
    for (let i = 0; i < 8; i++) {
      history();
      mixed.push(worldgen());
      history();
    }
    expect(mixed).toEqual(draw(seededStreams("realm")("worldgen"), 8));
  });

  test("string and number seeds with the same text agree", () => {
    expect(draw(seededStreams(7)("weather"), 4)).toEqual(draw(seededStreams("7")("weather"), 4));
  });

  test("hashString is deterministic and returns an unsigned 32-bit int", () => {
    const h = hashString("enemy-42");
    expect(h).toBe(hashString("enemy-42"));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  test("hashString separates distinct strings", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("")).toBe(hashString(""));
  });
});
