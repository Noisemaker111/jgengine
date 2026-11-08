import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { installShadowCache, SHADOW_STATIC_AFTER_MS, type ShadowCacheRenderer, type ShadowCacheStats } from "./shadowCache.draw";

/**
 * A renderer that draws the way three's shadow pass does (WebGLShadowMap.render and renderObject),
 * where a depth map's "image" is the set of caster states drawn into it. Depth keeps the nearest
 * fragment, so drawing a caster twice leaves the same image: a set models that exactly. Each state
 * is written here, independently of the cache's own snapshot, from what a depth draw reads.
 */
class FakeRenderer implements ShadowCacheRenderer {
  readonly images = new Map<THREE.Texture, Set<string>>();
  target: THREE.WebGLRenderTarget | null = null;
  draws = 0;
  readonly clippingPlanes: THREE.Plane[] = [];
  readonly state = { buffers: { depth: { getReversed: () => false } } };
  readonly shadowMap = {
    enabled: true,
    autoUpdate: true,
    needsUpdate: false,
    type: THREE.PCFShadowMap as THREE.ShadowMapType,
    render: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => this.shadowPass(lights, scene, camera),
  };

  clear = (): void => {
    if (this.target !== null) this.images.set(this.target.depthTexture!, new Set());
  };

  setRenderTarget = (target: THREE.WebGLRenderTarget | null): void => {
    this.target = target;
  };

  copyTextureToTexture = (source: THREE.Texture, destination: THREE.Texture): void => {
    this.images.set(destination, new Set(this.images.get(source) ?? []));
  };

  renderBufferDirect = ((_camera: THREE.Camera, _scene: null, _geometry: THREE.BufferGeometry, material: THREE.Material, object: THREE.Object3D) => {
    this.draws += 1;
    this.images.get(this.target!.depthTexture!)!.add(depthState(object, material));
  }) as unknown as ShadowCacheRenderer["renderBufferDirect"];

  imageOf(light: THREE.DirectionalLight): Set<string> {
    return this.images.get(light.shadow.map!.depthTexture!) ?? new Set();
  }

  private shadowPass(lights: THREE.Light[], scene: THREE.Object3D, camera: THREE.Camera): void {
    const shadowMap = this.shadowMap;
    if (!shadowMap.enabled || (!shadowMap.autoUpdate && !shadowMap.needsUpdate) || lights.length === 0) return;
    const previous = this.target;
    for (const light of lights) {
      const shadow = (light as THREE.DirectionalLight).shadow;
      if (!shadow.autoUpdate && !shadow.needsUpdate) continue;
      if (shadow.map === null) {
        shadow.map = new THREE.WebGLRenderTarget(shadow.mapSize.x, shadow.mapSize.y);
        shadow.map.depthTexture = new THREE.DepthTexture(shadow.mapSize.x, shadow.mapSize.y, THREE.UnsignedIntType);
      }
      this.setRenderTarget(shadow.map);
      this.clear();
      shadow.updateMatrices(light, camera);
      visitCasters(scene, shadow.getFrustum(), layersOf(shadow, camera), (object, material) => this.renderBufferDirect(shadow.camera as never, null as never, object.geometry as never, material as never, object as never, null as never));
      shadow.needsUpdate = false;
    }
    shadowMap.needsUpdate = false;
    this.setRenderTarget(previous);
  }
}

type Caster = THREE.Mesh;

function layersOf(shadow: THREE.LightShadow, camera: THREE.Camera): THREE.Layers {
  return (shadow.camera.layers.mask & 0xfffffffe) !== 0 ? shadow.camera.layers : camera.layers;
}

/** three's renderObject: what a shadow pass with this frustum and layer mask draws. */
function visitCasters(object: THREE.Object3D, frustum: THREE.Frustum, layers: THREE.Layers, draw: (object: Caster, material: THREE.Material) => void): void {
  if (!object.visible) return;
  const mesh = object as Caster;
  if (object.layers.test(layers) && mesh.isMesh === true && object.castShadow && (!object.frustumCulled || object.intersectsFrustum(frustum))) {
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const group of mesh.geometry.groups) {
        const entry = material[group.materialIndex ?? 0];
        if (entry?.visible === true) draw(mesh, entry);
      }
    } else if (material.visible) {
      draw(mesh, material);
    }
  }
  for (const child of object.children) visitCasters(child, frustum, layers, draw);
}

/** What one depth draw of `object` with `material` writes, by what it reads. */
function depthState(object: THREE.Object3D, material: THREE.Material): string {
  const mesh = object as THREE.Mesh & Partial<THREE.InstancedMesh & THREE.BatchedMesh>;
  const m = material as THREE.MeshStandardMaterial;
  const parts: unknown[] = [object.id, ...object.matrixWorld.elements, material.uuid, m.side, m.shadowSide, m.alphaTest, m.map?.uuid ?? "-", m.wireframe];
  const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  parts.push(mesh.geometry.uuid, position.version, mesh.geometry.drawRange.start, mesh.geometry.drawRange.count);
  if (mesh.isInstancedMesh === true) parts.push("instances", mesh.count, ...mesh.instanceMatrix!.array.slice(0, mesh.count! * 16));
  if (mesh.isBatchedMesh === true) {
    const batch = object as THREE.BatchedMesh;
    const visible: number[] = [];
    for (let index = 0; index < batch.instanceCount; index += 1) if (batch.getVisibleAt(index)) visible.push(index);
    parts.push("batch", ...visible);
  }
  return parts.join(",");
}

function box(material: THREE.Material = new THREE.MeshStandardMaterial()): Caster {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.castShadow = true;
  return mesh;
}

interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  light: THREE.DirectionalLight;
  renderer: FakeRenderer;
  stats: () => ShadowCacheStats;
  /** Advance the clock, draw one frame's shadow pass, and return the plan counts it added. */
  frame: (ms?: number) => Record<string, number>;
  /** What a full redraw would hold for `light` right now. */
  reference: (light?: THREE.DirectionalLight) => Set<string>;
  /** Run frames until every caster is static and the light holds; returns the frames run. */
  settle: () => void;
  dispose: () => void;
}

function world(): World {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 5, 10);
  const light = new THREE.DirectionalLight();
  light.castShadow = true;
  light.position.set(10, 20, 10);
  light.shadow.mapSize.set(64, 64);
  Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.5, far: 100 });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(light, light.target);
  const renderer = new FakeRenderer();
  let clock = 0;
  const cache = installShadowCache(renderer, scene, () => clock);
  const lights = (): THREE.Light[] => {
    const found: THREE.Light[] = [];
    scene.traverse((object) => {
      if ((object as THREE.DirectionalLight).isDirectionalLight === true && (object as THREE.DirectionalLight).castShadow) found.push(object as THREE.Light);
    });
    return found;
  };
  const frame = (ms = 16) => {
    clock += ms;
    const before = { ...cache.handle.stats().passes };
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    renderer.shadowMap.render(lights(), scene, camera);
    const after = cache.handle.stats().passes;
    return Object.fromEntries(Object.entries(after).map(([plan, count]) => [plan, count - before[plan as keyof typeof before]]));
  };
  const reference = (of = light) => {
    const image = new Set<string>();
    of.shadow.updateMatrices(of, camera);
    visitCasters(scene, of.shadow.getFrustum(), layersOf(of.shadow, camera), (object, material) => image.add(depthState(object, material)));
    return image;
  };
  const settle = () => {
    for (let index = 0; index < 40; index += 1) frame(100);
    const plans = frame(100);
    expect(plans["hold"]).toBeGreaterThan(0);
  };
  return { scene, camera, light, renderer, stats: () => cache.handle.stats(), frame, reference, settle, dispose: cache.dispose };
}

function expectSame(w: World, light = w.light): void {
  expect([...w.renderer.imageOf(light)].sort()).toEqual([...w.reference(light)].sort());
}

describe("shadow cache invalidation", () => {
  test("a settled scene holds its map and draws nothing", () => {
    const w = world();
    for (let index = 0; index < 5; index += 1) w.scene.add(box());
    w.settle();
    const draws = w.renderer.draws;
    expect(w.frame()).toMatchObject({ hold: 1 });
    expect(w.renderer.draws).toBe(draws);
    expectSame(w);
    w.dispose();
  });

  const changes: [string, (mesh: Caster, w: World) => void][] = [
    ["moving a static caster", (mesh) => mesh.position.x += 0.5],
    ["hiding a static caster's parent", (mesh) => { mesh.parent!.visible = false; }],
    ["turning castShadow off", (mesh) => { mesh.castShadow = false; }],
    ["swapping its material", (mesh) => { mesh.material = new THREE.MeshStandardMaterial(); }],
    ["setting alphaTest with a map", (mesh) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map = new THREE.Texture();
      material.alphaTest = 0.5;
    }],
    ["changing the material's shadow side", (mesh) => { (mesh.material as THREE.Material).shadowSide = THREE.DoubleSide; }],
    ["editing a geometry attribute", (mesh) => {
      const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      position.setX(0, position.getX(0) + 0.25);
      position.needsUpdate = true;
    }],
    ["narrowing the draw range", (mesh) => mesh.geometry.setDrawRange(0, 6)],
    ["removing it", (mesh) => mesh.removeFromParent()],
    ["moving it to another layer", (mesh) => mesh.layers.set(2)],
  ];

  for (const [name, change] of changes) {
    test(`${name} redraws the map exactly`, () => {
      const w = world();
      const group = new THREE.Group();
      const mesh = box();
      group.add(mesh);
      w.scene.add(group, box());
      w.settle();
      change(mesh, w);
      w.frame();
      expectSame(w);
      // And it stays right while the change settles into the layer.
      for (let index = 0; index < 30; index += 1) {
        w.frame(100);
        expectSame(w);
      }
      w.dispose();
    });
  }

  test("adding a caster after the layer was built draws it", () => {
    const w = world();
    w.scene.add(box());
    w.settle();
    const added = box();
    added.position.set(3, 0, 0);
    w.scene.add(added);
    w.frame();
    expectSame(w);
    w.dispose();
  });

  test("a caster added under a static group draws, then joins the layer", () => {
    const w = world();
    const group = new THREE.Group();
    group.add(box());
    w.scene.add(group);
    w.settle();
    const child = box();
    child.position.set(-2, 0, 0);
    group.add(child);
    for (let index = 0; index < 30; index += 1) {
      w.frame(100);
      expectSame(w);
    }
    expect(w.stats().staticCasters).toBe(2);
    w.dispose();
  });

  test("an instanced caster's moved instance redraws", () => {
    const w = world();
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 4);
    instances.castShadow = true;
    for (let index = 0; index < 4; index += 1) instances.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 2, 0, 0));
    w.scene.add(instances);
    w.settle();
    instances.setMatrixAt(2, new THREE.Matrix4().makeTranslation(4, 3, 0));
    instances.instanceMatrix.needsUpdate = true;
    w.frame();
    expectSame(w);
    instances.count = 2;
    w.frame();
    expectSame(w);
    w.dispose();
  });

  test("hiding one instance of a batched caster redraws", () => {
    const w = world();
    const batch = new THREE.BatchedMesh(4, 512, 1024, new THREE.MeshStandardMaterial());
    batch.castShadow = true;
    const geometry = batch.addGeometry(new THREE.BoxGeometry(1, 1, 1));
    for (let index = 0; index < 3; index += 1) batch.setMatrixAt(batch.addInstance(geometry), new THREE.Matrix4().makeTranslation(index * 2, 0, 0));
    w.scene.add(batch);
    w.settle();
    batch.setVisibleAt(1, false);
    w.frame();
    expectSame(w);
    w.dispose();
  });

  test("moving the light draws at the new projection", () => {
    const w = world();
    w.scene.add(box());
    w.settle();
    w.light.position.x += 1;
    w.frame();
    expectSame(w);
    w.dispose();
  });

  test("a new map after a resize is drawn, not left empty", () => {
    const w = world();
    w.scene.add(box());
    w.settle();
    w.light.shadow.map!.dispose();
    w.light.shadow.map = null;
    w.light.shadow.mapSize.set(128, 128);
    for (let index = 0; index < 4; index += 1) {
      w.frame();
      expectSame(w);
    }
    w.dispose();
  });

  test("a moving caster keeps the static layer and only redraws itself", () => {
    const w = world();
    for (let index = 0; index < 6; index += 1) {
      const mesh = box();
      mesh.position.set(index * 2 - 6, 0, 0);
      w.scene.add(mesh);
    }
    const walker = box();
    w.scene.add(walker);
    w.settle();
    for (let index = 0; index < 20; index += 1) {
      walker.position.z = (index + 1) * 0.1;
      const draws = w.renderer.draws;
      const plans = w.frame();
      expectSame(w);
      if (index > 0) {
        expect(plans).toMatchObject({ reuse: 1 });
        expect(w.renderer.draws - draws).toBe(1);
      }
    }
    w.dispose();
  });

  test("a render with shadow updates off keeps the cache's records", () => {
    const w = world();
    w.scene.add(box());
    w.settle();
    w.renderer.shadowMap.autoUpdate = false;
    w.renderer.shadowMap.render([w.light], w.scene, w.camera);
    w.renderer.shadowMap.autoUpdate = true;
    expect(w.frame()).toMatchObject({ hold: 1 });
    w.dispose();
  });

  test("random edits over a long run never leave a map that differs from a full redraw", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const w = world();
    const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    w.scene.add(...groups);
    const meshes: Caster[] = [];
    for (let index = 0; index < 18; index += 1) {
      const mesh = box();
      mesh.position.set(random() * 30 - 15, random() * 4, random() * 30 - 15);
      groups[index % groups.length]!.add(mesh);
      meshes.push(mesh);
    }
    const second = new THREE.DirectionalLight();
    second.castShadow = true;
    second.position.set(-10, 15, 5);
    second.shadow.mapSize.set(32, 32);
    Object.assign(second.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 60 });
    second.shadow.camera.updateProjectionMatrix();
    w.scene.add(second, second.target);
    const totals: Record<string, number> = { full: 0, rebuild: 0, reuse: 0, hold: 0 };
    for (let step = 0; step < 1500; step += 1) {
      const pick = meshes[Math.floor(random() * meshes.length)]!;
      const roll = random();
      if (roll < 0.04) pick.position.x += random() - 0.5;
      else if (roll < 0.06) pick.visible = !pick.visible;
      else if (roll < 0.08) pick.castShadow = !pick.castShadow;
      else if (roll < 0.09) groups[Math.floor(random() * groups.length)]!.visible = random() < 0.7;
      else if (roll < 0.1) (pick.material as THREE.MeshStandardMaterial).alphaTest = random() < 0.5 ? 0 : 0.5;
      else if (roll < 0.11) groups[Math.floor(random() * groups.length)]!.add(pick);
      else if (roll < 0.115) pick.removeFromParent();
      else if (roll < 0.12) w.light.position.x += random() < 0.5 ? 0.5 : -0.5;
      else if (roll < 0.125) pick.layers.set(random() < 0.8 ? 0 : 3);
      else if (roll < 0.13) groups[0]!.position.y += 0.1;
      // A light that keeps moving (a cascade following a walking camera) draws full.
      if (step % 50 < 3) w.light.position.z += 0.25;
      const plans = w.frame(random() < 0.2 ? 400 : 16);
      for (const [plan, count] of Object.entries(plans)) totals[plan]! += count;
      expectSame(w);
      expectSame(w, second);
    }
    // The run exercised every plan, so equality above covers cached passes, not just full ones.
    for (const plan of ["full", "rebuild", "reuse", "hold"]) expect(totals[plan]).toBeGreaterThan(20);
    w.dispose();
  });

  test("casters settle into the layer only after holding still", () => {
    const w = world();
    const mesh = box();
    w.scene.add(mesh);
    w.frame(16);
    w.frame(16);
    expect(w.stats().staticCasters).toBe(0);
    for (let elapsed = 0; elapsed < SHADOW_STATIC_AFTER_MS * 2.5; elapsed += 100) w.frame(100);
    expect(w.stats().staticCasters).toBe(1);
    w.dispose();
  });
});
