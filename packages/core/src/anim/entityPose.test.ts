import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { emptyPoseMemo, posesEqual, writeEntityPose, writePoseIfChanged, writeRenderPoseIfChanged } from "./entityPose";

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

describe("writePoseIfChanged", () => {
  function marker(): THREE.Group {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    return group;
  }

  test("writes and recomposes the first pose, then leaves an unchanged one alone", () => {
    const group = marker();
    const memo = emptyPoseMemo();
    expect(writePoseIfChanged(group, { position: [2, 0, -3], rotationY: 1 }, memo)).toBe(true);
    expect(group.matrix.elements[12]).toBe(2);
    expect(group.matrix.elements[14]).toBe(-3);
    expect(group.matrixWorldNeedsUpdate).toBe(true);

    group.matrixWorldNeedsUpdate = false;
    expect(writePoseIfChanged(group, { position: [2, 0, -3], rotationY: 1 }, memo)).toBe(false);
    expect(group.matrixWorldNeedsUpdate).toBe(false);
  });

  test("recomposes when only the yaw moved", () => {
    const group = marker();
    const memo = emptyPoseMemo();
    writePoseIfChanged(group, { position: [1, 0, 1], rotationY: 0 }, memo);
    group.matrixWorldNeedsUpdate = false;
    expect(writePoseIfChanged(group, { position: [1, 0, 1], rotationY: 0.5 }, memo)).toBe(true);
    expect(group.matrixWorldNeedsUpdate).toBe(true);
  });

  test("the interpolated render pose takes the same dirty path, falling back to the live pose", () => {
    const group = marker();
    const memo = emptyPoseMemo();
    const scratch: [number, number, number, number] = [0, 0, 0, 0];
    const ctx = { sim: { renderPose: () => false } } as unknown as Parameters<typeof writeRenderPoseIfChanged>[1];
    expect(writeRenderPoseIfChanged(group, ctx, "e1", { position: [5, 0, 0], rotationY: 0 }, scratch, memo)).toBe(true);
    expect(group.position.x).toBe(5);
    group.matrixWorldNeedsUpdate = false;
    expect(writeRenderPoseIfChanged(group, ctx, "e1", { position: [5, 0, 0], rotationY: 0 }, scratch, memo)).toBe(false);
  });
});
