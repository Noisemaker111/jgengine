import { describe, expect, test } from "bun:test";
import { GROUND_DECAL_LAYERS } from "@jgengine/core/world/roads";

import { RANGE_RING_WIDTH, rangeRingBand } from "./rangeRing";

const flat = () => 0;
const ramp = (x: number, z: number) => 0.05 * x + 0.03 * z;

function ringPoints(band: ReturnType<typeof rangeRingBand>): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let i = 0; i < band.positions.length; i += 3) {
    points.push([band.positions[i]!, band.positions[i + 1]!, band.positions[i + 2]!]);
  }
  return points;
}

describe("range ring band", () => {
  test("draws an outline on the engine's emissive ground decal layer, never a filled disc", () => {
    const radius = 8;
    const points = ringPoints(rangeRingBand({ center: [0, 0], radius, sampleHeight: flat }));
    expect(points.length).toBeGreaterThan(64);
    for (const [x, , z] of points) {
      const distance = Math.hypot(x, z);
      expect(distance).toBeGreaterThanOrEqual(radius - RANGE_RING_WIDTH / 2 - 0.01);
      expect(distance).toBeLessThanOrEqual(radius + RANGE_RING_WIDTH / 2 + 0.01);
    }
  });

  test("sits on the glow decal layer above the road so the raider route reads under it", () => {
    const points = ringPoints(rangeRingBand({ center: [3, -4], radius: 7, sampleHeight: ramp }));
    expect(GROUND_DECAL_LAYERS.glow).toBeGreaterThan(GROUND_DECAL_LAYERS.road);
    for (const [x, y, z] of points) {
      expect(y).toBeCloseTo(ramp(x, z) + GROUND_DECAL_LAYERS.glow, 5);
    }
  });

  test("indexes whole triangles for the ribbon mesh", () => {
    const band = rangeRingBand({ center: [0, 0], radius: 7.5, sampleHeight: flat });
    expect(band.indices.length % 3).toBe(0);
    expect(band.indices.length).toBeGreaterThan(0);
    expect(Math.max(...band.indices)).toBeLessThan(band.positions.length / 3);
  });
});
