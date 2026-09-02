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

  test("solves a configured foot chain against the scene raycast", () => {
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
          point: [0.15, -0.2, 0],
          normal: [0.45, 0.89, 0],
        };
      },
      1,
    );

    expect(grounded).toBe(true);
    expect(input).toMatchObject({ direction: [0, -1, 0], maxDistance: 2, filter: { terrain: true } });
    expect(tip.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(-0.2, 3);
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
