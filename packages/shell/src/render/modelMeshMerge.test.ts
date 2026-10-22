import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import { mergedMeshNames, mergeModelSubMeshes, meshMatchesName, setModelSubMeshMerge } from "./modelMeshMerge";

afterEach(() => setModelSubMeshMerge(true));

function box(offset: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(offset, 0, 0);
  return geometry;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh === true) found.push(node as THREE.Mesh);
  });
  return found;
}

function triangles(root: THREE.Object3D): number {
  return meshes(root).reduce((total, mesh) => total + (mesh.geometry.index?.count ?? 0) / 3, 0);
}

describe("mergeModelSubMeshes", () => {
  test("collapses meshes sharing a material and keeps the vertex positions they had", () => {
    const root = new THREE.Group();
    const shared = new THREE.MeshStandardMaterial();
    const other = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(box(0), shared);
    a.name = "hull_a";
    const b = new THREE.Mesh(box(10), shared);
    b.name = "hull_b";
    const c = new THREE.Mesh(box(20), other);
    c.name = "trim";
    root.add(a, b, c);
    root.updateMatrixWorld(true);
    const before = triangles(root);

    const report = mergeModelSubMeshes(root);

    expect(report).toEqual({ merged: 1, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
    expect(triangles(root)).toBe(before);
    const hull = meshes(root).find((mesh) => mesh.name === "hull_a")!;
    expect(hull.material).toBe(shared);
    const positions = hull.geometry.getAttribute("position");
    let maxX = -Infinity;
    let minX = Infinity;
    for (let i = 0; i < positions.count; i += 1) {
      maxX = Math.max(maxX, positions.getX(i));
      minX = Math.min(minX, positions.getX(i));
    }
    expect(minX).toBeCloseTo(-0.5);
    expect(maxX).toBeCloseTo(10.5);
  });

  test("bakes a parent transform into the merged vertices", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.set(0, 5, 0);
    const material = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(box(0), material);
    const b = new THREE.Mesh(box(4), material);
    parent.add(a, b);
    root.add(parent);
    root.updateMatrixWorld(true);

    mergeModelSubMeshes(root);

    const merged = meshes(root)[0]!;
    merged.updateMatrixWorld(true);
    const world = new THREE.Box3().setFromObject(merged);
    expect(world.min.y).toBeCloseTo(4.5);
    expect(world.max.y).toBeCloseTo(5.5);
    expect(world.min.x).toBeCloseTo(-0.5);
    expect(world.max.x).toBeCloseTo(4.5);
  });

  test("leaves skinned meshes and their rig alone", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const geometry = box(0);
    geometry.setAttribute("skinIndex", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.add(bone);
    skinned.bind(skeleton);
    root.add(skinned, new THREE.Mesh(box(6), material));

    const report = mergeModelSubMeshes(root);

    expect(report).toEqual({ merged: 0, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
    expect(root.children[0]).toBe(skinned);
  });

  test("leaves an animated model whole", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(box(0), material);
    const b = new THREE.Mesh(box(4), material);
    root.add(a, b);
    const clip = new THREE.AnimationClip("spin", 1, [new THREE.VectorKeyframeTrack("a.position", [0, 1], [0, 0, 0, 0, 1, 0])]);

    expect(mergeModelSubMeshes(root, [clip])).toEqual({ merged: 0, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
  });

  test("does not merge a mesh that carries children, only its leaf children", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const body = new THREE.Mesh(box(0), material);
    const wheelA = new THREE.Mesh(box(1), material);
    const wheelB = new THREE.Mesh(box(2), material);
    body.add(wheelA, wheelB);
    root.add(body);

    expect(mergeModelSubMeshes(root)).toEqual({ merged: 1, kept: 2 });
    expect(root.children).toHaveLength(2);
    expect(body.children).toHaveLength(0);
    expect(triangles(root)).toBe(36);
  });

  test("records the names a merged mesh absorbed", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(box(0), material);
    a.name = "Body";
    const b = new THREE.Mesh(box(2), material);
    b.name = "BodyTrim";
    root.add(a, b);

    mergeModelSubMeshes(root);

    const merged = meshes(root)[0]!;
    expect(merged.name).toBe("Body");
    expect(mergedMeshNames(merged)).toEqual(["Body", "BodyTrim"]);
    expect(meshMatchesName(merged, "BodyTrim")).toBe(true);
    expect(meshMatchesName(merged, "Missing")).toBe(false);
  });

  test("does not merge geometries whose attribute layout differs", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const plain = new THREE.Mesh(box(0), material);
    const withUv2 = new THREE.Mesh(box(2), material);
    withUv2.geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(new Float32Array(withUv2.geometry.attributes.position.count * 2), 2));
    root.add(plain, withUv2);

    expect(mergeModelSubMeshes(root)).toEqual({ merged: 0, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
  });

  test("skips hidden meshes instead of revealing them", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const visible = new THREE.Mesh(box(0), material);
    const hidden = new THREE.Mesh(box(2), material);
    hidden.visible = false;
    root.add(visible, hidden);

    expect(mergeModelSubMeshes(root)).toEqual({ merged: 0, kept: 2 });
    expect(hidden.visible).toBe(false);
  });

  test("skips a mirrored mesh, whose baked winding would invert", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const mirrored = new THREE.Group();
    mirrored.scale.x = -1;
    const a = new THREE.Mesh(box(0), material);
    const b = new THREE.Mesh(box(2), material);
    mirrored.add(a, b);
    root.add(mirrored);

    expect(mergeModelSubMeshes(root)).toEqual({ merged: 0, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
  });

  test("merging can be switched off", () => {
    setModelSubMeshMerge(false);
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    root.add(new THREE.Mesh(box(0), material), new THREE.Mesh(box(2), material));

    expect(mergeModelSubMeshes(root)).toEqual({ merged: 0, kept: 2 });
    expect(meshes(root)).toHaveLength(2);
  });
});
