import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { applyFootIk } from "./useFootIk";

describe("applyFootIk", () => {
  test("accepts a deterministic KayKit slope adopter config", () => {
    const model: ModelConfig = {
      url: "/models/kaykit-adventurers/Knight.glb",
      animation: { states: { idle: "Idle", walk: "Walking_A", run: "Running_A" } },
      ik: {
        feet: [
          { root: "mixamorigLeftUpLeg", mid: "mixamorigLeftLeg", tip: "mixamorigLeftFoot" },
          { root: "mixamorigRightUpLeg", mid: "mixamorigRightLeg", tip: "mixamorigRightFoot" },
        ],
      },
    };
    expect(model.ik?.feet).toHaveLength(2);
    expect(model.url).toContain("kaykit-adventurers");
  });

  test.each([
    { name: "reaches a reachable terrain target", target: [0.15, 0.2, 0.1] as const },
    { name: "clamps an unreachable terrain target to the leg length", target: [0.15, -0.2, 0] as const },
  ])("$name without stretching either bone", ({ target }) => {
    const scene = new THREE.Object3D();
    const root = new THREE.Object3D();
    root.name = "thigh";
    root.position.y = 1;
    const mid = new THREE.Object3D();
    mid.name = "shin";
    mid.position.y = -0.5;
    const tip = new THREE.Object3D();
    tip.name = "foot";
    tip.position.y = -0.5;
    scene.add(root);
    root.add(mid);
    mid.add(tip);

    let input: unknown;
    const grounded = applyFootIk(
      scene,
      { feet: [{ root: "thigh", mid: "shin", tip: "foot" }] },
      (next) => {
        input = next;
        return {
          targetKind: "terrain",
          instanceId: "terrain",
          colliderName: "ground",
          purpose: "physical",
          damageEligible: false,
          blocks: true,
          distance: 0.75,
          point: target,
          normal: [0.45, 0.89, 0],
        };
      },
      1,
    );

    expect(grounded).toBe(true);
    expect(input).toMatchObject({ direction: [0, -1, 0], maxDistance: 2, filter: { terrain: true } });
    const rootPosition = root.getWorldPosition(new THREE.Vector3());
    const midPosition = mid.getWorldPosition(new THREE.Vector3());
    const tipPosition = tip.getWorldPosition(new THREE.Vector3());
    const targetPosition = new THREE.Vector3(...target);
    const direction = targetPosition.clone().sub(rootPosition);
    const expectedTip = rootPosition.clone().add(direction.clone().normalize().multiplyScalar(Math.min(1, direction.length())));
    expect(tipPosition.distanceTo(expectedTip)).toBeLessThan(1e-6);
    expect(rootPosition.toArray()).toEqual([0, 1, 0]);
    expect(rootPosition.distanceTo(midPosition)).toBeCloseTo(0.5, 6);
    expect(midPosition.distanceTo(tipPosition)).toBeCloseTo(0.5, 6);
    expect(mid.position.toArray()).toEqual([0, -0.5, 0]);
    expect(tip.position.toArray()).toEqual([0, -0.5, 0]);
  });

  test("does not mutate a rig when the ray misses", () => {
    const scene = new THREE.Object3D();
    const root = new THREE.Object3D();
    root.name = "thigh";
    scene.add(root);
    const before = root.quaternion.clone();
    expect(applyFootIk(scene, { feet: [{ root: "thigh", mid: "shin", tip: "foot" }] }, () => null, 1)).toBe(false);
    expect(root.quaternion.equals(before)).toBe(true);
  });
});
