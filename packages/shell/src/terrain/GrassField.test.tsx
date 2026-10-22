import { expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";
import { GrassField, type GrassFieldProps } from "./GrassField";
import { registerGrassFieldRenderer } from "../scene/GrassFieldRenderer";
import { getSceneKindRenderer, type SceneKindRenderContext } from "../scene/sceneKindRenderers";
import { createGrassBladeGeometry } from "./grassGeometry";

async function mounted(camera: THREE.Camera, element: ReactElement, run: (scene: THREE.Scene, render: (element: ReactElement | null) => Promise<void>) => Promise<void>) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", camera, size: { width: 800, height: 450, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  try {
    let scene!: THREE.Scene;
    const render = async (element: ReactElement | null) => act(async () => { scene = root.render(element).getState().scene; });
    await render(element);
    await run(scene, render);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

test("translated authored grass roots follow world terrain without adding the volume height twice", async () => {
  registerGrassFieldRenderer();
  const Renderer = getSceneKindRenderer("grass_field")!;
  const object = { id: "raised-meadow", kind: "grass_field", center: { x: 100, y: 7, z: -80 }, halfExtents: { x: 6, y: 0.5, z: 6 }, meta: { density: 8, seed: "height-check" } };
  const sampleHeight = (x: number, z: number) => 3 + x * 0.08 - z * 0.03;
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(100, 15, -70), createElement(Renderer, { objects: [object], context }), async scene => {
    scene.updateMatrixWorld(true);
    let samples = 0;
    for (const mesh of meshes(scene)) {
      const offsets = mesh.geometry.getAttribute("instanceOffset");
      for (let i = 0; i < offsets.count; i++) {
        const world = new THREE.Vector3(offsets.getX(i), offsets.getY(i), offsets.getZ(i)).applyMatrix4(mesh.matrixWorld);
        expect(world.y).toBeCloseTo(sampleHeight(world.x, world.z), 4);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(0);
  });
});

function cameraAt(x = 0, y = 2, z = 500) {
  const camera = new THREE.PerspectiveCamera(55, 800 / 450, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
function meshes(scene: THREE.Scene): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>[] {
  const result: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>[] = [];
  // Grass tuft meshes only: a `grass_field` now also mounts its ground-cover mat, which is a plain
  // indexed mesh with no per-tuft instance attributes.
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>;
    if (mesh.isMesh && mesh.geometry.getAttribute("instanceOffset") !== undefined) result.push(mesh);
  });
  return result;
}
function submission(scene: THREE.Scene, camera: THREE.Camera, shadow = false) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  let triangles = 0, draws = 0;
  for (const mesh of meshes(scene)) {
    if (shadow) mesh.onBeforeShadow({} as THREE.WebGLRenderer, scene, cameraAt(), camera, mesh.geometry, mesh.material, null);
    else mesh.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, mesh.geometry, mesh.material, null);
    if (mesh.geometry.instanceCount > 0) draws++;
    triangles += mesh.geometry.index!.count / 3 * mesh.geometry.instanceCount;
  }
  return { triangles, draws };
}

test("fully faded grass contributes no submitted instance triangles", async () => {
  const camera = cameraAt();
  await mounted(camera, createElement(GrassField, { count: 64_800, density: 18, area: 60, seed: "meadow", wind: false }), async (scene) => {
    const work = submission(scene, camera);
    console.log("distant wind-off public geometry submission", work);
    expect(work).toEqual({ triangles: 0, draws: 0 });
  });
});

test("each camera decides independently; transformed patches and disabled fade retain their budget", async () => {
  const far = cameraAt();
  const props: GrassFieldProps = { count: 2500, density: 100, budget: 1200, area: [35, 20], seed: "reeds", tuftBlades: 3,
    bladeHeight: [1, 2], wind: { strength: 1.5, flutter: 0.3 }, colorBase: "#123456", colorTip: "#abcdef", castShadow: true, frustumCulled: false };
  const tree = (fade: GrassFieldProps["distanceFade"]) => createElement("group", { position: [70, 3, 20], scale: [3, 1.5, 0.5], rotation: [0, 0.6, 0] },
    createElement(GrassField, { ...props, position: [4, 1, 2], rotation: [0, 0.8, 0], distanceFade: fade }));
  await mounted(far, tree({ start: 20, end: 50 }), async (scene, render) => {
    expect(submission(scene, far)).toEqual({ triangles: 0, draws: 0 });
    const root = meshes(scene)[0]!;
    const near = cameraAt();
    near.position.copy(root.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 3, 5));
    near.updateMatrixWorld();
    expect(submission(scene, near).triangles).toBe(9600);
    expect(submission(scene, far).triangles).toBe(0);
    expect(submission(scene, far, true).triangles).toBe(9600);
    expect(submission(scene, far).triangles).toBe(0);
    for (const fade of [false, { start: 50, end: 50 }, { start: 70, end: 30 }] as const) {
      await render(tree(fade));
      expect(submission(scene, far).triangles).toBe(9600);
    }
  });
});

test("chunk frusta reject offscreen work without resampling or disposing on camera/budget changes", async () => {
  const camera = cameraAt(0, 2, 0);
  camera.lookAt(0, 2, -20);
  camera.updateMatrixWorld();
  const props: GrassFieldProps = { count: 64_800, density: 18, area: 60, seed: "budget", distanceFade: false };
  await mounted(camera, createElement(GrassField, props), async (scene, render) => {
    const original = meshes(scene);
    const material = original[0]!.material;
    let geometriesDisposed = 0, materialsDisposed = 0;
    for (const mesh of original) mesh.geometry.addEventListener("dispose", () => geometriesDisposed++);
    material.addEventListener("dispose", () => materialsDisposed++);
    const work = submission(scene, camera);
    expect(work.triangles).toBeGreaterThan(0);
    expect(work.triangles).toBeLessThan(518400);
    expect(original.length).toBeLessThanOrEqual(64);
    expect(new Set(original.map((mesh) => mesh.material)).size).toBe(1);
    await render(createElement(GrassField, { ...props, budget: 500, frustumCulled: false }));
    expect(meshes(scene).map((mesh) => mesh.geometry)).toEqual(original.map((mesh) => mesh.geometry));
    expect(submission(scene, camera).triangles).toBe(4000);
    const selectedPhases = meshes(scene).flatMap((mesh) => Array.from({ length: mesh.geometry.instanceCount }, (_, i) => mesh.geometry.getAttribute("instancePhase").getX(i))).sort((a, b) => a - b);
    const source = createGrassBladeGeometry({ count: props.count, area: props.area, seed: props.seed });
    expect(selectedPhases).toEqual(Array.from({ length: 100 }, (_, i) => source.getAttribute("instancePhase").getX(i)).sort((a, b) => a - b));
    source.dispose();
    expect(geometriesDisposed + materialsDisposed).toBe(0);
    await render(null);
    expect(geometriesDisposed).toBe(original.length);
    expect(materialsDisposed).toBe(1);
  });
});

test("main and shadow hooks keep caller callbacks and conservative sampled/wind bounds", async () => {
  const camera = cameraAt();
  let mainCalls = 0, shadowCalls = 0;
  const props: GrassFieldProps = { count: 2500, area: [60, 20], seed: "high-bounds", heightAt: (x) => 400 + x * 2,
    bladeHeight: [3, 7], bladeWidth: [0.1, 0.4], bladeBend: [0.5, 2], wind: { strength: 4, flutter: 2 }, castShadow: true,
    onBeforeRender() { mainCalls++; }, onBeforeShadow() { shadowCalls++; } };
  await mounted(camera, createElement(GrassField, props), async (scene) => {
    submission(scene, camera);
    submission(scene, camera, true);
    expect(mainCalls).toBe(meshes(scene).length);
    expect(shadowCalls).toBe(meshes(scene).length);
    for (const mesh of meshes(scene)) {
      const offsets = mesh.geometry.getAttribute("instanceOffset");
      for (let i = 0; i < offsets.count; i++) {
        const root = new THREE.Vector3(offsets.getX(i), offsets.getY(i), offsets.getZ(i));
        expect(mesh.geometry.boundingBox!.containsPoint(root)).toBe(true);
        expect(mesh.geometry.boundingBox!.containsPoint(root.clone().add(new THREE.Vector3(7, 7, 7)))).toBe(true);
        expect(mesh.geometry.boundingSphere!.containsPoint(root)).toBe(true);
      }
      expect(mesh.castShadow).toBe(true);
    }
  });
});

test("an authored grass_field volume mounts the ground-cover mat under its blades", async () => {
  registerGrassFieldRenderer();
  const Renderer = getSceneKindRenderer("grass_field")!;
  const object = { id: "park", kind: "grass_field", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 8, y: 0, z: 6 },
    meta: { density: 24, colorBase: "#53734a", colorTip: "#819064", seed: "park" } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: () => 1.2 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(0, 6, 12), createElement(Renderer, { objects: [object], context }), async (scene) => {
    const covers: THREE.Mesh[] = [];
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.getAttribute("instanceOffset") === undefined) covers.push(mesh);
    });
    expect(covers).toHaveLength(1);
    const cover = covers[0]!;
    const color = cover.geometry.getAttribute("color");
    expect(color.itemSize).toBe(4);
    expect(cover.geometry.index!.count).toBeGreaterThan(0);
    // Every vertex rides the runtime ground, and the authored alpha reaches full cover in the middle.
    for (let i = 0; i < color.count; i++) {
      expect(cover.geometry.getAttribute("position").getY(i)).toBeCloseTo(1.2 + 0.035, 4);
    }
    let maxAlpha = 0;
    for (let i = 0; i < color.count; i++) maxAlpha = Math.max(maxAlpha, color.getW(i));
    expect(maxAlpha).toBeGreaterThan(0.7);
    expect((cover.material as THREE.MeshStandardMaterial).transparent).toBe(true);
    expect((cover.material as THREE.MeshStandardMaterial).depthWrite).toBe(false);
  });
});

test("a grass_field volume authored with groundCover 0 keeps bare ground", async () => {
  registerGrassFieldRenderer();
  const Renderer = getSceneKindRenderer("grass_field")!;
  const object = { id: "blades-only", kind: "grass_field", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 6, y: 0, z: 6 },
    meta: { density: 8, groundCover: 0 } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: () => 0 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(0, 4, 8), createElement(Renderer, { objects: [object], context }), async (scene) => {
    let covers = 0;
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.getAttribute("instanceOffset") === undefined) covers += 1;
    });
    expect(covers).toBe(0);
  });
});

test("authored grass renderer uses the same bounded submission while preserving its material", async () => {
  registerGrassFieldRenderer();
  const Renderer = getSceneKindRenderer("grass_field")!;
  const object = { id: "authored-meadow", kind: "grass_field", center: { x: 0, y: 0.5, z: 0 }, halfExtents: { x: 16, y: 0.5, z: 10 },
    meta: { density: 2, colorBase: "#27492b", colorTip: "#8da652", roughness: 0.63, seed: "authored", bladeWidthMin: 0.025, bladeWidthMax: 0.025, bladeBendMin: 0.04, bladeBendMax: 0.04, normalLift: 0.3 } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: (x: number) => x * 0.05 }, groundColorAt: () => "#554433" } as unknown as SceneKindRenderContext;
  const far = cameraAt();
  await mounted(far, createElement(Renderer, { objects: [object], context }), async (scene) => {
    expect(submission(scene, far).triangles).toBe(0);
    const near = cameraAt(0, 2, 5);
    expect(submission(scene, near).triangles).toBeGreaterThan(0);
    const material = meshes(scene)[0]!.material;
    expect(material.roughness).toBe(0.63);
    for (const mesh of meshes(scene)) {
      expect(Array.from(mesh.geometry.getAttribute("instanceWidth").array).every(width => Math.abs(width - 0.025) < 1e-6)).toBe(true);
      expect(Array.from(mesh.geometry.getAttribute("instanceBend").array).every(bend => Math.abs(bend - 0.04) < 1e-6)).toBe(true);
    }
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <lights_fragment_end>" };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    const uniforms = shader.uniforms as Record<string, THREE.IUniform<THREE.Color>>;
    expect(uniforms.uColorBase!.value.getHexString()).toBe("27492b");
    expect(uniforms.uColorTip!.value.getHexString()).toBe("8da652");
    expect(uniforms.uColorGround!.value.getHexString()).toBe("554433");
    expect((shader.uniforms as Record<string, THREE.IUniform<number>>).uNormalLift!.value).toBe(0.3);
    expect(shader.vertexShader).toContain("(1.0 + fadeT * 1.4) * keep");
    expect(shader.vertexShader).toContain("(0.4 + 0.6 * bladeVary.y) * keep");
  });
});

test("authored grass keeps offset spawn pads and diagonal routes clear without clearing their bounding box", async () => {
  registerGrassFieldRenderer();
  const Renderer = getSceneKindRenderer("grass_field")!;
  const object = { id: "path-meadow", kind: "grass_field", center: { x: 100, y: 0.5, z: 100 }, halfExtents: { x: 12, y: 0.5, z: 12 }, meta: { density: 8, seed: "route-check" } };
  const context = { document: {
    markers: [{ id: "arrival", kind: "player_spawn", position: { x: 93, y: 0, z: 107 }, meta: { clearance: 2 } }],
    volumes: [object],
    paths: [{ id: "diagonal", kind: "road", width: 2, points: [{ x: 89, y: 0, z: 89 }, { x: 111, y: 0, z: 111 }], meta: { clearance: 0.5 } }],
  }, field: { sampleHeight: () => 0 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(100, 2, 105), createElement(Renderer, { objects: [object], context }), async (scene) => {
    let routeSamples = 0, spawnSamples = 0, growing = 0;
    for (const mesh of meshes(scene)) {
      const offsets = mesh.geometry.getAttribute("instanceOffset"), heights = mesh.geometry.getAttribute("instanceHeight");
      for (let i = 0; i < offsets.count; i++) {
        const x = offsets.getX(i), z = offsets.getZ(i), height = heights.getX(i);
        if (Math.abs(x - z) / Math.SQRT2 < 1.5) { routeSamples++; expect(height).toBe(0); }
        if (Math.hypot(x + 7, z - 7) < 2) { spawnSamples++; expect(height).toBe(0); }
        if (Math.abs(x - z) / Math.SQRT2 > 4 && Math.hypot(x + 7, z - 7) > 5 && height > 0) growing++;
      }
    }
    expect(routeSamples).toBeGreaterThan(0);
    expect(spawnSamples).toBeGreaterThan(0);
    expect(growing).toBeGreaterThan(0);
  });
});
