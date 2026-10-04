import { describe, expect, test } from "bun:test";
import { act, createRoot, type RootStore } from "@react-three/fiber";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { SceneRaycastHit, SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";
import { applyFootIk, resolveFootIkRig, useFootIk, type FootIkState } from "./useFootIk";
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

function diagnostics(run: () => void): string[] {
  const messages: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => messages.push(String(message));
  try {
    run();
  } finally {
    console.warn = warn;
  }
  return messages;
}

describe("resolveFootIkRig diagnostics", () => {
  test("missing and ambiguous names explain why their chains cannot be applied", () => {
    const { scene } = syntheticRig();
    const duplicate = new THREE.Object3D();
    duplicate.name = "Thigh_L";
    scene.add(duplicate);
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [{ root: "Thigh_L", mid: "Shin_L", tip: "absent" }] })).toBeNull();
    });
    expect(messages.some((message) => message.includes('"Thigh_L" matches multiple objects'))).toBe(true);
    expect(messages.some((message) => message.includes('"absent" was not found'))).toBe(true);
  });

  test("overlapping chains are corrected only once", () => {
    const { scene } = syntheticRig();
    const chain = { root: "Thigh_L", mid: "Shin_L", tip: "Foot_L" };
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [chain, chain] })!.legs).toHaveLength(1);
    });
    expect(messages[0]).toContain("already corrected by another foot chain");
  });

  test("imported-name aliases retain ambiguity, ancestry and overlap validation", () => {
    const { scene } = syntheticRig();
    scene.traverse((object) => { object.userData.name = `authored.${object.name}`; });
    const left = { root: "authored.Thigh_L", mid: "authored.Shin_L", tip: "authored.Foot_L" };
    const duplicate = new THREE.Object3D();
    duplicate.name = "otherThigh";
    duplicate.userData.name = left.root;
    scene.add(duplicate);
    const ambiguous = diagnostics(() => { expect(resolveFootIkRig(scene, { feet: [left] })).toBeNull(); });
    expect(ambiguous[0]).toContain("matches multiple original imported names");
    scene.remove(duplicate);
    const head = new THREE.Object3D();
    head.name = "HeadRuntime";
    head.userData.name = "head.authored";
    scene.getObjectByName("hips")!.add(head);
    expect(diagnostics(() => {
      const rig = resolveFootIkRig(scene, { feet: [left], pelvis: "authored.hips", lookAt: { bone: "head.authored" } })!;
      expect(rig.pelvis).toBe(scene.getObjectByName("hips")!);
      expect(rig.head).toBe(head);
    })).toEqual([]);
    const disconnected = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [{ ...left, mid: "authored.Shin_R", tip: "authored.Foot_R" }] })).toBeNull();
    });
    expect(disconnected[0]).toContain("each joint must descend");
    const overlapping = diagnostics(() => { expect(resolveFootIkRig(scene, { feet: [left, left] })!.legs).toHaveLength(1); });
    expect(overlapping[0]).toContain("already corrected");
    duplicate.name = "Thigh_L";
    duplicate.userData.name = "differentOriginalName";
    scene.add(duplicate);
    const runtimeAmbiguous = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [{ ...left, root: "Thigh_L" }] })).toBeNull();
    });
    expect(runtimeAmbiguous[0]).toContain('"Thigh_L" matches multiple objects');
  });

  test("descendant joints separated by helper transforms remain supported", () => {
    const { scene } = syntheticRig();
    const thigh = scene.getObjectByName("Thigh_L")!;
    const shin = scene.getObjectByName("Shin_L")!;
    const helper = new THREE.Object3D();
    thigh.add(helper);
    helper.add(shin);
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [{ root: "Thigh_L", mid: "Shin_L", tip: "Foot_L" }] })!.legs).toHaveLength(1);
    });
    expect(messages).toEqual([]);
  });

  test("automatic pelvis contains both leg branches instead of moving only the first", () => {
    const { scene } = syntheticRig();
    for (const side of ["L", "R"]) {
      const thigh = scene.getObjectByName(`Thigh_${side}`)!;
      const branch = new THREE.Object3D();
      thigh.parent!.add(branch);
      branch.add(thigh);
    }
    const rig = resolveFootIkRig(scene, { feet: [
      { root: "Thigh_L", mid: "Shin_L", tip: "Foot_L" },
      { root: "Thigh_R", mid: "Shin_R", tip: "Foot_R" },
    ] })!;
    expect(rig.pelvis?.name).toBe("hips");
  });

  test("missing pelvis and look-at names are reported without disabling valid feet", () => {
    const { scene } = syntheticRig();
    const messages = diagnostics(() => {
      const rig = resolveFootIkRig(scene, { feet: [{ root: "Thigh_L", mid: "Shin_L", tip: "Foot_L" }], pelvis: "absentHips", lookAt: { bone: "absentHead" } })!;
      expect(rig.legs).toHaveLength(1);
      expect(rig.pelvis).toBeNull();
      expect(rig.head).toBeNull();
    });
    expect(messages.some((message) => message.includes('Look-at bone "absentHead"'))).toBe(true);
    expect(messages.some((message) => message.includes('Pelvis "absentHips"'))).toBe(true);
  });

  test("look-at-only configuration does not report absent legs", () => {
    const scene = new THREE.Group();
    const head = new THREE.Object3D();
    head.name = "head";
    scene.add(head);
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [], lookAt: { bone: "head" } })!.head).toBe(head);
    });
    expect(messages).toEqual([]);
  });
});

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
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(new THREE.Group(), "auto")).toBeNull();
    });
    expect(messages[0]).toContain("No thigh → shin → foot chain was recognized");
  });
});

async function loadKnight(name = "Knight"): Promise<GLTF> {
  const file = fileURLToPath(new URL(`../../../../apps/dev/public/models/kaykit-adventurers/${name}.glb`, import.meta.url));
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

async function footIkHarness(scene: THREE.Object3D) {
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  const ctx = { scene: { raycast: ground((x) => x > 0 ? 0.12 : -0.1).probe } } as unknown as import("@jgengine/core/runtime/gameContextTypes").GameContext;
  let store: RootStore;
  function Model({ config }: { config: import("@jgengine/core/game/playableGame").ModelConfig["ik"] }) {
    useFootIk(scene, config, ctx, "hero");
    return createElement("primitive", { object: scene });
  }
  const render = async (config: import("@jgengine/core/game/playableGame").ModelConfig["ik"]) => {
    await act(async () => { store = root.render(createElement(Model, { config })); });
  };
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      const state = store.getState();
      state.advance(state.clock.elapsedTime + 1 / 60, false);
    }
  };
  return { render, frames, unmount: async () => {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previous;
  } };
}

describe("useFootIk lifecycle", () => {
  test("disabling IK restores untouched imported rig joints", async () => {
    const { scene } = await loadKnight();
    const hips = scene.getObjectByName("hips")!;
    const originalPosition = hips.position.clone();
    const originalRotation = scene.getObjectByName("upperlegl")!.quaternion.clone();
    const h = await footIkHarness(scene);
    try {
      await h.render("auto");
      h.frames(90);
      expect(hips.position.distanceTo(originalPosition)).toBeGreaterThan(0.05);
      await h.render(undefined);
      expect(hips.position.distanceTo(originalPosition)).toBeLessThan(1e-6);
      expect(scene.getObjectByName("upperlegl")!.quaternion.angleTo(originalRotation)).toBeLessThan(1e-6);
      await h.render("auto");
      h.frames(1);
      expect(hips.position.distanceTo(originalPosition)).toBeGreaterThan(0);
      expect(hips.position.distanceTo(originalPosition)).toBeLessThan(0.01);
    } finally {
      await h.unmount();
    }
  });

  test("replacing chains restores joints no longer corrected and resets smoothing", async () => {
    const { scene } = await loadKnight();
    const leftThigh = scene.getObjectByName("upperlegl")!;
    const originalRotation = leftThigh.quaternion.clone();
    const hips = scene.getObjectByName("hips")!;
    const originalPosition = hips.position.clone();
    const h = await footIkHarness(scene);
    try {
      await h.render("auto");
      h.frames(90);
      expect(leftThigh.quaternion.angleTo(originalRotation)).toBeGreaterThan(0.01);
      await h.render({ feet: [{ root: "upperlegr", mid: "lowerlegr", tip: "footr" }] });
      h.frames(1);
      expect(leftThigh.quaternion.angleTo(originalRotation)).toBeLessThan(1e-6);
      expect(hips.position.distanceTo(originalPosition)).toBeLessThan(0.01);
    } finally {
      await h.unmount();
    }
  });

  test("unmount restores IK writes while preserving a newer animation pose", async () => {
    const { scene } = await loadKnight();
    const leftThigh = scene.getObjectByName("upperlegl")!;
    const originalRotation = leftThigh.quaternion.clone();
    const hips = scene.getObjectByName("hips")!;
    const h = await footIkHarness(scene);
    await h.render("auto");
    h.frames(90);
    hips.position.set(0.1, 1.3, -0.2);
    await h.unmount();
    expect(leftThigh.quaternion.angleTo(originalRotation)).toBeLessThan(1e-6);
    expect(hips.position.toArray()).toEqual([0.1, 1.3, -0.2]);
  });
});

function placeModelScene(content: THREE.Object3D, model: import("@jgengine/core/game/playableGame").ModelConfig): THREE.Group {
  const root = new THREE.Group().add(content);
  const transform = modelPlacementTransform(root, model);
  root.scale.setScalar(transform.scale);
  root.position.fromArray(transform.position);
  return root;
}

describe("foot IK on a KayKit Knight", () => {
  for (const name of ["Knight", "Rogue"]) test(`${name}'s original authored leg names resolve to the same joints and walking corrections as runtime names`, async () => {
    const gltf = await loadKnight(name);
    const scene = clone(gltf.scene);
    const reference = clone(gltf.scene);
    const authoredFeet = ["l", "r"].map((side) => ({ root: `upperleg.${side}`, mid: `lowerleg.${side}`, tip: `foot.${side}` }));
    const runtimeFeet = ["l", "r"].map((side) => ({ root: `upperleg${side}`, mid: `lowerleg${side}`, tip: `foot${side}` }));
    let rig: ReturnType<typeof resolveFootIkRig> = null;
    expect(diagnostics(() => { rig = resolveFootIkRig(scene, { feet: authoredFeet }); })).toEqual([]);
    expect(rig).not.toBeNull();
    const resolved = rig!;
    const expected = resolveFootIkRig(reference, { feet: runtimeFeet })!;
    expect(resolved.legs).toHaveLength(2);
    for (const [index, leg] of resolved.legs.entries()) {
      expect(leg.root).toBe(scene.getObjectByName(runtimeFeet[index]!.root)!);
      expect(leg.mid).toBe(scene.getObjectByName(runtimeFeet[index]!.mid)!);
      expect(leg.tip).toBe(scene.getObjectByName(runtimeFeet[index]!.tip)!);
      expect(leg.root.userData.name).toBe(authoredFeet[index]!.root);
      expect(leg.tip.userData.name).toBe(authoredFeet[index]!.tip);
      expect(leg.ankleRatio).toBe(expected.legs[index]!.ankleRatio);
    }
    const mixers = [scene, reference].map((instance) => {
      const mixer = new THREE.AnimationMixer(instance);
      mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!).play();
      return mixer;
    });
    const states = [{ weight: 1, pelvis: 0 }, { weight: 1, pelvis: 0 }];
    const { probe } = ground((_x, z) => z * 0.2, [0, 1 / Math.sqrt(1.04), -0.2 / Math.sqrt(1.04)]);
    let maxPositionError = 0;
    let maxQuaternionError = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      for (const [index, instance] of [scene, reference].entries()) {
        mixers[index]!.update(1 / 60);
        instance.updateMatrixWorld(true);
        applyFootIk(index === 0 ? resolved : expected, 0, probe, states[index]!, 1 / 60);
      }
      for (const record of resolved.poses) {
        const other = reference.getObjectByName(record.bone.name)!;
        maxPositionError = Math.max(maxPositionError, record.bone.getWorldPosition(new THREE.Vector3()).distanceTo(other.getWorldPosition(new THREE.Vector3())));
        maxQuaternionError = Math.max(maxQuaternionError, ...record.bone.quaternion.toArray().map((value, index) => Math.abs(value - other.quaternion.toArray()[index]!)));
      }
    }
    expect(maxPositionError).toBeLessThan(1e-12);
    expect(maxQuaternionError).toBeLessThan(1e-12);
    expect(states[0]).toEqual(states[1]);
    for (const [index, instance] of [scene, reference].entries()) {
      mixers[index]!.stopAllAction();
      mixers[index]!.uncacheRoot(instance);
    }
  });

  test("a cross-leg configuration cannot deform an imported Knight", async () => {
    const { scene } = await loadKnight();
    const before: number[][] = [];
    scene.traverse((object) => before.push(object.quaternion.toArray()));
    const messages = diagnostics(() => {
      expect(resolveFootIkRig(scene, { feet: [{ root: "upperlegl", mid: "lowerlegr", tip: "footr" }] })).toBeNull();
    });
    const after: number[][] = [];
    scene.traverse((object) => after.push(object.quaternion.toArray()));
    expect(after).toEqual(before);
    expect(messages[0]).toContain('"upperlegl" → "lowerlegr" → "footr"');
    expect(messages[0]).toContain("each joint must descend");
    expect(messages[0]).toContain("Available bones include:");
  });

  test("Rogue resolves without diagnostics and keeps walking soles above a slope", async () => {
    const { scene, animations } = await loadKnight("Rogue");
    let rig: ReturnType<typeof resolveFootIkRig> = null;
    expect(diagnostics(() => { rig = resolveFootIkRig(scene, "auto"); })).toEqual([]);
    const resolved = rig!;
    expect(resolved.legs).toHaveLength(2);
    expect(resolved.pelvis?.name).toBe("hips");
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(THREE.AnimationClip.findByName(animations, "Walking_A")!).play();
    const state: FootIkState = { weight: 1, pelvis: 0 };
    const { probe } = ground((_x, z) => z * 0.2);
    let lowestSole = Infinity;
    for (let frame = 0; frame < 120; frame += 1) {
      mixer.update(1 / 60);
      scene.updateMatrixWorld(true);
      applyFootIk(resolved, 0, probe, state, 1 / 60);
      for (const leg of resolved.legs) {
        const root = leg.root.getWorldPosition(new THREE.Vector3());
        const mid = leg.mid.getWorldPosition(new THREE.Vector3());
        const tip = leg.tip.getWorldPosition(new THREE.Vector3());
        const length = root.distanceTo(mid) + mid.distanceTo(tip);
        lowestSole = Math.min(lowestSole, tip.y - leg.ankleRatio * length - tip.z * 0.2);
      }
    }
    expect(lowestSole).toBeGreaterThan(-0.005);
  });
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
