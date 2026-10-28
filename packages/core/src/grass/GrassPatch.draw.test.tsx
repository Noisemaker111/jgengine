import { expect, test } from "bun:test";
import { act, advance, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";

import { GrassCover } from "./GrassCover.draw";
import { bakeGrassNode, resolveGrassBake } from "./grassBake.draw";
import { readGrassLook } from "./grassKind";
import { registerGrassFieldRenderer } from "@jgengine/core/grass/GrassFieldRenderer.draw";
import { getSceneKindRenderer, type SceneKindRenderContext } from "@jgengine/core/scene/sceneKindRenderers.draw";

async function mounted(camera: THREE.Camera, element: ReactElement, run: (scene: THREE.Scene) => Promise<void> | void) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", camera, size: { width: 1600, height: 900, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  try {
    let scene!: THREE.Scene;
    await act(async () => { scene = root.render(element).getState().scene; });
    await act(async () => { advance(performance.now()); });
    scene.updateMatrixWorld(true);
    await run(scene);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

function cameraAt(x: number, y: number, z: number, target: [number, number, number]) {
  const camera = new THREE.PerspectiveCamera(55, 1600 / 900, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  return camera;
}

function bladeMeshes(scene: THREE.Scene): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>[] {
  const result: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>;
    if (mesh.isMesh && mesh.geometry.getAttribute("instanceOffset") !== undefined) result.push(mesh);
  });
  return result;
}

function covers(scene: THREE.Scene): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.getAttribute("instanceOffset") === undefined) result.push(mesh);
  });
  return result;
}

const renderer = () => {
  registerGrassFieldRenderer();
  return getSceneKindRenderer("grass_field")!;
};

test("translated authored grass roots follow world terrain without adding the volume height twice", async () => {
  const Renderer = renderer();
  const object = { id: "raised-meadow", kind: "grass_field", center: { x: 100, y: 7, z: -80 }, halfExtents: { x: 6, y: 0.5, z: 6 }, meta: { seed: "height-check" } };
  const sampleHeight = (x: number, z: number) => 3 + x * 0.08 - z * 0.03;
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(100, 15, -70, [100, 0, -80]), createElement(Renderer, { objects: [object], context }), (scene) => {
    let samples = 0;
    for (const mesh of bladeMeshes(scene)) {
      const offsets = mesh.geometry.getAttribute("instanceOffset");
      for (let i = 0; i < offsets.count; i++) {
        const world = new THREE.Vector3(offsets.getX(i), offsets.getY(i), offsets.getZ(i)).applyMatrix4(mesh.matrixWorld);
        expect(world.y).toBeCloseTo(sampleHeight(world.x, world.z), 3);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(0);
  });
});

test("an authored grass_field volume mounts the ground-cover mat under its blades", async () => {
  const Renderer = renderer();
  const object = { id: "park", kind: "grass_field", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 8, y: 0, z: 6 }, meta: { baseColor: "#53734a", tipColor: "#819064", seed: "park" } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: () => 1.2 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(0, 6, 12, [0, 0, 0]), createElement(Renderer, { objects: [object], context }), (scene) => {
    const mats = covers(scene);
    expect(mats).toHaveLength(1);
    const cover = mats[0]!;
    const color = cover.geometry.getAttribute("color");
    for (let i = 0; i < color.count; i++) expect(cover.geometry.getAttribute("position").getY(i)).toBeCloseTo(1.2 + 0.035, 4);
    let maxAlpha = 0;
    for (let i = 0; i < color.count; i++) maxAlpha = Math.max(maxAlpha, color.getW(i));
    expect(maxAlpha).toBeGreaterThan(0.7);
    expect(bladeMeshes(scene).length).toBeGreaterThan(0);
  });
});

test("a grass_field volume authored with groundCover 0 keeps bare ground", async () => {
  const Renderer = renderer();
  const object = { id: "blades-only", kind: "grass_field", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 6, y: 0, z: 6 }, meta: { groundCover: 0 } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: () => 0 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(0, 4, 8, [0, 0, 0]), createElement(Renderer, { objects: [object], context }), (scene) => {
    expect(covers(scene)).toHaveLength(0);
  });
});

test("the authored look reaches the blade shader", async () => {
  const Renderer = renderer();
  const object = { id: "authored-meadow", kind: "grass_field", center: { x: 0, y: 0.5, z: 0 }, halfExtents: { x: 16, y: 0.5, z: 10 },
    meta: { baseColor: "#27492b", tipColor: "#8da652", roughness: 0.63, seed: "authored", bladeWidth: 0.025, widthVariation: 0, normalLift: 0.3, season: 0.7 } };
  const context = { document: { markers: [], paths: [], volumes: [object] }, field: { sampleHeight: (x: number) => x * 0.05 }, groundColorAt: () => "#554433" } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(0, 2, 5, [0, 0, 0]), createElement(Renderer, { objects: [object], context }), (scene) => {
    const meshes = bladeMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    const material = meshes[0]!.material;
    expect(material.roughness).toBe(0.63);
    for (const mesh of meshes) {
      const shape = mesh.geometry.getAttribute("instanceShape");
      // Every grown blade carries the authored width; a blade the edge feather drops narrows to nothing.
      for (let i = 0; i < shape.count; i++) if (shape.getY(i) >= 0.2 * 0.55) expect(Math.abs(shape.getZ(i) - 0.025)).toBeLessThan(1e-6);
    }
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <lights_fragment_end>" };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    const uniforms = shader.uniforms as Record<string, THREE.IUniform<THREE.Color & THREE.Vector4>>;
    expect(uniforms.uBaseColor!.value.getHexString()).toBe("27492b");
    expect(uniforms.uTipColor!.value.getHexString()).toBe("8da652");
    expect(uniforms.uGroundColor!.value.getHexString()).toBe("554433");
    expect(uniforms.uShape!.value.y).toBe(0.3);
    expect(uniforms.uTone!.value.y).toBe(0.7);
    expect(shader.vertexShader).toContain("jgComputeGrassBlade");
  });
});

test("authored grass keeps offset spawn pads and diagonal routes clear without clearing their bounding box", async () => {
  const Renderer = renderer();
  const object = { id: "path-meadow", kind: "grass_field", center: { x: 100, y: 0.5, z: 100 }, halfExtents: { x: 12, y: 0.5, z: 12 }, meta: { seed: "route-check" } };
  const context = { document: {
    markers: [{ id: "arrival", kind: "player_spawn", position: { x: 93, y: 0, z: 107 }, meta: { clearance: 2 } }],
    volumes: [object],
    paths: [{ id: "diagonal", kind: "road", width: 2, points: [{ x: 89, y: 0, z: 89 }, { x: 111, y: 0, z: 111 }], meta: { clearance: 0.5 } }],
  }, field: { sampleHeight: () => 0 } } as unknown as SceneKindRenderContext;
  await mounted(cameraAt(100, 2, 105, [100, 0, 95]), createElement(Renderer, { objects: [object], context }), (scene) => {
    let routeSamples = 0, spawnSamples = 0, growing = 0;
    for (const mesh of bladeMeshes(scene)) {
      const offsets = mesh.geometry.getAttribute("instanceOffset"), shape = mesh.geometry.getAttribute("instanceShape");
      for (let i = 0; i < offsets.count; i++) {
        const x = offsets.getX(i), z = offsets.getZ(i), height = shape.getY(i);
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

test("the turf mat drapes the ground on its own, with a zero-strength mat drawing nothing", async () => {
  const props = { area: [10, 6] as const, seed: 7, colorBase: "#334422", colorTip: "#88aa55", edgeFeather: 1, heightAt: () => 2, coverageAt: () => 1 };
  await mounted(cameraAt(0, 6, 10, [0, 0, 0]), createElement(GrassCover, { ...props, strength: 1 }), (scene) => {
    const mats = covers(scene);
    expect(mats).toHaveLength(1);
    expect(mats[0]!.geometry.getAttribute("position").getY(0)).toBeGreaterThan(2);
  });
  await mounted(cameraAt(0, 6, 10, [0, 0, 0]), createElement(GrassCover, { ...props, strength: 0 }), (scene) => {
    expect(covers(scene)).toHaveLength(0);
  });
});

test("blades and turf stay off ground below the height a field grows above", () => {
  const look = readGrassLook({ growAbove: 3, bladeHeight: 0.5 });
  // Ground climbs from 0 m at x = -10 to 6 m at x = 10; the patch sits at world height 1.
  const bake = resolveGrassBake({ look, area: [20, 6], seed: "shore", edgeFeather: 0, baseHeight: 1, heightAt: (x) => (x + 10) * 0.3 - 1 });
  const tufts = bakeGrassNode(bake, bake.rootLevel, 0, 0, 1);
  let low = 0;
  let high = 0;
  for (let i = 0; i < tufts.count; i += 1) {
    const x = tufts.offsets[i * 3] ?? 0;
    const height = tufts.shape[i * 4 + 1] ?? 0;
    if (x < -1) low = Math.max(low, height);
    if (x > 1) high = Math.max(high, height);
  }
  expect(low).toBe(0);
  expect(high).toBeGreaterThan(0.2);
  expect(bake.turfAt(-8, 0)).toBe(0);
  expect(bake.turfAt(8, 0)).toBe(1);
});
