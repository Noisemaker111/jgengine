import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverride } from "../materialOverride";
import {
  cacheStandardMaterials,
  cloneModelScene,
  disposeClonedMaterials,
  disposeModelScene,
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
  test("preserves a shared skeleton within each clone and independent poses between clones", () => {
    const source = new THREE.Group();
    const bone = new THREE.Bone();
    const rig = new THREE.Skeleton([bone]);
    source.add(bone);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.bind(i === 2 ? new THREE.Skeleton([bone]) : rig);
      source.add(mesh);
    }
    const first = cloneModelScene(source);
    const second = cloneModelScene(source);
    const meshes = first.children.slice(1) as THREE.SkinnedMesh[];
    const clonedRig = meshes[0]!.skeleton;
    expect(meshes[1]!.skeleton).toBe(clonedRig);
    expect(meshes[2]!.skeleton).not.toBe(clonedRig);
    expect(clonedRig).not.toBe(rig);
    expect(clonedRig).not.toBe((second.children[1] as THREE.SkinnedMesh).skeleton);
    clonedRig.bones[0]!.position.y = 2;
    first.updateMatrixWorld(true);
    clonedRig.update();
    expect(meshes[1]!.skeleton.boneMatrices[13]).toBe(2);
    expect(rig.bones[0]!.position.y).toBe(0);
    expect((second.children[1] as THREE.SkinnedMesh).skeleton.bones[0]!.position.y).toBe(0);
    clonedRig.computeBoneTexture();
    let released = 0;
    clonedRig.boneTexture!.addEventListener("dispose", () => released++);
    disposeModelScene(first);
    expect(released).toBe(1);
  });

  test("preserves material sharing within an instance and isolation between instances", () => {
    const source = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry();
    source.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material));
    const first = cloneModelScene(source);
    const second = cloneModelScene(source);
    const materials = (first.children[0] as THREE.Mesh).material as THREE.Material[];
    expect(materials[0]).toBe(materials[1]);
    expect(materials[0]).toBe((first.children[1] as THREE.Mesh).material);
    expect(materials[0]).not.toBe(material);
    expect(materials[0]).not.toBe((second.children[1] as THREE.Mesh).material);
    expect((first.children[0] as THREE.Mesh).geometry).toBe(geometry);
  });

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

describe("disposeModelScene", () => {
  test("releases the rig and materials without releasing shared assets or attachments", () => {
    const source = new THREE.Group();
    const bone = new THREE.Bone();
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    source.add(mesh);
    mesh.skeleton.computeBoneTexture();
    const cloned = cloneModelScene(source);
    const clonedMesh = cloned.children[0] as THREE.SkinnedMesh;
    clonedMesh.skeleton.computeBoneTexture();
    const attachment = cloneModelScene(source);
    const attachedMesh = attachment.children[0] as THREE.SkinnedMesh;
    attachedMesh.skeleton.computeBoneTexture();
    cloned.add(attachment);
    let released = 0;
    let borrowedReleased = 0;
    (clonedMesh.material as THREE.Material).addEventListener("dispose", () => released++);
    clonedMesh.skeleton.boneTexture!.addEventListener("dispose", () => released++);
    for (const borrowed of [geometry, texture, material, mesh.skeleton.boneTexture!, attachedMesh.skeleton.boneTexture!, attachedMesh.material as THREE.Material]) {
      borrowed.addEventListener("dispose", () => borrowedReleased++);
    }
    disposeModelScene(cloned);
    expect(released).toBe(2);
    expect(borrowedReleased).toBe(0);
    expect(clonedMesh.skeleton.boneTexture).toBeNull();
    expect(mesh.skeleton.boneTexture).not.toBeNull();
    expect(attachedMesh.skeleton.boneTexture).not.toBeNull();
    disposeModelScene(attachment);
    expect(borrowedReleased).toBe(2);
  });

  test("releases a recreated bone texture after effect replay with borrowed materials", () => {
    const source = new THREE.Group();
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    source.add(mesh);
    const cloned = cloneModelScene(source, { cloneMaterials: false });
    const rig = (cloned.children[0] as THREE.SkinnedMesh).skeleton;
    let materialsReleased = 0;
    (mesh.material as THREE.Material).addEventListener("dispose", () => materialsReleased++);
    rig.computeBoneTexture();
    disposeModelScene(cloned);
    rig.computeBoneTexture();
    disposeModelScene(cloned);
    expect(rig.boneTexture).toBeNull();
    expect(materialsReleased).toBe(0);
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
