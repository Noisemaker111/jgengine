import { describe, expect, test } from "bun:test";
import { groundFocusListener } from "./listenerAnchor";

describe("groundFocusListener", () => {
  test("puts the listener where an overhead camera looks at the ground", () => {
    const at = groundFocusListener({ x: 0, y: 40, z: 40 }, { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 }, 0);
    expect(at.x).toBeCloseTo(0);
    expect(at.z).toBeCloseTo(0);
    expect(at.y).toBeCloseTo(2);
  });

  test("keeps the camera position when the view never reaches the ground", () => {
    expect(groundFocusListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, 0)).toEqual({ x: 1, y: 2, z: 3 });
    expect(groundFocusListener({ x: 1, y: -5, z: 3 }, { x: 0, y: -1, z: 0 }, 0)).toEqual({ x: 1, y: -5, z: 3 });
  });

  test("clamps a grazing view so the listener stays near the camera's world", () => {
    const at = groundFocusListener({ x: 0, y: 30, z: 0 }, { x: 0, y: -0.06, z: -0.998 }, 0);
    expect(Math.hypot(at.x, at.z)).toBeLessThanOrEqual(400);
  });
});
