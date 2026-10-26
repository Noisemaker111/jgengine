import { describe, expect, test } from "bun:test";

import { placeAlongPath } from "./pathInstances";

const straight = [
  { x: 0, z: 0 },
  { x: 40, z: 0 },
];

describe("placeAlongPath", () => {
  test("spaces instances evenly with both endpoints", () => {
    const instances = placeAlongPath(straight, { spacing: 10 });
    expect(instances).toHaveLength(5);
    expect(instances[0]!.position[0]).toBeCloseTo(0);
    expect(instances[4]!.position[0]).toBeCloseTo(40);
    expect(instances[1]!.position[0]).toBeCloseTo(10);
  });

  test("faces yaw along the run", () => {
    const instances = placeAlongPath(straight, { spacing: 20 });
    // Travelling +X → yaw = atan2(1, 0) = π/2.
    expect(instances[0]!.yaw).toBeCloseTo(Math.PI / 2, 4);
  });

  test("grounds on the height sampler", () => {
    const instances = placeAlongPath(straight, { spacing: 20, sampleHeight: (x) => x / 4 });
    expect(instances[2]!.position[1]).toBeCloseTo(10);
  });

  test("honors minCount on a short run", () => {
    const short = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    expect(placeAlongPath(short, { spacing: 100, minCount: 4 })).toHaveLength(4);
  });

  test("returns empty for fewer than two points", () => {
    expect(placeAlongPath([{ x: 0, z: 0 }], { spacing: 5 })).toEqual([]);
  });
});
