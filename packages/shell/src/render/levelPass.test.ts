import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";
import {
  assignVariantLevels,
  createLevelPassGate,
  levelEdgeMargin,
  levelPassNeeded,
  levelPassProbe,
  noteLevelPass,
  noteLevelPassFrame,
  resetLevelPassStats,
  variantSwitchOf,
} from "./levelPass";

const PALM = {
  levels: [{ url: "mainsail-palm.glb", maxDistance: 60 }, { url: "mainsail-palm-lod1.glb" }],
};

function palm(id: string, z: number): SceneObject {
  return { instanceId: id, catalogId: "obj_palm", position: [0, 0, z], rotationY: 0 };
}

/** One frame of the batch level pass as `VariantStaticObjects` runs it, with the probe counters. */
function driveFrame(options: {
  camera: THREE.Vector3;
  selector: ReturnType<typeof createModelVariantSelector>;
  variantSwitch: ReturnType<typeof variantSwitchOf>;
  objects: readonly SceneObject[];
  into: Map<string, number>;
  gate: ReturnType<typeof createLevelPassGate>;
  probe: THREE.Vector3;
  count: boolean;
}): void {
  const { camera, selector, variantSwitch, objects, into, gate, probe, count } = options;
  if (count) noteLevelPassFrame();
  if (!gate.needsPass(camera)) {
    if (count) noteLevelPass(false);
    return;
  }
  const margin = assignVariantLevels(selector, variantSwitch, objects, () => null, camera, into, probe);
  gate.record(camera, margin);
  if (count) noteLevelPass(true);
}

describe("variant level edge margin", () => {
  test("measures to the level's own edge plus hysteresis, and to the level below's edge minus it", () => {
    const variantSwitch = variantSwitchOf(PALM);
    expect(variantSwitch).toEqual({ boundaries: [60], hysteresis: 6 });
    expect(levelEdgeMargin(20, 0, variantSwitch)).toBe(46);
    expect(levelEdgeMargin(66, 0, variantSwitch)).toBe(0);
    expect(levelEdgeMargin(200, 1, variantSwitch)).toBe(146);
    expect(levelEdgeMargin(54, 1, variantSwitch)).toBe(0);
  });

  test("a model that declares its own hysteresis moves the edge", () => {
    const variantSwitch = variantSwitchOf({ ...PALM, hysteresis: 2 });
    expect(levelEdgeMargin(20, 0, variantSwitch)).toBe(42);
    expect(levelEdgeMargin(20, 1, variantSwitch)).toBe(38);
  });
});

describe("level pass skip gate", () => {
  test("a still camera runs the pass once and skips every frame after it", () => {
    const gate = createLevelPassGate();
    const camera = new THREE.Vector3(0, 0, 0);
    expect(gate.needsPass(camera)).toBe(true);
    gate.record(camera, 46);
    let runs = 0;
    for (let frame = 0; frame < 120; frame += 1) if (gate.needsPass(camera)) runs += 1;
    expect(runs).toBe(0);
  });

  test("a camera that moves less than its nearest switch edge still skips", () => {
    const gate = createLevelPassGate();
    const camera = new THREE.Vector3(0, 0, 0);
    gate.record(camera, 46);
    camera.set(0, 0, 45.9);
    expect(gate.needsPass(camera)).toBe(false);
    camera.set(0, 0, 46);
    expect(gate.needsPass(camera)).toBe(true);
  });

  test("an instance sitting on its edge runs every frame", () => {
    const camera = new THREE.Vector3(0, 0, 0);
    expect(levelPassNeeded(camera, new THREE.Vector3(0, 0, 0), 0)).toBe(true);
  });
});

describe("level pass probe", () => {
  test("a still camera reports one pass over the frames, a walking camera reports the passes it needed", () => {
    resetLevelPassStats();
    const variantSwitch = variantSwitchOf(PALM);
    const objects = [palm("near", 20), palm("far", 200)];
    const gate = createLevelPassGate();
    const into = new Map<string, number>();
    const probe = new THREE.Vector3();
    const camera = new THREE.Vector3(0, 0, 0);
    const still = createModelVariantSelector(PALM);

    for (let frame = 0; frame < 100; frame += 1) {
      driveFrame({ camera, selector: still, variantSwitch, objects, into, gate, probe, count: true });
    }
    expect(levelPassProbe().counters!()).toMatchObject({ levelPasses: 1, levelPassSkips: 99, levelPassFrames: 100 });
    expect(levelPassProbe().counters!().levelPassesPerFrame).toBe(0.01);
    expect([...into.values()]).toEqual([0, 1]);

    resetLevelPassStats();
    const walking = createModelVariantSelector(PALM);
    const walkGate = createLevelPassGate();
    const walked = new Map<string, number>();
    const walkCamera = new THREE.Vector3(0, 0, 0);
    // 200 m toward the palms at 1 m a frame: the pass re-runs only when the camera closes on an edge.
    for (let frame = 0; frame <= 200; frame += 1) {
      walkCamera.set(0, 0, frame);
      driveFrame({ camera: walkCamera, selector: walking, variantSwitch, objects, into: walked, gate: walkGate, probe, count: true });
    }
    const counters = levelPassProbe().counters!();
    expect(counters.levelPasses).toBeGreaterThan(1);
    expect(counters.levelPasses).toBeLessThan(50);
    expect(counters.levelPassSkips).toBe(counters.levelPassFrames! - counters.levelPasses!);
    // The near palm is behind the camera at 200 m, the far one is 0 m away: both answers moved.
    expect([...walked.values()]).toEqual([1, 0]);
  });
});

describe("level pass invariance", () => {
  test("a scripted camera walk assigns every instance the same level with and without the skip", () => {
    const variantSwitch = variantSwitchOf(PALM);
    const objects = [
      palm("a", 0), palm("b", 20), palm("c", 40), palm("d", 60),
      palm("e", 66), palm("f", 90), palm("g", 130), palm("h", 300),
    ];
    const skipped = createModelVariantSelector(PALM);
    const reference = createModelVariantSelector(PALM);
    const skippedLevels = new Map<string, number>();
    const referenceLevels = new Map<string, number>();
    const gate = createLevelPassGate();
    const probe = new THREE.Vector3();
    const camera = new THREE.Vector3(0, 0, 0);

    let passes = 0;
    let flips = 0;
    const previous = new Map<string, number>();
    for (let frame = 0; frame <= 1000; frame += 1) {
      camera.set(0, 0, -60 + frame * 0.2);
      if (gate.needsPass(camera)) {
        gate.record(camera, assignVariantLevels(skipped, variantSwitch, objects, () => null, camera, skippedLevels, probe));
        passes += 1;
      }
      assignVariantLevels(reference, variantSwitch, objects, () => null, camera, referenceLevels, probe);
      for (const [id, level] of referenceLevels) {
        expect(skippedLevels.get(id)).toBe(level);
        if (previous.get(id) !== level) flips += 1;
        previous.set(id, level);
      }
    }

    expect(flips).toBeGreaterThan(0);
    expect(passes).toBeLessThan(1001);
  });
});
