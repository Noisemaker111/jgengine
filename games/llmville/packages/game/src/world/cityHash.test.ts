import { expect, test } from "bun:test";

import { hashStructuralSeed, hashedInt, mulberry32 } from "./cityHash";

// Spawn points and starter claims in saved worlds were placed with these numbers before the
// hash and stream moved onto @jgengine/core/random/rng; a change here would move them.
test("structural seeds and streams keep the values saved worlds were placed with", () => {
  const seed = hashStructuralSeed(["plot", 3, -7]);
  expect(seed).toBe(2713035785);
  const rng = mulberry32(seed);
  expect(rng()).toBe(0.15319153550080955);
  expect(rng()).toBe(0.6969065791927278);
  expect(hashedInt(99, 1, 6)).toBe(2);
});
