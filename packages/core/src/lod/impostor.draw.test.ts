import { expect, test } from "bun:test";

import * as THREE from "three";

import { acquireImpostor, hemiOctDecode, hemiOctEncode, impostorDistance, impostorSettingsForQuality, impostorSwitch, impostorUp, releaseImpostor } from "./impostor.draw";

/** A renderer that only counts the bake's draws: enough to see whether a bake happened. */
function countingRenderer(): { renderer: THREE.WebGLRenderer; draws: () => number } {
  let draws = 0;
  const known: Record<string, unknown> = {
    shadowMap: { autoUpdate: true },
    autoClear: true,
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    getRenderTarget: () => null,
    render: () => {
      draws += 1;
    },
  };
  const renderer = new Proxy(known, { get: (target, name) => (typeof name === "string" && name in target ? target[name] : () => undefined) });
  return { renderer: renderer as unknown as THREE.WebGLRenderer, draws: () => draws };
}

test("an impostor whose batches all leave is kept for the next one, and freed once its model is disposed", async () => {
  const { renderer, draws } = countingRenderer();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const sources = [{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() }];
  const settings = { frames: 2, cell: 8 };
  const first = acquireImpostor("kept-tree", renderer, sources, settings);
  await first.ready;
  expect(first.baked).toBe(true);
  const baked = draws();
  expect(baked).toBeGreaterThan(0);
  releaseImpostor("kept-tree", renderer, settings);
  // A grove burnt down and regrown long after: the same bake, no draws, links or render targets.
  expect(acquireImpostor("kept-tree", renderer, sources, settings)).toBe(first);
  expect(draws()).toBe(baked);

  let freed = false;
  first.materials?.material.addEventListener("dispose", () => {
    freed = true;
  });
  geometry.dispose();
  expect(freed, "a model disposed while a batch still draws its impostor keeps it until that batch goes").toBe(false);
  releaseImpostor("kept-tree", renderer, settings);
  expect(freed).toBe(true);
  const again = acquireImpostor("kept-tree", renderer, sources, settings);
  expect(again).not.toBe(first);
  await again.ready;
  expect(draws()).toBeGreaterThan(baked);
  releaseImpostor("kept-tree", renderer, settings);
});

test("a remounted canvas bakes its own impostor, and the old renderer's unused bake is freed", async () => {
  // The atlas is a render target of the context that baked it; Beacon Bastion's far trees vanished
  // after a renderer switch because the new canvas drew the old, lost context's atlas.
  const old = countingRenderer();
  const fresh = countingRenderer();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const sources = [{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() }];
  const settings = { frames: 2, cell: 8 };
  const first = acquireImpostor("remounted-tree", old.renderer, sources, settings);
  await first.ready;
  let freed = false;
  first.materials?.material.addEventListener("dispose", () => {
    freed = true;
  });
  releaseImpostor("remounted-tree", old.renderer, settings);
  const second = acquireImpostor("remounted-tree", fresh.renderer, sources, settings);
  expect(second).not.toBe(first);
  await second.ready;
  expect(fresh.draws()).toBeGreaterThan(0);
  expect(freed).toBe(true);
  releaseImpostor("remounted-tree", fresh.renderer, settings);
});

test("a bake links its programs before it draws, and keeps them linked for the next model's bake", async () => {
  // A program per material kind, as three links one for every material with the same switches.
  const programs: { kind: string; ready: boolean; isReady(): boolean }[] = [];
  const linked = new Map<object, { currentProgram: unknown }>();
  const calls: string[] = [];
  let links = 0;
  const known: Record<string, unknown> = {
    shadowMap: { autoUpdate: true }, autoClear: true,
    getClearColor: (color: THREE.Color) => color, getClearAlpha: () => 1, getRenderTarget: () => null,
    info: { programs },
    properties: { get: (material: object) => linked.get(material) },
    compile: (scene: THREE.Scene) => {
      calls.push("compile");
      scene.traverse((node) => {
        const material = (node as THREE.Mesh).material as THREE.Material | undefined;
        if (material === undefined || linked.has(material)) return;
        let program = programs.find((entry) => entry.kind === material.type);
        // The driver finishes a new link a little later: the bake must not draw before then.
        if (program === undefined) {
          programs.push((program = { kind: material.type, ready: false, isReady: () => program!.ready }));
          links += 1;
        }
        setTimeout(() => { program!.ready = true; }, 30);
        linked.set(material, { currentProgram: program });
        // As three does, a program goes with the last material that used it.
        material.addEventListener("dispose", () => {
          linked.delete(material);
          if (![...linked.values()].some((entry) => entry.currentProgram === program)) programs.splice(programs.indexOf(program!), 1);
        });
      });
    },
    render: () => {
      calls.push(programs.every((program) => program.ready) ? "draw" : "draw before link");
    },
  };
  const renderer = new Proxy(known, { get: (target, name) => (typeof name === "string" && name in target ? target[name] : () => undefined) }) as unknown as THREE.WebGLRenderer;
  const settings = { frames: 2, cell: 8 };
  const bake = async (key: string) => {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const entry = acquireImpostor(key, renderer, [{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() }], settings);
    expect(entry.baked).toBe(false);
    await entry.ready;
    expect(entry.atlas).not.toBeNull();
    return geometry;
  };
  await bake("linked-rock");
  expect(calls.slice(0, 2)).toEqual(["compile", "compile"]);
  expect(calls).not.toContain("draw before link");
  expect(programs.map((program) => program.kind)).toEqual(["MeshBasicMaterial", "ShaderMaterial"]);
  // A second model's bake finds both programs still linked: three frees a program with its last
  // material, so the first bake keeps one of each.
  const disposed: string[] = [];
  const before = calls.length;
  const originalDispose = THREE.Material.prototype.dispose;
  THREE.Material.prototype.dispose = function (this: THREE.Material) { disposed.push(this.type); originalDispose.call(this); };
  try {
    await bake("linked-crate");
  } finally {
    THREE.Material.prototype.dispose = originalDispose;
  }
  expect(links, "the second bake linked its programs again").toBe(2);
  expect(calls.slice(before)).not.toContain("draw before link");
  expect(disposed).toEqual(["MeshBasicMaterial", "ShaderMaterial"]);
  releaseImpostor("linked-rock", renderer, settings);
  releaseImpostor("linked-crate", renderer, settings);
});

test("hemi-octahedral directions round-trip for every view above the horizon", () => {
  const out = new THREE.Vector3();
  for (const [x, y, z] of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0.6, 0.3, -0.74], [-0.2, 0.9, 0.39]] as const) {
    const direction = new THREE.Vector3(x, y, z).normalize();
    const [u, v] = hemiOctEncode(direction.x, direction.y, direction.z);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    expect(hemiOctDecode(u, v, out).distanceTo(direction)).toBeLessThan(1e-6);
  }
});

test("views from below the horizon fold onto the horizon frame", () => {
  const [u, v] = hemiOctEncode(1, -0.5, 0);
  const decoded = hemiOctDecode(u, v);
  expect(decoded.y).toBeCloseTo(0, 6);
  expect(decoded.x).toBeCloseTo(1, 6);
});

test("the bake camera's up vector stays defined looking straight down", () => {
  expect(impostorUp(new THREE.Vector3(0, 1, 0)).toArray()).toEqual([0, 0, -1]);
  expect(impostorUp(new THREE.Vector3(1, 0, 0)).toArray()).toEqual([0, 1, 0]);
});

test("the swap happens farther out on higher tiers and for bigger models", () => {
  expect(impostorDistance(3, "low")).toBeLessThan(impostorDistance(3, "high"));
  expect(impostorDistance(3, "high")).toBeLessThan(impostorDistance(3, "ultra"));
  expect(impostorDistance(12, "high")).toBeGreaterThan(impostorDistance(3, "high"));
  expect(impostorSettingsForQuality("low").cell).toBeLessThan(impostorSettingsForQuality("ultra").cell);
});

test("the near/far switch holds a band so a prop at the threshold does not flicker", () => {
  const threshold = 70;
  expect(impostorSwitch(threshold + 1, threshold, false)).toBe(false);
  expect(impostorSwitch(threshold + 10, threshold, false)).toBe(true);
  expect(impostorSwitch(threshold - 1, threshold, true)).toBe(true);
  expect(impostorSwitch(threshold - 10, threshold, true)).toBe(false);
});
