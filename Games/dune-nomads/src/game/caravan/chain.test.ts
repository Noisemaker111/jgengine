import { describe, expect, test } from "bun:test";

import { advanceFollowerToward, isStraggling, positionOnTrail, recordTrail } from "./chain";

describe("recordTrail", () => {
  test("appends a point far enough from the last", () => {
    const trail = recordTrail([{ x: 0, z: 0 }], { x: 5, z: 0 }, 1, 100);
    expect(trail).toHaveLength(2);
  });

  test("skips a point too close to the last", () => {
    const trail = recordTrail([{ x: 0, z: 0 }], { x: 0.1, z: 0 }, 1, 100);
    expect(trail).toHaveLength(1);
  });

  test("caps length by dropping the oldest points", () => {
    let trail: readonly { x: number; z: number }[] = [{ x: 0, z: 0 }];
    for (let i = 1; i <= 10; i += 1) trail = recordTrail(trail, { x: i * 2, z: 0 }, 1, 5);
    expect(trail.length).toBe(5);
    expect(trail[trail.length - 1]!.x).toBe(20);
  });
});

describe("positionOnTrail", () => {
  const trail = [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 0, z: 20 },
  ];

  test("zero distance behind returns the head", () => {
    expect(positionOnTrail(trail, 0)).toEqual({ x: 0, z: 20 });
  });

  test("walks backward along the trail", () => {
    expect(positionOnTrail(trail, 15)).toEqual({ x: 0, z: 5 });
  });

  test("clamps to the trail start beyond its length", () => {
    expect(positionOnTrail(trail, 1000)).toEqual({ x: 0, z: 0 });
  });

  test("single point trail returns that point", () => {
    expect(positionOnTrail([{ x: 3, z: 4 }], 10)).toEqual({ x: 3, z: 4 });
  });
});

describe("advanceFollowerToward", () => {
  test("moves toward the target at the given speed", () => {
    const next = advanceFollowerToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 5, 1);
    expect(next).toEqual({ x: 5, z: 0 });
  });

  test("snaps to the target when within one step", () => {
    const next = advanceFollowerToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 5, 1);
    expect(next).toEqual({ x: 1, z: 0 });
  });
});

describe("isStraggling", () => {
  test("false when close to target", () => {
    expect(isStraggling({ x: 0, z: 0 }, { x: 1, z: 0 }, 4)).toBe(false);
  });

  test("true when far from target", () => {
    expect(isStraggling({ x: 0, z: 0 }, { x: 10, z: 0 }, 4)).toBe(true);
  });
});
