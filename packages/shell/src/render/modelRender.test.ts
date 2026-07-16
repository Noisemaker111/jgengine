import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverride } from "../materialOverride";
import {
  cacheStandardMaterials,
  cloneModelScene,
  disposeClonedMaterials,
  disposePaintCanvas,
  standardMaterialsOf,
  type PaintCanvas,
} from "./modelRender";

function standardMesh(color = "#ffffff"): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color }));
}

function meshWithColor(hex: string): THREE.Object3D {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: hex });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
  return root;
}

describe("cloneModelScene material lifecycle", () => {
  test("clones materials once so source cache materials stay untouched", () => {
    const source = new THREE.Group();
    const mesh = standardMesh("#abcdef");
    source.add(mesh);
    const original = mesh.material as THREE.MeshStandardMaterial;
    const cloned = cloneModelScene(source);
    const clonedMesh = cloned.children[0] as THREE.Mesh;
    const clonedMaterial = clonedMesh.material as THREE.MeshStandardMaterial;
    expect(clonedMaterial).not.toBe(original);
    expect(`#${clonedMaterial.color.getHexString()}`).toBe("#abcdef");
    clonedMaterial.color.set("#ff0000");
    expect(`#${original.color.getHexString()}`).toBe("#abcdef");
  });

  test("applyMaterialOverride with clone:false mutates already-cloned materials only once", () => {
    const source = new THREE.Group();
    source.add(standardMesh("#ffffff"));
    const cloned = cloneModelScene(source);
    const before = (cloned.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    applyMaterialOverride(cloned, { color: "#00ff00", metalness: 0.5 }, { clone: false });
    const after = (cloned.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(after).toBe(before);
    expect(`#${after.color.getHexString()}`).toBe("#00ff00");
    expect(after.metalness).toBeCloseTo(0.5, 5);
  });

  test("disposeClonedMaterials disposes unique materials on the instance tree", () => {
    const source = new THREE.Group();
    source.add(standardMesh("#111111"));
    source.add(standardMesh("#222222"));
    const cloned = cloneModelScene(source);
    const materials = (cloned.children as THREE.Mesh[]).map((mesh) => mesh.material as THREE.MeshStandardMaterial);
    let disposed = 0;
    for (const material of materials) {
      const original = material.dispose.bind(material);
      material.dispose = () => {
        disposed += 1;
        original();
      };
    }
    disposeClonedMaterials(cloned);
    expect(disposed).toBe(2);
  });
});

describe("disposePaintCanvas", () => {
  test("disposes the GPU texture and frees the canvas backing store on replacement/unmount", () => {
    const canvas = { width: 512, height: 512 } as unknown as HTMLCanvasElement;
    const texture = new THREE.CanvasTexture(canvas);
    let textureDisposed = false;
    texture.dispose = () => {
      textureDisposed = true;
    };
    const paint: PaintCanvas = { canvas, context: {} as CanvasRenderingContext2D, texture };

    disposePaintCanvas(paint);

    expect(textureDisposed).toBe(true);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

describe("cacheStandardMaterials", () => {
  test("walks the scene once and reuses the cache on later calls", () => {
    const root = meshWithColor("#336699");
    const first = cacheStandardMaterials(root);
    expect(first.materials.length).toBe(1);
    expect(first.seedColor.getHexString()).toBe("336699");
    const second = cacheStandardMaterials(root, first);
    expect(second).toBe(first);
    expect(second.materials).toBe(first.materials);
    expect(second.seedColor).toBe(first.seedColor);
  });

  test("seedColor is a stable Color instance across paint versions", () => {
    const root = meshWithColor("#112233");
    const cache = cacheStandardMaterials(root);
    const before = cache.seedColor;
    const again = cacheStandardMaterials(root, cache);
    expect(again.seedColor).toBe(before);
    expect(again.seedColor.getHexString()).toBe("112233");
    expect(standardMaterialsOf(root).length).toBe(1);
  });
});
