import { describe, expect, test } from "bun:test";
import { MOUSE } from "three";

import { orbitMouseButtons } from "./GameOrbitCamera";

describe("orbit rig mouse mapping", () => {
  test("right-drag orbits whether or not the left button picks", () => {
    expect(orbitMouseButtons(false).RIGHT).toBe(MOUSE.ROTATE);
    expect(orbitMouseButtons(true).RIGHT).toBe(MOUSE.ROTATE);
  });

  test("the left button is free for picking only in pointer games", () => {
    expect(orbitMouseButtons(false).LEFT).toBe(MOUSE.ROTATE);
    expect(orbitMouseButtons(true).LEFT).toBeUndefined();
  });
});
