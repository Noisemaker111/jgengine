import { expect, test } from "bun:test";

import * as terrain from "./index";

test("the terrain entry point serves the grass system and nothing of the old renderer", () => {
  expect(typeof terrain.GrassPatch).toBe("function");
  expect(typeof terrain.GrassStream).toBe("function");
  expect(terrain.GRASS_SCREEN_DENSITY).toBeGreaterThan(0);
  expect("GrassField" in terrain).toBe(false);
});
