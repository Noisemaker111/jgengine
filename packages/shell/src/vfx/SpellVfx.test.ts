import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { slashArcPoint } from "./SpellVfx";

describe("melee slash arc", () => {
  const from = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3(3, 1, 0);

  test("sweeps across the attacker's front instead of bursting at its body centre", () => {
    const points = [0, 0.25, 0.5, 0.75, 1].map((t) => slashArcPoint(from, to, t, new THREE.Vector3()));
    for (const point of points) {
      expect(Math.hypot(point.x - from.x, point.z - from.z)).toBeGreaterThan(0.6);
      expect(point.x).toBeGreaterThan(0);
    }
    expect(points[0]!.z).toBeLessThan(-0.5);
    expect(points[4]!.z).toBeGreaterThan(0.5);
    expect(points[2]!.z).toBeCloseTo(0, 5);
  });

  test("runs high to low and faces the target", () => {
    const start = slashArcPoint(from, to, 0, new THREE.Vector3());
    const end = slashArcPoint(from, to, 1, new THREE.Vector3());
    expect(start.y).toBeGreaterThan(end.y);
    const behind = slashArcPoint(from, new THREE.Vector3(-3, 1, 0), 0.5, new THREE.Vector3());
    expect(behind.x).toBeLessThan(-0.6);
  });
});
