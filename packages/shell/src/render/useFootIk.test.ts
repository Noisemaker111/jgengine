import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { SceneRaycastHit, SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";
import { applyFootIk, resolveFootIkRig, type FootIkState } from "./useFootIk";
import { modelPlacementTransform } from "./modelRender";
import { measureLocalBounds } from "./measureBounds";
import { measureLocalCollisionTriangles } from "./measureCollisionMesh";

function ground(height: (x: number, z: number) => number, normal: readonly [number, number, number] = [0, 1, 0]) {
  const calls: SceneRaycastInput[] = [];
  const probe = (input: SceneRaycastInput): SceneRaycastHit | null => {
    calls.push(input);
    const y = height(input.origin[0], input.origin[2]);
    if (input.origin[1] - y > input.maxDistance || input.origin[1] < y) return null;
    return {
      targetKind: "terrain",
      instanceId: "terrain",
      colliderName: "ground",
      purpose: "physical",
      damageEligible: false,
      blocks: true,
      distance: input.origin[1] - y,
      point: [input.origin[0], y, input.origin[2]],
      normal,
    };
  };
  return { probe, calls };
}

const LEG = Math.hypot(0.5, 0.02) + Math.hypot(0.45, 0.02);

/** Hips at 1, two slightly bent 0.5 + 0.45 legs, and an ankle 0.05 above the sole. */
function syntheticRig() {
  const scene = new THREE.Group();
  const hips = new THREE.Object3D();
  hips.name = "hips";
  hips.position.y = 1;
  scene.add(hips);
  for (const [side, x] of [["L", 0.15], ["R", -0.15]] as const) {
    const thigh = new THREE.Object3D();
    thigh.name = `Thigh_${side}`;
    thigh.position.x = x;
    const shin = new THREE.Object3D();
    shin.name = `Shin_${side}`;
    shin.position.set(0, -0.5, 0.02);
    const foot = new THREE.Object3D();
    foot.name = `Foot_${side}`;
    foot.position.set(0, -0.45, -0.02);
    hips.add(thigh);
    thigh.add(shin);
    shin.add(foot);
  }
  scene.updateMatrixWorld(true);
  const config = {
    feet: [
      { root: "Thigh_L", mid: "Shin_L", tip: "Foot_L" },
      { root: "Thigh_R", mid: "Shin_R", tip: "Foot_R" },
    ],
  };
  const rig = resolveFootIkRig(scene, config)!;
  for (const leg of rig.legs) leg.ankleRatio = 0.05 / LEG;
  return { scene, rig };
}

const world = (scene: THREE.Object3D, name: string) => scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
const settle = (run: (state: FootIkState) => void) => {
  const state: FootIkState = { weight: 0, pelvis: 0 };
  for (let i = 0; i < 90; i += 1) run(state);
  return state;
};

describe("applyFootIk", () => {
  test("flat ground leaves the authored stance in place", () => {
    const { scene, rig } = syntheticRig();
    const before = world(scene, "Foot_L");
    settle((state) => applyFootIk(rig, 0, ground(() => 0).probe, state, 1 / 60));
    expect(world(scene, "Foot_L").distanceTo(before)).toBeLessThan(1e-4);
    expect(world(scene, "hips").y).toBeCloseTo(1, 4);
  });

  test("on a step the high foot rises, the pelvis drops for the low foot, and bones keep their length", () => {
    const { scene, rig } = syntheticRig();
    const { probe } = ground((x) => (x > 0 ? 0.12 : -0.1));
    settle((state) => applyFootIk(rig, 0, probe, state, 1 / 60));
    expect(world(scene, "Foot_L").y).toBeCloseTo(0.17, 2);
    expect(world(scene, "Foot_R").y).toBeCloseTo(-0.05, 2);
    expect(world(scene, "hips").y).toBeCloseTo(0.9, 2);
    expect(world(scene, "Thigh_L").distanceTo(world(scene, "Shin_L"))).toBeCloseTo(Math.hypot(0.5, 0.02), 6);
    expect(world(scene, "Shin_L").distanceTo(world(scene, "Foot_L"))).toBeCloseTo(Math.hypot(0.45, 0.02), 6);
  });

  test("a bone no clip animates does not accumulate the correction across frames", () => {
    const { scene, rig } = syntheticRig();
    const { probe } = ground((x) => (x > 0 ? 0.12 : -0.1));
    const state = settle((next) => applyFootIk(rig, 0, probe, next, 1 / 60));
    const hips = world(scene, "hips").y;
    const foot = world(scene, "Foot_L");
    for (let i = 0; i < 30; i += 1) applyFootIk(rig, 0, probe, state, 1 / 60);
    expect(world(scene, "hips").y).toBeCloseTo(hips, 6);
    expect(world(scene, "Foot_L").distanceTo(foot)).toBeLessThan(1e-6);
  });

  test("airborne feet fade the correction out", () => {
    const { scene, rig } = syntheticRig();
    const { probe } = ground((x) => (x > 0 ? -0.3 : -0.7));
    const state = settle((next) => applyFootIk(rig, 0, probe, next, 1 / 60));
    expect(state.weight).toBeLessThan(1e-3);
    expect(world(scene, "hips").y).toBeCloseTo(1, 4);
  });

  test("probes start above the foot and scale with leg length", () => {
    const { rig } = syntheticRig();
    const { probe, calls } = ground(() => 0);
    applyFootIk(rig, 0, probe, { weight: 0, pelvis: 0 }, 1 / 60);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.direction).toEqual([0, -1, 0]);
    expect(calls[0]!.origin[1]).toBeCloseTo(0.05 + LEG / 2, 6);
    expect(calls[0]!.maxDistance).toBeCloseTo(LEG * 2, 6);
  });

  test("a rig without legs resolves to null", () => {
    expect(resolveFootIkRig(new THREE.Group(), "auto")).toBeNull();
  });
});

async function loadKnight(): Promise<GLTF> {
  const file = fileURLToPath(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
  const bytes = readFileSync(file);
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function placeModelScene(content: THREE.Object3D, model: import("@jgengine/core/game/playableGame").ModelConfig): THREE.Group {
  const root = new THREE.Group().add(content);
  const transform = modelPlacementTransform(root, model);
  root.scale.setScalar(transform.scale);
  root.position.fromArray(transform.position);
  return root;
}

describe("foot IK on a KayKit Knight", () => {
  test("a transformed imported rig normalizes once and keeps mixer, bind collision and IK in the placement frame", async () => {
    const gltf = await loadKnight();
    const content = gltf.scene;
    content.position.set(4, 6, -3);
    content.scale.setScalar(3);
    content.rotation.y = 0.7;
    const placement = placeModelScene(content, { url: "Knight.glb", targetHeight: 1.8, scale: 1.2, y: 0.15 });
    const raw = measureLocalBounds(placement)!;
    expect((raw.max[1] - raw.min[1]) * placement.scale.y).toBeCloseTo(2.16, 6);
    expect(raw.min[1] * placement.scale.y + placement.position.y).toBeCloseTo(0.15, 6);
    const triangles = measureLocalCollisionTriangles(placement, { scale: placement.scale.y, offset: placement.position.toArray() })!;
    let lowestVertex = Infinity;
    for (let index = 1; index < triangles.positions.length; index += 3) lowestVertex = Math.min(lowestVertex, triangles.positions[index]!);
    expect(lowestVertex).toBeCloseTo(0.15, 5);

    const entity = new THREE.Group();
    entity.position.set(-2, 1.2, 5);
    entity.rotation.y = -0.3;
    entity.add(placement);
    entity.updateMatrixWorld(true);
    const rig = resolveFootIkRig(placement, "auto")!;
    const mixer = new THREE.AnimationMixer(content);
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!).play();
    const state: FootIkState = { weight: 1, pelvis: 0 };
    let lowestSole = Infinity;
    let highestSole = -Infinity;
    for (const entityY of [1.2, 2.5, 1.2]) {
      entity.position.y = entityY;
      const groundY = entityY + 0.15;
      for (let frame = 0; frame < 60; frame += 1) {
        mixer.update(1 / 60);
        entity.updateMatrixWorld(true);
        applyFootIk(rig, groundY, ground(() => groundY).probe, state, 1 / 60);
        for (const leg of rig.legs) {
          const root = leg.root.getWorldPosition(new THREE.Vector3());
          const mid = leg.mid.getWorldPosition(new THREE.Vector3());
          const tip = leg.tip.getWorldPosition(new THREE.Vector3());
          const sole = tip.y - leg.ankleRatio * (root.distanceTo(mid) + mid.distanceTo(tip)) - groundY;
          lowestSole = Math.min(lowestSole, sole);
          highestSole = Math.max(highestSole, sole);
        }
      }
    }
    expect(lowestSole).toBeGreaterThan(-0.005);
    expect(highestSole).toBeLessThan(0.25);
    expect(content.position.toArray()).toEqual([4, 6, -3]);
    expect(content.scale.toArray()).toEqual([3, 3, 3]);
  });

  test("auto finds both legs and measures the rest ankle height from the skin", async () => {
    const gltf = await loadKnight();
    const rig = resolveFootIkRig(gltf.scene, "auto")!;
    expect(rig.legs.map((leg) => [leg.root.name, leg.mid.name, leg.tip.name])).toEqual([
      ["upperlegl", "lowerlegl", "footl"],
      ["upperlegr", "lowerlegr", "footr"],
    ]);
    expect(rig.pelvis?.name).toBe("hips");
    for (const leg of rig.legs) expect(leg.ankleRatio).toBeGreaterThan(0.1);
  });

  test("walking on flat ground and a slope never leaves a sole under the ground", async () => {
    const gltf = await loadKnight();
    const scene = gltf.scene;
    const rig = resolveFootIkRig(scene, "auto")!;
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!).play();
    const legLength = (leg: (typeof rig.legs)[number]) =>
      leg.root.getWorldPosition(new THREE.Vector3()).distanceTo(leg.mid.getWorldPosition(new THREE.Vector3())) +
      leg.mid.getWorldPosition(new THREE.Vector3()).distanceTo(leg.tip.getWorldPosition(new THREE.Vector3()));

    for (const slope of [0, 0.2]) {
      const height = (_x: number, z: number) => z * slope;
      const { probe } = ground(height);
      const state: FootIkState = { weight: 1, pelvis: 0 };
      let lowestSole = Infinity;
      let lowestRawSole = Infinity;
      for (let frame = 0; frame < 120; frame += 1) {
        mixer.update(1 / 60);
        scene.updateMatrixWorld(true);
        for (const leg of rig.legs) {
          const tip = leg.tip.getWorldPosition(new THREE.Vector3());
          lowestRawSole = Math.min(lowestRawSole, tip.y - leg.ankleRatio * legLength(leg) - height(tip.x, tip.z));
        }
        applyFootIk(rig, 0, probe, state, 1 / 60);
        for (const leg of rig.legs) {
          const tip = leg.tip.getWorldPosition(new THREE.Vector3());
          lowestSole = Math.min(lowestSole, tip.y - leg.ankleRatio * legLength(leg) - height(tip.x, tip.z));
        }
      }
      expect(lowestRawSole).toBeLessThan(-0.005);
      expect(lowestSole).toBeGreaterThan(-0.005);
    }
  });
});
