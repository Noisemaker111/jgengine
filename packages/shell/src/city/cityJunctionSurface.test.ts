import { describe, expect, test } from "bun:test";
import { junctionSurface } from "./cityJunctionSurface";

const street = (surface: "asphalt" | "gravel", points: [number, number][]) => ({ surface, width: 6, points });
const cross = { x: 0, z: 0, radius: 4 };

describe("junctionSurface", () => {
  test("a crossing of gravel lanes stays gravel", () => {
    expect(junctionSurface(cross, [street("gravel", [[-20, 0], [20, 0]]), street("gravel", [[0, -20], [0, 20]])])).toBe("gravel");
  });

  test("a gravel lane meeting a paved main is asphalt", () => {
    expect(junctionSurface(cross, [street("asphalt", [[-20, 0], [20, 0]]), street("gravel", [[0, 0], [0, 20]])])).toBe("asphalt");
  });

  test("distant paved streets do not pave a gravel crossing", () => {
    const far = street("asphalt", [[-20, 40], [20, 40]]);
    expect(junctionSurface(cross, [street("gravel", [[-20, 0], [20, 0]]), far])).toBe("gravel");
  });

  test("a crossing no street reaches falls back to asphalt", () => {
    expect(junctionSurface(cross, [street("gravel", [[-20, 50], [20, 50]])])).toBe("asphalt");
  });
});
