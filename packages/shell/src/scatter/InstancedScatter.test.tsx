import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { InstanceCullPolicy } from "@jgengine/core/render/cullPolicy";

import { visibleInstanceIndices } from "./InstancedScatter";

function matricesAt(distances: readonly number[]): THREE.Matrix4[] {
  return distances.map((z) => new THREE.Matrix4().makeTranslation(0, 0, z));
}

const CAMERA = { x: 0, y: 0, z: 0 };
const NEAR_POLICY: InstanceCullPolicy = { maxDistance: 100, minDistance: 0, hysteresis: 0 };
const HYSTERESIS_POLICY: InstanceCullPolicy = { maxDistance: 100, minDistance: 0, hysteresis: 5 };

function drawn(indices: readonly number[]): (index: number) => boolean {
  const set = new Set(indices);
  return (index) => set.has(index);
}

describe("visibleInstanceIndices", () => {
  test("a batch past the cull distance draws nothing", () => {
    const out: number[] = [];
    const count = visibleInstanceIndices(CAMERA, matricesAt([400, 520, 900]), 1, NEAR_POLICY, () => false, out);
    expect(count).toBe(0);
    expect(out).toEqual([]);
  });

  test("a batch that comes back inside the distance is drawn again, with no hysteresis thrash", () => {
    const batch = matricesAt([60, 104]);
    const far: number[] = [];
    // 104 is past 100 and its own radius, so nothing was drawn last frame.
    expect(visibleInstanceIndices(CAMERA, batch, 1, NEAR_POLICY, () => false, far)).toBe(1);
    // The camera backs off a hair: 104 is still past the edge, but it is drawn last frame, so the
    // hysteresis band keeps it on instead of flickering off.
    const stillIn: number[] = [];
    expect(visibleInstanceIndices(CAMERA, batch, 1, HYSTERESIS_POLICY, drawn([1]), stillIn)).toBe(2);
    // Once past the hysteresis band it drops, and it stays dropped.
    const out: number[] = [];
    expect(visibleInstanceIndices({ x: 0, y: 0, z: -200 }, batch, 1, HYSTERESIS_POLICY, drawn([1]), out)).toBe(0);
  });

  test("an unbounded policy keeps every instance", () => {
    const out: number[] = [];
    const count = visibleInstanceIndices(CAMERA, matricesAt([10, 1_000, 100_000]), 1, { maxDistance: Number.POSITIVE_INFINITY, minDistance: 0, hysteresis: 0 }, () => false, out);
    expect(count).toBe(3);
    expect(out).toEqual([0, 1, 2]);
  });
});


