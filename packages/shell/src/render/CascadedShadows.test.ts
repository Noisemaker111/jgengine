import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";

import { bindCsmMaterials, patchSceneMaterials, releaseCascadedShadows, type CsmMaterialSetup } from "./CascadedShadows";

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
