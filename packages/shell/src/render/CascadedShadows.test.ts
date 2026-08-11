import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { patchSceneMaterials, type CsmMaterialSetup } from "./CascadedShadows";

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
