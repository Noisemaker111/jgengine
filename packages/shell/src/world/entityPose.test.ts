import { describe, expect, test } from "bun:test";

import { posesEqual, writeEntityPose } from "./entityPose";

describe("writeEntityPose", () => {
  test("writes position and yaw onto a target without allocating pose props", () => {
    const target = {
      position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      } },
      rotation: { y: 0 },
    };
    writeEntityPose(target, { position: [3, 1.5, -2], rotationY: 1.25 });
    expect(target.position.x).toBe(3);
    expect(target.position.y).toBe(1.5);
    expect(target.position.z).toBe(-2);
    expect(target.rotation.y).toBe(1.25);
  });

  test("posesEqual is true only when all components match", () => {
    const a = { position: [1, 2, 3] as const, rotationY: 0.5 };
    expect(posesEqual(a, { position: [1, 2, 3], rotationY: 0.5 })).toBe(true);
    expect(posesEqual(a, { position: [1, 2, 4], rotationY: 0.5 })).toBe(false);
    expect(posesEqual(a, { position: [1, 2, 3], rotationY: 0.6 })).toBe(false);
  });
});
