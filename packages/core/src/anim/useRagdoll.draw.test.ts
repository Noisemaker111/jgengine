import { describe, expect, test } from "bun:test";
import { createElement } from "@jgengine/core/ui/jsx";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { KAYKIT_SCHEME, mapRigToStandard } from "@jgengine/core/anim/skeletonStandard";
import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import { useRagdoll } from "./useRagdoll.draw";
import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 20, 20] as const };

async function loadKnight() {
  const bytes = readFileSync(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

/** The standard map for a loaded rig, from the bone names actually in the scene. */
function rigMap(scene: THREE.Object3D) {
  const names: string[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone === true) names.push(object.name);
  });
  return mapRigToStandard(names, KAYKIT_SCHEME);
}

async function ragdollHarness(scene: THREE.Object3D, world: PhysicsWorld, map: ReturnType<typeof rigMap>) {
  let mounted: MountedTestDraws | undefined;
  function Model({ active }: { active: boolean }) {
    useRagdoll(scene, { map, world, active });
    return null;
  }
  const render = async (active: boolean) => {
    if (mounted === undefined) {
      mounted = await mountTestDraws(createElement(Model, { active }), { width: 100, height: 100 });
    } else {
      await mounted.render(createElement(Model, { active }));
    }
  };
  const frames = async (count: number) => {
    for (let frame = 0; frame < count; frame++) await mounted!.advance(1 / 60);
  };
  return {
    render,
    frames,
    unmount: async () => {
      await mounted?.unmount();
    },
  };
}

const worldOf = (name: string, scene: THREE.Object3D) => scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

describe("useRagdoll", () => {
  test("arming drives the rig's bones from the physics bodies and drops the body to the floor", async () => {
    const gltf = await loadKnight();
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const map = rigMap(scene);
    expect(map.missing).toEqual([]);
    const world = new PhysicsWorld({ capacity: 64, bounds: BOUNDS, sleepThresholdSteps: 100000 });
    const headBefore = worldOf("head", scene);
    const h = await ragdollHarness(scene, world, map);
    try {
      await h.render(true);
      expect(world.jointCount).toBeGreaterThan(10);
      await h.frames(240);
      const headAfter = worldOf("head", scene);
      expect(headAfter.y).toBeLessThan(headBefore.y - 0.4);
      // The skeleton stays one piece: every mapped bone is still within a body-length of the hips.
      const hips = worldOf("hips", scene);
      for (const slot of Object.keys(map.slots) as (keyof typeof map.slots)[]) {
        const bone = scene.getObjectByName(map.slots[slot]!)!;
        const point = bone.getWorldPosition(new THREE.Vector3());
        expect(point.distanceTo(hips)).toBeLessThan(1.6);
      }
    } finally {
      await h.unmount();
    }
  });

  test("disarming removes the bodies and leaves the rig where the ragdoll put it", async () => {
    const gltf = await loadKnight();
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const world = new PhysicsWorld({ capacity: 64, bounds: BOUNDS, sleepThresholdSteps: 100000 });
    const h = await ragdollHarness(scene, world, rigMap(scene));
    try {
      await h.render(true);
      await h.frames(60);
      expect(world.jointCount).toBeGreaterThan(0);
      const fallen = worldOf("head", scene);
      await h.render(false);
      expect(world.jointCount).toBe(0);
      expect(worldOf("head", scene).distanceTo(fallen)).toBeLessThan(1e-6);
    } finally {
      await h.unmount();
    }
  });

  test("a rig with no mapped bones arms nothing instead of throwing", async () => {
    const gltf = await loadKnight();
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const world = new PhysicsWorld({ capacity: 64, bounds: BOUNDS, sleepThresholdSteps: 100000 });
    const empty = mapRigToStandard(["nothing"], KAYKIT_SCHEME);
    const h = await ragdollHarness(scene, world, empty);
    try {
      await h.render(true);
      await h.frames(30);
      expect(world.jointCount).toBe(0);
    } finally {
      await h.unmount();
    }
  });
});
