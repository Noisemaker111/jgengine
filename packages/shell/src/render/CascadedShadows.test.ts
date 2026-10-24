import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import { bindCsmMaterials, cascadeShadowCadence, createCascadeRefreshState, patchSceneMaterials, refreshCascadesOnTexelStep, releaseCascadedShadows, resolveShadowDistance, type CsmMaterialSetup } from "./CascadedShadows";
import { resolveGraphicsProfile } from "@jgengine/core/settings/graphicsProfile";

function fakeCsm(calls: THREE.Material[]): CsmMaterialSetup {
  return {
    setupMaterial(material) {
      calls.push(material);
      material.onBeforeCompile = () => {
        calls.push(material);
      };
    },
  };
}

describe("patchSceneMaterials", () => {
  test("patches standard materials once and skips non-standard", () => {
    const scene = new THREE.Scene();
    const standard = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const basic = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(standard, basic);

    const calls: THREE.Material[] = [];
    const patched = new WeakSet<THREE.Material>();
    patchSceneMaterials(scene, fakeCsm(calls), patched);
    patchSceneMaterials(scene, fakeCsm(calls), patched);

    expect(calls).toEqual([standard.material]);
    expect(patched.has(standard.material)).toBe(true);
    expect(patched.has(basic.material)).toBe(false);
  });

  test("keeps a material's own onBeforeCompile surgery alive under the CSM hook", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const order: string[] = [];
    material.onBeforeCompile = () => {
      order.push("own");
    };
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

    const csm: CsmMaterialSetup = {
      setupMaterial(mat) {
        mat.onBeforeCompile = () => {
          order.push("csm");
        };
      },
    };
    patchSceneMaterials(scene, csm, new WeakSet());

    const shader = {} as Parameters<THREE.Material["onBeforeCompile"]>[0];
    const renderer = {} as Parameters<THREE.Material["onBeforeCompile"]>[1];
    material.onBeforeCompile(shader, renderer);
    expect(order).toEqual(["own", "csm"]);
  });
});

describe("cascade cadence and shadow reach", () => {
  test("nearest cascades refresh every frame, far ones every 2nd or 4th", () => {
    expect([0, 1, 2].map((i) => cascadeShadowCadence(i, 3))).toEqual([1, 2, 4]);
    expect([0, 1, 2, 3].map((i) => cascadeShadowCadence(i, 4))).toEqual([1, 1, 2, 4]);
    expect([0, 1].map((i) => cascadeShadowCadence(i, 2))).toEqual([1, 2]);
    expect(cascadeShadowCadence(0, 1)).toBe(1);
  });

  test("shadow reach follows the tier and never exceeds the authored value", () => {
    expect(resolveShadowDistance(resolveGraphicsProfile("high"))).toBe(200);
    expect(resolveShadowDistance(resolveGraphicsProfile("medium"))).toBe(150);
    expect(resolveShadowDistance(resolveGraphicsProfile("medium", { drawDistance: 90 }))).toBe(90);
    expect(resolveShadowDistance(resolveGraphicsProfile("ultra"))).toBe(200);
    expect(resolveShadowDistance(resolveGraphicsProfile("medium"), 220)).toBe(220);
    expect(resolveShadowDistance(undefined)).toBe(200);
  });

  test("the cascade holding the player refreshes every frame, snapped or not", () => {
    const lights = Array.from({ length: 3 }, () => new THREE.DirectionalLight());
    const state = createCascadeRefreshState(1);
    const direction = new THREE.Vector3(-0.5, -1, -0.4).normalize();
    for (let frame = 0; frame < 30; frame++) {
      refreshCascadesOnTexelStep(lights, direction, state);
      expect(lights[0]!.shadow.autoUpdate).toBe(true);
      if (frame > 0) {
        expect(lights[1]!.shadow.autoUpdate).toBe(false);
        expect(lights[2]!.shadow.autoUpdate).toBe(false);
      }
      for (const light of lights) light.shadow.needsUpdate = false;
    }
    // 30 static frames: the player cascade each time, the far pair once at boot.
    expect(state.refreshes).toBe(30 + 2);
  });

  test("every cascade renders its depth pass in the same frame as its light moves", () => {
    const lights = Array.from({ length: 3 }, () => new THREE.DirectionalLight());
    const state = createCascadeRefreshState(0);
    const direction = new THREE.Vector3(-0.5, -1, -0.4).normalize();
    for (let frame = 0; frame < 8; frame++) {
      const moved = refreshCascadesOnTexelStep(lights, direction, state);
      const passes = lights.filter((light) => light.shadow.autoUpdate || light.shadow.needsUpdate).length;
      expect(passes).toBe(moved);
      for (const light of lights) light.shadow.needsUpdate = false;
    }
    expect(state.refreshes).toBe(3);
  });
});

describe("CSM lifecycle", () => {
  test("streamed descendants and replacement materials are patched before drawing, without a frame scan", () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const calls: THREE.Material[] = [];
    const unbind = bindCsmMaterials(scene, fakeCsm(calls));
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    let authoredDraws = 0;
    const prior = () => { authoredDraws++; };
    mesh.onBeforeRender = prior;
    group.add(mesh);
    expect(calls).toEqual([material]);
    const replacement = new THREE.MeshStandardMaterial();
    mesh.material = replacement;
    const draw = () => mesh.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.Camera(), mesh.geometry, replacement, null);
    for (let frame = 0; frame < 100; frame++) draw();
    expect(calls).toEqual([material, replacement]);
    expect(authoredDraws).toBe(100);
    group.remove(mesh);
    expect(mesh.onBeforeRender).toBe(prior);
    const afterRemoval = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.add(afterRemoval);
    expect(calls).toHaveLength(2);
    group.add(mesh);
    expect(calls).toHaveLength(3);
    unbind();
    expect(mesh.onBeforeRender).toBe(prior);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    expect(calls).toHaveLength(3);
  });

  test("disposed instance materials leave CSM's strong shader registry and retain their authored shader", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const chunks = { begin: THREE.ShaderChunk.lights_fragment_begin, pars: THREE.ShaderChunk.lights_pars_begin };
    const csm = new CSM({ parent: scene, camera, cascades: 3, shadowMapSize: 2048 });
    const material = new THREE.MeshStandardMaterial();
    const authored = () => {};
    material.onBeforeCompile = authored;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const unbind = bindCsmMaterials(scene, csm);
    try {
      expect(csm.shaders.has(material)).toBe(true);
      expect(material.defines?.USE_CSM).toBe(1);
      material.dispose();
      expect(csm.shaders.has(material)).toBe(false);
      expect(material.onBeforeCompile).toBe(authored);
      expect(material.defines?.USE_CSM).toBeUndefined();
    } finally {
      unbind();
      releaseCascadedShadows(csm);
      THREE.ShaderChunk.lights_fragment_begin = chunks.begin;
      THREE.ShaderChunk.lights_pars_begin = chunks.pars;
    }
  });

  test("rebuilding three 2048 cascades removes every old light, target, shadow map and shader binding", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const material = new THREE.MeshStandardMaterial();
    const authored = () => {};
    material.onBeforeCompile = authored;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(mesh);
    const chunks = { begin: THREE.ShaderChunk.lights_fragment_begin, pars: THREE.ShaderChunk.lights_pars_begin };
    let disposed = 0;
    try {
      for (let cycle = 0; cycle < 3; cycle++) {
        const csm = new CSM({ parent: scene, camera, cascades: 3, shadowMapSize: 2048 });
        const unbind = bindCsmMaterials(scene, csm);
        expect(scene.children).toHaveLength(7);
        for (const light of csm.lights) {
          expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
          light.shadow.map = new THREE.WebGLRenderTarget(2048, 2048);
          light.shadow.map.addEventListener("dispose", () => { disposed++; });
        }
        unbind();
        releaseCascadedShadows(csm);
        expect(scene.children).toEqual([mesh]);
        expect(csm.shaders.size).toBe(0);
        expect(material.onBeforeCompile).toBe(authored);
        expect(material.defines?.USE_CSM).toBeUndefined();
      }
      expect(disposed).toBe(9);
    } finally {
      THREE.ShaderChunk.lights_fragment_begin = chunks.begin;
      THREE.ShaderChunk.lights_pars_begin = chunks.pars;
    }
  });
});
