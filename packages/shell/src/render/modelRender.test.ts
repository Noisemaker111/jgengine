import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverride } from "../materialOverride";
import {
  cacheStandardMaterials,
  cloneModelScene,
  disposeClonedMaterials,
  disposeModelScene,
  disposePaintCanvas,
  modelPlacementTransform,
  standardMaterialsOf,
  type PaintCanvas,
} from "./modelRender";
import { measureLocalBounds } from "./measureBounds";
import { measureLocalCollisionTriangles } from "./measureCollisionMesh";

function placeModelScene(content: THREE.Object3D, model: import("@jgengine/core/game/playableGame").ModelConfig): THREE.Group {
  const root = new THREE.Group().add(content);
  const transform = modelPlacementTransform(root, model);
  root.scale.setScalar(transform.scale);
  root.position.fromArray(transform.position);
  return root;
}

describe("model placement frame", () => {
  function importedRoot() {
    const content = new THREE.Group();
    content.position.set(7, 5, -4);
    content.scale.set(2, 3, 4);
    content.rotation.y = Math.PI / 4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4));
    mesh.position.set(1, 2, -1);
    content.add(mesh);
    return { content, mesh };
  }

  test("normalization preserves imported transforms and grounds the same bounds and triangles", () => {
    const { content, mesh } = importedRoot();
    content.updateMatrix();
    const authored = content.matrix.clone();
    const root = placeModelScene(content, { url: "fixture", targetHeight: 1.8, scale: 1.5, y: 0.3 });
    root.updateMatrixWorld(true);
    const rendered = new THREE.Box3().setFromObject(root);
    expect(rendered.min.y).toBeCloseTo(0.3, 6);
    expect(rendered.max.y - rendered.min.y).toBeCloseTo(2.7, 6);
    expect((rendered.min.x + rendered.max.x) / 2).toBeCloseTo(0, 6);
    expect((rendered.min.z + rendered.max.z) / 2).toBeCloseTo(0, 6);
    expect(content.matrix.equals(authored)).toBe(true);

    const bounds = measureLocalBounds(root)!;
    for (let axis = 0; axis < 3; axis += 1) {
      expect(bounds.min[axis]! * root.scale.x + root.position.getComponent(axis)).toBeCloseTo(rendered.min.getComponent(axis), 6);
      expect(bounds.max[axis]! * root.scale.x + root.position.getComponent(axis)).toBeCloseTo(rendered.max.getComponent(axis), 6);
    }
    const triangles = measureLocalCollisionTriangles(root, { scale: root.scale.x, offset: root.position.toArray() })!;
    const vertices = mesh.geometry.getAttribute("position");
    for (let index = 0; index < vertices.count; index += 1) {
      const renderedVertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(triangles.positions[index * 3 + axis]!).toBeCloseTo(renderedVertex.getComponent(axis), 5);
      }
    }
  });

  test("placement resolution can repeat without reparenting or changing the imported pose", () => {
    const { content } = importedRoot();
    const root = new THREE.Group().add(content);
    const model = { url: "fixture", targetHeight: 1.8 };
    const first = modelPlacementTransform(root, model);
    expect(modelPlacementTransform(root, model)).toEqual(first);
    expect(content.parent).toBe(root);
    expect(content.position.toArray()).toEqual([7, 5, -4]);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
  });

  test("origin anchoring adds model placement without replacing the imported pivot", () => {
    const { content } = importedRoot();
    const root = placeModelScene(content, { url: "fixture", anchor: "origin", scale: 0.5, y: 1 });
    root.updateMatrixWorld(true);
    expect(content.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([3.5, 3.5, -2]);
    expect(content.scale.toArray()).toEqual([2, 3, 4]);
  });

  test("root animation remains bound to imported content rather than the placement frame", () => {
    const { content } = importedRoot();
    const root = placeModelScene(content, { url: "fixture", anchor: "origin", scale: 0.5, y: 1 });
    const placement = root.position.clone();
    const mixer = new THREE.AnimationMixer(content);
    mixer.clipAction(new THREE.AnimationClip("root", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [7, 5, -4, 9, 5, -4]),
    ])).play();
    mixer.update(0.5);
    root.updateMatrixWorld(true);
    expect(content.position.toArray()).toEqual([8, 5, -4]);
    expect(root.position.equals(placement)).toBe(true);
    expect(content.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(4, 6);
  });

  test("indexed centering uses the imported footprint once", () => {
    const { content } = importedRoot();
    const box = new THREE.Box3().setFromObject(content);
    const root = placeModelScene(content, {
      url: "fixture", scale: 0.5, y: 0.1,
      dims: {
        footprint: { w: box.max.x - box.min.x, d: box.max.z - box.min.z },
        center: { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 },
        minY: box.min.y, maxY: box.max.y,
      },
    });
    const rendered = new THREE.Box3().setFromObject(root);
    expect(rendered.min.y).toBeCloseTo(0.1, 6);
    expect((rendered.min.x + rendered.max.x) / 2).toBeCloseTo(0, 6);
    expect(rendered.max.y - rendered.min.y).toBeCloseTo((box.max.y - box.min.y) * 0.5, 6);
  });
});

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
