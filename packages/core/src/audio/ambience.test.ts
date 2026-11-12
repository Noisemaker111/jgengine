import { describe, expect, test } from "bun:test";

import { activeAmbienceZone, ambienceBedLevel, ambienceWeights, zoneSignedDistance, type AmbienceZoneDef } from "./ambience";

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

  test("layers normalize apart, so a wind bed under a machinery bed keeps both at full level", () => {
    const sphere = { kind: "sphere" as const, center: [0, 0, 0] as const, radius: 5 };
    const weights = ambienceWeights(
      [
        { id: "machinery", sound: "hum", shape: sphere, crossfade: 4 },
        { id: "wind", sound: "wind", shape: sphere, crossfade: 4, layer: "wind" },
        { id: "gale", sound: "wind", shape: sphere, crossfade: 4, layer: "wind" },
      ],
      0, 0, 0,
    );
    expect(weights).toEqual([
      { id: "machinery", weight: 1 },
      { id: "wind", weight: 0.5 },
      { id: "gale", weight: 0.5 },
    ]);
  });

  test("an elsewhere zone fills its layer's remainder and hands over across the crossfade", () => {
    const open: AmbienceZoneDef = { id: "open", sound: "bed_open", shape: { kind: "elsewhere" } };
    const zones = [meadow, open];
    for (const x of [-20, -5, -2, 0, 2, 4, 50]) {
      const weights = ambienceWeights(zones, x, 1, 0);
      expect(weights.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
    }
    expect(ambienceWeights(zones, -5, 1, 0)).toEqual([{ id: "meadow", weight: 1 }]);
    expect(ambienceWeights(zones, 0, 1, 0)).toEqual([{ id: "meadow", weight: 0.5 }, { id: "open", weight: 0.5 }]);
    expect(ambienceWeights(zones, 50, 1, 0)).toEqual([{ id: "open", weight: 1 }]);
    expect(activeAmbienceZone(ambienceWeights(zones, 50, 1, 0))).toBe("open");
    // Another layer's zones never eat into this layer's remainder.
    const other: AmbienceZoneDef = { ...shaft, id: "drone", layer: "drone" };
    expect(ambienceWeights([meadow, open, other], 5, 1, 0)).toEqual([{ id: "open", weight: 1 }, { id: "drone", weight: 1 }]);
    expect(ambienceWeights([open], Number.NaN, 0, 0)).toHaveLength(0);
  });
});

describe("ambience bed level", () => {
  test("the live level composes with the zone weight and the authored gain", () => {
    const quiet: AmbienceZoneDef = { ...meadow, gain: 0.5 };
    expect(ambienceBedLevel(quiet, 1)).toBe(0.5);
    expect(ambienceBedLevel(quiet, 0.5, 0.4)).toBeCloseTo(0.1);
    expect(ambienceBedLevel(meadow, 0.8, 0.25)).toBeCloseTo(0.2);
  });

  test("the live level clamps to 0..1 and a stray NaN is silence, never full volume", () => {
    expect(ambienceBedLevel(meadow, 1, 3)).toBe(1);
    expect(ambienceBedLevel(meadow, 1, -2)).toBe(0);
    expect(ambienceBedLevel(meadow, 1, Number.NaN)).toBe(0);
    expect(ambienceBedLevel(meadow, 1, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
