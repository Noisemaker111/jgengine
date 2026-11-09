import { expect, test } from "bun:test";
import * as THREE from "three";

import { GRASS_DEFAULTS, GRASS_PRESETS, readGrassLook, type GrassLook } from "@jgengine/core/grass/grassKind";
import { observeFrameWork } from "@jgengine/core/devtools/frameBreakdown";

import { bakeGrassNode, GRASS_CELL_SIZE, grassNodeRect, grassTuftsBelow, resolveGrassBake, type GrassBakeOptions } from "./grassBake.draw";
import { createGrassTuftTemplate } from "./grassField";
import { createGrassMaterial } from "./grassMaterial.draw";
import { GrassStream } from "./grassStream.draw";

const VIEW_HEIGHT = 900;

test("a streaming slice bounds ground queries even for a dense leaf", () => {
  let queries = 0;
  const { stream: field } = stream({ area: 400, heightAt: () => { queries += 1; return 0; } });
  try {
    field.update(camera([0, 1.7, 0], [0, 0.5, -30]), VIEW_HEIGHT, 0);
    expect(queries).toBeLessThanOrEqual(128);
  } finally { field.dispose(); }
});

test("startup grows the nearest real leaf across slices and frees its partial buffer", () => {
  const { stream: field, scene, bake } = stream({ area: 16 });
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  const expected = bakeGrassNode(bake, 0, 1, 1, 1);
  field.update(view, VIEW_HEIGHT, 0);
  const mesh = field.group.children[0];
  expect(mesh).toBeInstanceOf(THREE.Mesh);
  if (!(mesh instanceof THREE.Mesh) || !(mesh.geometry instanceof THREE.InstancedBufferGeometry)) throw new Error("missing partial leaf");
  const offsets = mesh.geometry.getAttribute("instanceOffset");
  expect(offsets.count).toBe(1);
  expect(offsets.getX(0)).toBe(expected.offsets[0]);
  expect(offsets.getY(0)).toBe(expected.offsets[1]);
  expect(offsets.getZ(0)).toBe(expected.offsets[2]);
  field.update(view, VIEW_HEIGHT, 0);
  expect(mesh.geometry.getAttribute("instanceOffset")).toBe(offsets);
  expect(offsets.count).toBe(2);
  expect(offsets.getX(1)).toBe(expected.offsets[3]);
  let disposed = false;
  mesh.geometry.addEventListener("dispose", () => { disposed = true; });
  field.dispose();
  expect(disposed).toBe(true);
  expect(scene.children[0]?.children.length).toBe(0);
});

test("sliced work completes with the same grass and bounded ground queries", () => {
  let queries = 0;
  const look = readGrassLook({ slopeThin: 1 });
  const heightAt = (x: number, z: number) => { queries += 1; return x * 0.01 + z * 0.02; };
  const sliced = stream({ area: 16, look, heightAt });
  const whole = stream({ area: 16, look, heightAt });
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  whole.stream.update(view, VIEW_HEIGHT, Infinity);
  let calls = 0;
  const counts = new Map<string, number>();
  observeFrameWork((name, count) => counts.set(name, (counts.get(name) ?? 0) + count));
  do {
    queries = 0;
    counts.clear();
    sliced.stream.update(view, VIEW_HEIGHT, 1000);
    expect(queries).toBeLessThanOrEqual(8192);
    expect((counts.get("grass nodes visited") ?? 0) + (counts.get("grass bake tuft candidates") ?? 0) + (counts.get("grass other work steps") ?? 0)).toBeLessThanOrEqual(32768);
    calls += 1;
  } while (sliced.stream.stats().pending > 0 && calls < 1000);
  observeFrameWork(null);
  expect(sliced.stream.stats().pending).toBe(0);
  expect(calls).toBeGreaterThan(1);
  const roots = (scene: THREE.Scene) => submit(scene, view).drawn.flatMap(({ mesh, count }) => {
    const offset = mesh.geometry.getAttribute("instanceOffset");
    const shape = mesh.geometry.getAttribute("instanceShape");
    const vary = mesh.geometry.getAttribute("instanceVary");
    const tone = mesh.geometry.getAttribute("instanceTone");
    return Array.from({ length: count }, (_, i) => [offset.getX(i), offset.getY(i), offset.getZ(i), shape.getX(i), shape.getY(i), shape.getZ(i), shape.getW(i), vary.getX(i), vary.getY(i), vary.getZ(i), vary.getW(i), tone.getX(i)].join(","));
  }).sort();
  expect(roots(sliced.scene)).toEqual(roots(whole.scene));
  sliced.stream.dispose();
  whole.stream.dispose();
});

test("startup and immediate bakes agree across views and detail levels", () => {
  for (const [view, height] of [
    [camera([0, 1.7, 0], [0, 0.5, -30]), 100],
    [camera([12, 5, 13], [0, 0, 0]), 900],
    [camera([0, 40, 0], [0, 0, -1]), 900],
  ] as const) {
    const sliced = stream({ area: 24, seed: "startup-comparison" });
    const whole = stream({ area: 24, seed: "startup-comparison" });
    sliced.stream.update(view, height, 0);
    whole.stream.update(view, height, Infinity);
    for (let i = 0; i < 1000 && sliced.stream.stats().pending > 0; i += 1) sliced.stream.update(view, height, 1000);
    expect(sliced.stream.stats().pending).toBe(0);
    const roots = (scene: THREE.Scene) => submit(scene, view).drawn.flatMap(({ mesh, count }) => {
      const offsets = mesh.geometry.getAttribute("instanceOffset");
      const shape = mesh.geometry.getAttribute("instanceShape");
      const vary = mesh.geometry.getAttribute("instanceVary");
      const tone = mesh.geometry.getAttribute("instanceTone");
      return Array.from({ length: count }, (_, i) => [offsets.getX(i), offsets.getY(i), offsets.getZ(i), shape.getX(i), shape.getY(i), shape.getZ(i), shape.getW(i), vary.getX(i), vary.getY(i), vary.getZ(i), vary.getW(i), tone.getX(i)].join(","));
    }).sort();
    expect(roots(sliced.scene)).toEqual(roots(whole.scene));
    sliced.stream.dispose();
    whole.stream.dispose();
  }
});

test("ground revision discards unfinished and cached grass before rebuilding", () => {
  let revision = 0, height = 0;
  const bake = resolveGrassBake({ look: GRASS_DEFAULTS, area: 16, heightAt: () => height });
  const handle = createGrassMaterial(GRASS_DEFAULTS);
  const field = new GrassStream(bake, handle, { heightRevision: () => revision });
  const scene = new THREE.Scene();
  scene.add(field.group);
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  field.update(view, VIEW_HEIGHT, Infinity);
  expect(field.stats().cached).toBeGreaterThan(0);
  height = 3;
  revision += 1;
  field.update(view, VIEW_HEIGHT, 0);
  expect(field.group.visible).toBe(false);
  height = 5;
  revision += 1;
  for (let i = 0; i < 1000 && field.stats().pending > 0; i += 1) field.update(view, VIEW_HEIGHT, 1000);
  expect(field.stats().pending).toBe(0);
  const drawn = submit(scene, view).drawn;
  expect(drawn.length).toBeGreaterThan(0);
  for (const { mesh } of drawn) {
    const offsets = mesh.geometry.getAttribute("instanceOffset");
    for (let i = 0; i < offsets.count; i += 1) expect(offsets.getY(i)).toBe(5);
  }
  field.dispose();
  handle.material.dispose();
});

test("every leaf draws one shared copy of the tuft, and dropping a leaf frees only its own buffers", () => {
  // Each leaf once wrapped the template in its own attributes, so the GPU took a full copy per leaf;
  // at realism 1 that upload cost fernwild 14% of its frame.
  const { stream: field } = stream({ area: 40 });
  field.update(camera([0, 1.7, 0], [0, 0.5, -30]), VIEW_HEIGHT, Infinity);
  const leaves = field.group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  expect(leaves.length).toBeGreaterThan(1);
  const [first] = leaves;
  for (const leaf of leaves) {
    for (const name of ["position", "grassUv", "bladeOffset", "bladeVary", "bladeBend"]) expect(leaf.geometry.getAttribute(name)).toBe(first!.geometry.getAttribute(name));
    expect(leaf.geometry.index).toBe(first!.geometry.index);
  }
  // three deletes the GPU buffer of every attribute a geometry still holds when it is disposed.
  const freed: string[][] = [];
  for (const leaf of leaves) {
    leaf.geometry.addEventListener("dispose", () => {
      freed.push([...Object.keys(leaf.geometry.attributes), ...(leaf.geometry.index === null ? [] : ["index"])]);
    });
  }
  field.dispose();
  expect(freed.length).toBe(leaves.length);
  for (const names of freed) expect(names.sort()).toEqual(["instanceOffset", "instanceShape", "instanceTone", "instanceVary"]);
});

test("continuous movement keeps the cache bounded and settles when movement stops", () => {
  const { stream: field } = stream({ area: 40 });
  let view = camera([0, 1.7, 0], [0, 0.5, -30]);
  for (let i = 0; i < 60; i += 1) {
    view = camera([i % 20 - 10, 1.7, 0], [i % 20 - 10, 0.5, -30]);
    field.update(view, VIEW_HEIGHT, 1000);
    expect(field.stats().cached).toBeLessThanOrEqual(256);
  }
  for (let i = 0; i < 1000 && field.stats().pending > 0; i += 1) field.update(view, VIEW_HEIGHT, 1000);
  expect(field.stats().pending).toBe(0);
  field.dispose();
});

test("the first view fills once and walking afterwards does not count as filling again", () => {
  let revision = 0;
  const bake = resolveGrassBake({ look: GRASS_DEFAULTS, area: 40, heightAt: () => 0 });
  const handle = createGrassMaterial(GRASS_DEFAULTS);
  const field = new GrassStream(bake, handle, { heightRevision: () => revision });
  let view = camera([0, 1.7, 0], [0, 0.5, -30]);
  field.update(view, VIEW_HEIGHT, 0);
  expect(field.filled).toBe(false);
  for (let i = 0; i < 1000 && !field.filled; i += 1) field.update(view, VIEW_HEIGHT, 1000);
  expect(field.filled).toBe(true);
  for (let i = 1; i <= 30; i += 1) {
    view = camera([0, 1.7, -i * 0.5], [0, 0.5, -30 - i * 0.5]);
    field.update(view, VIEW_HEIGHT, 0);
    expect(field.stats().pending).toBeGreaterThan(0);
    expect(field.filled).toBe(true);
  }
  revision += 1;
  field.update(view, VIEW_HEIGHT, 0);
  expect(field.filled).toBe(false);
  field.dispose();
  handle.material.dispose();
});

test("a moved camera eventually replaces unfinished selection with its own view", () => {
  const sliced = stream({ area: 40 });
  const whole = stream({ area: 40 });
  const first = camera([0, 1.7, 0], [0, 0.5, -30]);
  const moved = camera([12, 1.7, 12], [12, 0.5, -18]);
  sliced.stream.update(first, VIEW_HEIGHT, 0);
  whole.stream.update(moved, VIEW_HEIGHT, Infinity);
  for (let i = 0; i < 1000; i += 1) {
    sliced.stream.update(moved, VIEW_HEIGHT, 1000);
    if (sliced.stream.stats().pending === 0) break;
  }
  expect(sliced.stream.stats().pending).toBe(0);
  const roots = (scene: THREE.Scene) => submit(scene, moved).drawn.flatMap(({ mesh, count }) => {
    const offsets = mesh.geometry.getAttribute("instanceOffset");
    return Array.from({ length: count }, (_, i) => [offsets.getX(i), offsets.getY(i), offsets.getZ(i)].join(","));
  }).sort();
  expect(roots(sliced.scene)).toEqual(roots(whole.scene));
  sliced.stream.dispose();
  whole.stream.dispose();
});

test("grass work counts distinguish a stable view from a changed view", () => {
  const { stream: field } = stream({ area: 100 });
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  const counts = new Map<string, number>();
  observeFrameWork((name, count) => counts.set(name, (counts.get(name) ?? 0) + count));
  try {
    field.update(view, VIEW_HEIGHT, Infinity);
    expect(counts.get("grass nodes visited")).toBeGreaterThan(0);
    expect(counts.get("grass leaves baked")).toBeGreaterThan(0);
    counts.clear();
    field.update(view, VIEW_HEIGHT, Infinity);
    expect(counts.get("grass unchanged updates")).toBe(1);
    expect(counts.get("grass nodes visited")).toBeUndefined();
    counts.clear();
    view.position.x += 5;
    field.update(view, VIEW_HEIGHT, 0);
    expect(counts.get("grass view or transform changed")).toBe(1);
    expect(counts.get("grass nodes visited")).toBeGreaterThan(0);
  } finally { observeFrameWork(null); field.dispose(); }
});

function camera(position: [number, number, number], target: [number, number, number]): THREE.PerspectiveCamera {
  const result = new THREE.PerspectiveCamera(55, 1600 / VIEW_HEIGHT, 0.1, 2000);
  result.position.set(...position);
  result.lookAt(...target);
  result.updateMatrixWorld();
  return result;
}

function stream(options: Partial<GrassBakeOptions> & { look?: GrassLook } = {}) {
  const look = options.look ?? GRASS_DEFAULTS;
  const bake = resolveGrassBake({ area: 100, ...options, look });
  const handle = createGrassMaterial(look);
  const result = new GrassStream(bake, handle);
  const scene = new THREE.Scene();
  scene.add(result.group);
  return { stream: result, scene, bake };
}

/** What a renderer would submit for `view`: three's frustum cull, then each draw's own LOD hook. */
function submit(scene: THREE.Scene, view: THREE.Camera) {
  scene.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
  const sphere = new THREE.Sphere();
  let triangles = 0, draws = 0;
  const drawn: { mesh: THREE.Mesh<THREE.InstancedBufferGeometry>; count: number }[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh<THREE.InstancedBufferGeometry>;
    if (!mesh.isMesh) return;
    if (!frustum.intersectsSphere(sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld))) return;
    mesh.onBeforeRender({} as THREE.WebGLRenderer, scene, view, mesh.geometry, mesh.material as THREE.Material, null);
    if (mesh.geometry.instanceCount === 0) return;
    draws += 1;
    triangles += (mesh.geometry.drawRange.count / 3) * mesh.geometry.instanceCount;
    drawn.push({ mesh, count: mesh.geometry.instanceCount });
  });
  return { triangles, draws, drawn };
}

/** Drawn tuft roots per m² inside a ring around the camera's ground point. */
function drawnDensity(drawn: ReturnType<typeof submit>["drawn"], at: THREE.Vector3, inner: number, outer: number, sector?: (x: number, z: number) => boolean): number {
  let count = 0;
  for (const { mesh, count: n } of drawn) {
    const offsets = mesh.geometry.getAttribute("instanceOffset");
    for (let i = 0; i < n; i += 1) {
      const dx = offsets.getX(i) + mesh.matrixWorld.elements[12]! - at.x, dz = offsets.getZ(i) + mesh.matrixWorld.elements[14]! - at.z;
      const d = Math.hypot(dx, dz);
      if (d >= inner && d < outer && (sector === undefined || sector(dx, dz))) count += 1;
    }
  }
  const area = Math.PI * (outer * outer - inner * inner) * (sector === undefined ? 1 : 0.25);
  return count / area;
}

test("draw and resident cost follow the camera, not the patch area", () => {
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  const small = stream({ area: 1200 });
  const huge = stream({ area: 40_000 });
  small.stream.update(view, VIEW_HEIGHT, Infinity);
  huge.stream.update(view, VIEW_HEIGHT, Infinity);
  const a = submit(small.scene, view), b = submit(huge.scene, view);
  expect(a.triangles).toBeGreaterThan(0);
  expect(b.triangles).toBeLessThan(a.triangles * 1.15);
  expect(huge.stream.stats().tufts).toBeLessThan(small.stream.stats().tufts * 1.15);
  expect(b.draws).toBeLessThan(200);
});

test("grass is dense up close and thins with distance with no fade configured", () => {
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  const { stream: field, scene, bake } = stream({ area: 300 });
  field.update(view, VIEW_HEIGHT, Infinity);
  const { drawn } = submit(scene, view);
  const ahead = (dx: number, dz: number) => dz < 0 && Math.abs(dx) < -dz;
  const near = drawnDensity(drawn, view.position, 2, 6, ahead);
  const far = drawnDensity(drawn, view.position, 60, 80, ahead);
  expect(near).toBeGreaterThan(bake.tuftsPerM2 * 0.85);
  expect(far).toBeGreaterThan(0);
  expect(far).toBeLessThan(near * 0.2);
});

test("a camera past where blades shrink under a pixel draws nothing, and turning away culls the draws", () => {
  const far = camera([0, 3, 3000], [0, 0, 0]);
  const field = stream({ area: 100 });
  field.stream.update(far, VIEW_HEIGHT, Infinity);
  expect(submit(field.scene, far).triangles).toBe(0);
  const away = camera([0, 1.7, 60], [0, 1.7, 200]);
  field.stream.update(away, VIEW_HEIGHT, Infinity);
  expect(submit(field.scene, away).triangles).toBe(0);
});

test("every camera trims its own draws; the stream bakes for the scene camera", () => {
  const near = camera([0, 1.7, 0], [0, 0.5, -30]);
  const { stream: field, scene } = stream({ area: 300 });
  field.update(near, VIEW_HEIGHT, Infinity);
  const close = submit(scene, near).triangles;
  const high = submit(scene, camera([0, 120, 40], [0, 0, -40])).triangles;
  expect(close).toBeGreaterThan(0);
  expect(high).toBeGreaterThan(0);
  expect(high).toBeLessThan(close);
});

test("a finer node regrows exactly the tufts a coarser one kept, so LOD changes never reshuffle the field", () => {
  const bake = resolveGrassBake({ look: GRASS_DEFAULTS, area: 64, seed: "stable" });
  const coarse = bakeGrassNode(bake, 1, 0, 0, 0.25);
  const fine = [0, 1].flatMap((iz) => [0, 1].map((ix) => bakeGrassNode(bake, 0, ix, iz, 1)));
  const key = (offsets: Float32Array, i: number) => `${offsets[i * 3]!.toFixed(4)},${offsets[i * 3 + 2]!.toFixed(4)}`;
  const fineRoots = new Set(fine.flatMap((tufts) => Array.from({ length: tufts.count }, (_, i) => key(tufts.offsets, i))));
  expect(coarse.count).toBeGreaterThan(0);
  for (let i = 0; i < coarse.count; i += 1) expect(fineRoots.has(key(coarse.offsets, i))).toBe(true);
  const total = fine.reduce((sum, tufts) => sum + tufts.count, 0);
  expect(coarse.count / total).toBeCloseTo(0.25, 1);
  expect(grassTuftsBelow(coarse.ranks, 0.1) / coarse.count).toBeCloseTo(0.4, 1);
});

test("baking follows the ground and keeps every blade inside its draw bounds", () => {
  const heightAt = (x: number, z: number) => 400 + x * 0.3 - z * 0.1;
  const look = readGrassLook({ bladeHeight: 2.5, curvature: 1, stiffness: 0, windStrength: 1, mixShare: 0.5, mixHeight: 4 });
  const { stream: field, scene } = stream({ look, area: [60, 30], heightAt });
  field.update(camera([0, 404, 0], [0, 400, -10]), VIEW_HEIGHT, Infinity);
  scene.updateMatrixWorld(true);
  let roots = 0;
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh<THREE.InstancedBufferGeometry>;
    if (!mesh.isMesh) return;
    const offsets = mesh.geometry.getAttribute("instanceOffset");
    const shape = mesh.geometry.getAttribute("instanceShape");
    for (let i = 0; i < offsets.count; i += 1) {
      const root = new THREE.Vector3(offsets.getX(i), offsets.getY(i), offsets.getZ(i));
      expect(root.y).toBeCloseTo(heightAt(root.x, root.z), 3);
      const reach = shape.getY(i);
      expect(mesh.geometry.boundingBox!.containsPoint(root.clone().add(new THREE.Vector3(reach, reach, reach)))).toBe(true);
      roots += 1;
    }
  });
  expect(roots).toBeGreaterThan(0);
});

test("bake time is sliced after the first frame and holds a coarser node until the fine one is ready", () => {
  const { stream: field } = stream({ area: 400 });
  field.update(camera([0, 1.7, 0], [0, 0.5, -30]), VIEW_HEIGHT, Infinity);
  const first = field.stats();
  expect(first.pending).toBe(0);
  field.update(camera([120, 1.7, 120], [120, 0.5, 90]), VIEW_HEIGHT, 0);
  expect(field.stats().pending).toBeGreaterThan(0);
  for (let i = 0; i < 200 && field.stats().pending > 0; i += 1) field.update(camera([120, 1.7, 120], [120, 0.5, 90]), VIEW_HEIGHT, 50);
  expect(field.stats().pending).toBe(0);
});

test("leaves free their buffers when evicted and on dispose", () => {
  const { stream: field, scene } = stream({ area: 2000 });
  let disposed = 0;
  const watch = () => scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.watched !== true) {
      mesh.userData.watched = true;
      mesh.geometry.addEventListener("dispose", () => { disposed += 1; });
    }
  });
  for (let step = 0; step < 12; step += 1) {
    field.update(camera([step * 80 - 480, 1.7, 0], [step * 80 - 480, 0.5, -30]), VIEW_HEIGHT, Infinity);
    watch();
  }
  expect(disposed).toBeGreaterThan(0);
  const held = field.stats().cached;
  field.dispose();
  expect(field.stats().cached).toBe(0);
  expect(held).toBeGreaterThan(0);
  // Twelve full settles over a 2 km field: about 2 s alone, past bun's 5 s default on a busy PC.
}, 30_000);

test("every preset and random knob mix stays full: blade cover never drops below the lush floor", () => {
  const looks = [GRASS_DEFAULTS, ...GRASS_PRESETS.map((preset) => readGrassLook(preset.values))];
  let state = 7;
  const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 200; i += 1) {
    looks.push(readGrassLook({ density: random(), bladeWidth: 0.008 + random() * 0.3, bladeHeight: 0.05 + random() * 2.5, heightVariation: random(), widthVariation: random() }));
  }
  for (const look of looks) {
    const bake = resolveGrassBake({ look, area: 16 });
    const width = look.blade.bladeWidth * (1 - look.blade.widthVariation * 0.3);
    const height = Math.min(1.2, look.blade.bladeHeight * (1 - look.blade.heightVariation * 0.3));
    // Blade area per m² of ground, side-on: under ~1.5 the ground shows through between tufts.
    expect(bake.bladesPerM2 * width * (0.3 + height)).toBeGreaterThan(2.4);
  }
});

test("only leaves in view join the scene graph, and turning around draws from leaves already baked", () => {
  const { stream: field } = stream({ area: 300 });
  field.update(camera([0, 1.7, 0], [0, 0.5, -30]), VIEW_HEIGHT, Infinity);
  const ahead = field.group.children.length;
  expect(ahead).toBeGreaterThan(0);
  expect(field.stats().cached).toBeGreaterThan(ahead * 1.5);
  field.update(camera([0, 1.7, 0], [0, 0.5, 30]), VIEW_HEIGHT, 0);
  expect(field.stats().pending).toBe(0);
  expect(field.group.children.length).toBeGreaterThan(0);
  expect(field.group.children.length).toBeLessThan(field.stats().cached);
});

test("a disposed stream that is updated again rebuilds its view", () => {
  const { stream: field } = stream({ area: 16 });
  const view = camera([0, 1.7, 0], [0, 0.5, -30]);
  field.update(view, VIEW_HEIGHT, Infinity);
  expect(field.filled).toBe(true);
  field.dispose();
  expect(field.stats().cached).toBe(0);
  field.update(view, VIEW_HEIGHT, Infinity);
  expect(field.filled).toBe(true);
  expect(field.stats().cached).toBeGreaterThan(0);
  field.dispose();
});

test("cushion mounds clumps into domes over a low skin, so moss reads as cushions", () => {
  const heights = (cushion: number) => {
    const look = readGrassLook({ species: "cushion-moss", cushion, edgeFeather: 0 });
    const tufts = bakeGrassNode(resolveGrassBake({ look, area: 8, edgeFeather: 0, heightAt: () => 0 }), 0, 0, 0, 1);
    const values = Array.from({ length: tufts.count }, (_, i) => tufts.shape[i * 4 + 1] ?? 0).sort((a, b) => a - b);
    return { median: values[Math.floor(values.length / 2)] ?? 0, top: values[values.length - 1] ?? 0 };
  };
  const flat = heights(0);
  const domed = heights(0.9);
  expect(domed.median).toBeLessThan(flat.median * 0.9);
  expect(domed.top).toBeGreaterThan(domed.median * 1.3);
});

test("every species bakes a finite, bounded node", () => {
  for (const preset of GRASS_PRESETS) {
    const look = readGrassLook({ species: preset.id });
    const bake = resolveGrassBake({ look, area: 8, heightAt: () => 0 });
    const tufts = bakeGrassNode(bake, 0, 0, 0, 0.05);
    expect(Number.isFinite(tufts.extent)).toBe(true);
    expect(tufts.extent).toBeLessThanOrEqual(bake.maxHeight * 2 + 1);
    createGrassMaterial(look).material.dispose();
  }
});

/** Furthest any point of the rect sits from its nearest tuft root, metres, sampled on a fine grid. */
function largestGap(offsets: Float32Array, count: number, rect: [number, number, number, number], step: number): number {
  let worst = 0;
  for (let z = rect[1]; z <= rect[3]; z += step) {
    for (let x = rect[0]; x <= rect[2]; x += step) {
      let best = Infinity;
      for (let i = 0; i < count; i += 1) best = Math.min(best, Math.hypot(offsets[i * 3]! - x, offsets[i * 3 + 2]! - z));
      worst = Math.max(worst, best);
    }
  }
  return worst;
}

test("tuft roots cover a cell evenly, at full detail and when thinned for distance", () => {
  // Uniform random roots leave holes about twice the tuft spacing wide, which read as bare spots
  // between separate fountains of blades. The even spread keeps every gap near one spacing.
  const look = readGrassLook({ species: "wildflower-meadow" });
  const bake = resolveGrassBake({ look, area: 8, seed: "even", edgeFeather: 0 });
  const spacing = 1 / Math.sqrt(bake.tuftsPerM2);
  const inner: [number, number, number, number] = [-3, -3, 3, 3];
  const full = bakeGrassNode(bake, 0, 0, 0, 1);
  expect(largestGap(full.offsets, full.count, inner, spacing / 3) / spacing).toBeLessThan(1.25);
  const thinned = bakeGrassNode(bake, 0, 0, 0, 0.25);
  expect(largestGap(thinned.offsets, thinned.count, inner, spacing / 1.5) / (spacing * 2)).toBeLessThan(1.25);
});

/** Spread of nearest-neighbour distances over their mean: near 0 for a lattice, about 0.5 for random roots. */
/** Roots of each 8 m cell of a 4-cell-square field at `share`, as cell-local 0..1 points. */
function cellRoots(bake: ReturnType<typeof resolveGrassBake>, share: number): [number, number][][] {
  const cells: [number, number][][] = [];
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iz = 0; iz < 4; iz += 1) {
      const [x0, z0] = grassNodeRect(bake, 0, ix, iz);
      const node = bakeGrassNode(bake, 0, ix, iz, share);
      cells.push(Array.from({ length: node.count }, (_, i) => [(node.offsets[i * 3]! - x0) / GRASS_CELL_SIZE, (node.offsets[i * 3 + 2]! - z0) / GRASS_CELL_SIZE]));
    }
  }
  return cells;
}

/**
 * Strongest repeat in the cells' roots: the power of the largest 2D wave across them, per root. Roots
 * scattered without rows score a few; a lattice of n roots a cell scores about n.
 */
function latticePower(cells: [number, number][][]): number {
  const roots = cells.reduce((sum, cell) => sum + cell.length, 0);
  const reach = Math.ceil(Math.sqrt(roots / cells.length) * 2.5);
  let strongest = 0;
  for (let a = -reach; a <= reach; a += 1) {
    for (let b = 0; b <= reach; b += 1) {
      if (b === 0 && a <= 0) continue;
      let power = 0;
      for (const cell of cells) {
        let re = 0, im = 0;
        for (const [x, z] of cell) { const angle = 2 * Math.PI * (a * x + b * z); re += Math.cos(angle); im += Math.sin(angle); }
        power += re * re + im * im;
      }
      strongest = Math.max(strongest, power / roots);
    }
  }
  return strongest;
}

/** Mean distance from each root to its nearest neighbour over what uniform random roots would have: 1 random, higher more even. */
function evenness(cells: [number, number][][]): number {
  let total = 0, roots = 0;
  for (const cell of cells) {
    for (const [x, z] of cell) {
      let best = Infinity;
      for (const [ox, oz] of cell) if (ox !== x || oz !== z) best = Math.min(best, Math.hypot(Math.min(Math.abs(x - ox), 1 - Math.abs(x - ox)), Math.min(Math.abs(z - oz), 1 - Math.abs(z - oz))));
      total += best / (0.5 / Math.sqrt(cell.length));
      roots += 1;
    }
  }
  return total / roots;
}

test("a field thinned for distance stays evenly scattered and never falls into rows", () => {
  // A far pasture at realism 1 keeps a few dozen tufts a cell. With R2 roots those formed a near-regular
  // lattice (power 30 to 120 here) that drew rows like a planted crop; scattered roots score under 6.
  // Uniform random roots would pass that but pile up (evenness 1.0); the field must stay more even.
  const bake = resolveGrassBake({ look: readGrassLook({ species: "grazed-pasture" }, { realism: 1 }), area: 32, seed: "rows", edgeFeather: 0 });
  for (const share of [0.003, 0.01, 0.03]) {
    const cells = cellRoots(bake, share);
    expect(cells.every((cell) => cell.length >= 12)).toBe(true);
    expect(latticePower(cells)).toBeLessThan(6);
    expect(evenness(cells)).toBeGreaterThan(1.18);
  }
});

test("a tuft's blades reach far enough to meet the next tuft", () => {
  for (const preset of GRASS_PRESETS) {
    const look = readGrassLook({ species: preset.id });
    const bake = resolveGrassBake({ look, area: 8, seed: preset.id });
    const spacing = 1 / Math.sqrt(bake.tuftsPerM2);
    const template = createGrassTuftTemplate(bake);
    expect(template.radius).toBeGreaterThanOrEqual(spacing * 0.5);
  }
});
