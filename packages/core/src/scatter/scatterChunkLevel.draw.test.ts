import { expect, test } from "bun:test";

import { chunkLevel } from "./InstancedScatter.draw";

const LEVELS = [{ maxDistance: 20 }, { maxDistance: 60 }, { maxDistance: Infinity }];

test("a chunk takes the first level it is inside", () => {
  expect(chunkLevel(LEVELS, 5, -1, 0.1)).toBe(0);
  expect(chunkLevel(LEVELS, 30, -1, 0.1)).toBe(1);
  expect(chunkLevel(LEVELS, 500, -1, 0.1)).toBe(2);
});

test("a chunk holds its level until it is a hysteresis share past the edge", () => {
  expect(chunkLevel(LEVELS, 21, 0, 0.1)).toBe(0);
  expect(chunkLevel(LEVELS, 23, 0, 0.1)).toBe(1);
  expect(chunkLevel(LEVELS, 19, 1, 0.1)).toBe(1);
  expect(chunkLevel(LEVELS, 17, 1, 0.1)).toBe(0);
  expect(chunkLevel(LEVELS, 200, 0, 0.1)).toBe(2);
});

test("one level is always that level", () => {
  expect(chunkLevel([{ maxDistance: Infinity }], 1e6, 0, 0.5)).toBe(0);
});
