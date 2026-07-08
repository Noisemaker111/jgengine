import { expect, test } from "bun:test";

import { resolveGameLoader, type GameRegistry, type PlayableGame } from "./registry";

const stubLoad = () => Promise.resolve({} as PlayableGame);

test("resolveGameLoader prefers the exact gameId and falls back only when asked", () => {
  const registry: GameRegistry = { demo: stubLoad, "block-stacker": stubLoad };
  expect(resolveGameLoader(registry, "block-stacker", "demo")).toBe(registry["block-stacker"]);
  expect(resolveGameLoader(registry, "missing", "demo")).toBe(registry.demo);
  expect(resolveGameLoader(registry, "missing")).toBeUndefined();
  expect(resolveGameLoader(registry, "missing", "also-missing")).toBeUndefined();
});
