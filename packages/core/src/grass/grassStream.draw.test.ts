import { expect, test } from "bun:test";
import * as THREE from "three";

import { GRASS_DEFAULTS, GRASS_PRESETS, readGrassLook, type GrassLook } from "@jgengine/core/grass/grassKind";
import { observeFrameWork } from "@jgengine/core/devtools/frameBreakdown";

import { bakeGrassNode, grassTuftsBelow, resolveGrassBake, type GrassBakeOptions } from "./grassBake.draw";
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
    return Array.from({ length: count }, (_, i) => [offset.getX(i), offset.getY(i), offset.getZ(i)].join(","));
  }).sort();
  expect(roots(sliced.scene)).toEqual(roots(whole.scene));
  sliced.stream.dispose();
  whole.stream.dispose();
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
});

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
