import { describe, expect, test } from "bun:test";

import { activeAmbienceZone, ambienceWeights, zoneSignedDistance, type AmbienceZoneDef } from "./ambience";

const meadow: AmbienceZoneDef = {
  id: "meadow",
  sound: "bed_meadow",
  shape: { kind: "box", min: [-10, -10, -10], max: [0, 10, 10] },
  crossfade: 4,
};
const shaft: AmbienceZoneDef = {
  id: "shaft",
  sound: "bed_shaft",
  shape: { kind: "box", min: [0, -10, -10], max: [10, 10, 10] },
  crossfade: 4,
};

describe("ambience zone weights", () => {
  test("a sphere is full inside, half on the boundary and silent a crossfade outside", () => {
    const shape = { kind: "sphere" as const, center: [0, 0, 0] as const, radius: 5 };
    expect(zoneSignedDistance(shape, 0, 0, 0)).toBeCloseTo(5);
    expect(zoneSignedDistance(shape, 5, 0, 0)).toBeCloseTo(0);
    expect(zoneSignedDistance(shape, 9, 0, 0)).toBeCloseTo(-4);

    const zone: AmbienceZoneDef = { id: "s", sound: "bed", shape, crossfade: 4 };
    expect(ambienceWeights([zone], 0, 0, 0)[0]!.weight).toBeCloseTo(1);
    expect(ambienceWeights([zone], 4, 0, 0)[0]!.weight).toBeCloseTo(0.625);
    expect(ambienceWeights([zone], 5, 0, 0)[0]!.weight).toBeCloseTo(0.5);
    expect(ambienceWeights([zone], 8, 0, 0)[0]!.weight).toBeCloseTo(0.125);
    expect(ambienceWeights([zone], 9, 0, 0)).toHaveLength(0);
    expect(ambienceWeights([zone], 20, 0, 0)).toHaveLength(0);
  });

  test("two zones sharing a boundary hand over with a constant total level", () => {
    for (const x of [-4, -2, -0.5, 0, 0.5, 2, 4]) {
      const weights = ambienceWeights([meadow, shaft], x, 1, 0);
      const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
      expect(total).toBeCloseTo(1);
    }
    const inside = ambienceWeights([meadow, shaft], -5, 1, 0);
    expect(inside).toHaveLength(1);
    expect(inside[0]).toEqual({ id: "meadow", weight: 1 });
    expect(activeAmbienceZone(inside)).toBe("meadow");
  });

  test("overlapping zones normalize so beds never sum above full level", () => {
    const sphere = { kind: "sphere" as const, center: [0, 0, 0] as const, radius: 5 };
    const weights = ambienceWeights(
      [
        { id: "a", sound: "bed", shape: sphere, crossfade: 4 },
        { id: "b", sound: "bed", shape: sphere, crossfade: 4 },
      ],
      0, 0, 0,
    );
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    expect(total).toBeCloseTo(1);
    expect(weights.map((entry) => entry.weight)).toEqual([0.5, 0.5]);
  });

  test("a zone with no crossfade steps at its boundary", () => {
    const step: AmbienceZoneDef = { id: "step", sound: "bed", shape: meadow.shape, crossfade: 0 };
    expect(ambienceWeights([step], -1, 1, 0)[0]!.weight).toBe(1);
    expect(ambienceWeights([step], 0, 1, 0)[0]!.weight).toBe(1);
    expect(ambienceWeights([step], 1, 1, 0)).toHaveLength(0);
  });

  test("no zone covers a far listener and undefined positions resolve to silence", () => {
    expect(activeAmbienceZone(ambienceWeights([meadow, shaft], 500, 0, 0))).toBeNull();
    expect(ambienceWeights([meadow], Number.NaN, 0, 0)).toHaveLength(0);
  });
});
