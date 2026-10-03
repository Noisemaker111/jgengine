import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { WebGLObjects } from "three/src/renderers/webgl/WebGLObjects.js";
import { generateBuilding } from "@jgengine/core/world/buildings";
import { defineBuildingKit } from "@jgengine/core/world/buildingKit";

import { bucketBuildingParts, composeBuildingKitMatrix, type BuildingKitInstance } from "./buildingKitFit";
import { applyBuildingChunk, partitionBuildingMatrices } from "./buildingSpatialBatch";
import { buildingChunkWithinBudget, resolveBuildingRenderPolicy } from "./BuildingRenderBudget";

function translation(x: number, y = 0, z = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

function vertices(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Vector3[] {
  const attribute = geometry.getAttribute("position");
  return Array.from({ length: attribute.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(attribute, index).applyMatrix4(matrix));
}

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], chunk: ReturnType<typeof partitionBuildingMatrices>[number]) {
  const mesh = new THREE.InstancedMesh(geometry, material, chunk.matrices.length);
  applyBuildingChunk(mesh, chunk);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

describe("building spatial chunks", () => {
  test("partitions every instance exactly once with stable negative and positive cells", () => {
    const geometry = new THREE.BoxGeometry();
    const matrices = [-65, -1, 0, 63, 64, 900].map((x) => translation(x));
    const chunks = partitionBuildingMatrices(geometry, matrices);
    expect(chunks.map((chunk) => chunk.key)).toEqual(["-2:0", "-1:0", "0:0", "1:0", "14:0"]);
    expect(chunks.flatMap((chunk) => chunk.matrices)).toEqual(matrices);
    expect(partitionBuildingMatrices(geometry, matrices).map((chunk) => chunk.key)).toEqual(chunks.map((chunk) => chunk.key));
    for (const chunk of chunks) for (const matrix of chunk.matrices) {
      for (const point of vertices(geometry, matrix)) expect(chunk.bounds.containsPoint(point)).toBe(true);
    }
    expect(() => partitionBuildingMatrices(geometry, matrices, undefined, 0)).toThrow(RangeError);
    geometry.dispose();
  });

  test("keeps compact batches crossing the grid origin together without changing instance order", () => {
    const geometry = new THREE.BoxGeometry();
    const matrices = [translation(3, 0, 3), translation(-3, 0, -3), translation(2, 0, -2)];
    const [chunk] = partitionBuildingMatrices(geometry, matrices);
    expect(chunk!.key).toBe("compact");
    expect(chunk!.matrices).toEqual(matrices);
    expect(chunk!.bounds.min.toArray()).toEqual([-3.5, -0.5, -3.5]);
    expect(chunk!.bounds.max.toArray()).toEqual([3.5, 0.5, 3.5]);
    geometry.dispose();
  });

  test("uses source geometry centers after fit and source transforms, preserving native and cover overflow", () => {
    const geometry = new THREE.BoxGeometry(4, 6, 2);
    geometry.translate(80, 5, -10);
    const source = new THREE.Matrix4().compose(
      new THREE.Vector3(13, 2, -9), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.8, 0.3)),
      new THREE.Vector3(2, 0.5, 3),
    );
    const bounds = { size: [4, 6, 2] as const, center: [80, 5, -10] as const };
    const parent = new THREE.Matrix4().compose(new THREE.Vector3(150, 8, -70),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.7, 0.1)), new THREE.Vector3(3, 0.4, 1.5));
    for (const fit of ["native", "stretch", "contain", "cover"] as const) {
      const instance: BuildingKitInstance = {
        position: [70, 3, -20], yaw: 0.9, slotScale: [2, 3, 7], fit,
        part: { model: "fixture.glb", scale: [1.5, 0.6, 2], rotation: [0.2, 0.3, 0.1], offset: [9, 2, -3] },
      };
      const fitMatrix = composeBuildingKitMatrix(instance, bounds, new THREE.Matrix4());
      const expected = new THREE.Matrix4().multiplyMatrices(fitMatrix, source);
      const [chunk] = partitionBuildingMatrices(geometry, [fitMatrix, translation(500).multiply(fitMatrix)], source);
      expect(chunk).toBeDefined();
      expect(chunk!.matrices[0]!.elements).toEqual(expected.elements);
      const transformedBounds = new THREE.Box3();
      const worldSphere = new THREE.Sphere();
      expect(buildingChunkWithinBudget(chunk!.bounds, parent, new THREE.Vector3(), resolveBuildingRenderPolicy(Infinity), true, transformedBounds, worldSphere)).toBe(true);
      const worldMatrix = new THREE.Matrix4().multiplyMatrices(parent, expected);
      for (const point of vertices(geometry, worldMatrix)) {
        expect(transformedBounds.containsPoint(point)).toBe(true);
        expect(worldSphere.distanceToPoint(point)).toBeLessThanOrEqual(1e-9);
      }
      const center = new THREE.Box3().setFromPoints(vertices(geometry, expected)).getCenter(new THREE.Vector3());
      expect(chunk!.key).toBe(`${Math.floor(center.x / 64)}:${Math.floor(center.z / 64)}`);
    }
    geometry.dispose();
  });

  test("real meshes preserve material arrays, groups and instance matrices while distance and frustum reduce candidate triangles", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = Array.from({ length: 6 }, (_, index) => new THREE.MeshStandardMaterial({ color: index % 2 ? "#123456" : "#fedcba" }));
    const matrices = [translation(0, 0, -20), translation(5, 0, -20), translation(900, 0, -20), translation(905, 0, -20)];
    const chunks = partitionBuildingMatrices(geometry, matrices);
    const meshes = chunks.map((chunk) => makeMesh(geometry, material, chunk));
    const originalGroups = geometry.groups.map((group) => ({ ...group }));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const policy = resolveBuildingRenderPolicy(120);
    const worldBounds = new THREE.Box3();
    const worldSphere = new THREE.Sphere();
    const trianglesPerInstance = geometry.groups.reduce((count, group) => count + group.count / 3, 0);
    const baseline = makeMesh(geometry, material, {
      key: "baseline", matrices, bounds: chunks.reduce((box, chunk) => box.union(chunk.bounds), new THREE.Box3()),
    });
    baseline.updateMatrixWorld();
    expect(frustum.intersectsObject(baseline)).toBe(true);
    const before = baseline.count * trianglesPerInstance;
    let after = 0;
    for (let index = 0; index < meshes.length; index += 1) {
      const mesh = meshes[index]!;
      mesh.updateMatrixWorld();
      mesh.visible = buildingChunkWithinBudget(chunks[index]!.bounds, mesh.matrixWorld, cameraPosition, policy, true, worldBounds, worldSphere);
      if (mesh.visible && frustum.intersectsObject(mesh)) after += mesh.count * trianglesPerInstance;
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.material).toBe(material);
      expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
      const stored = new THREE.Matrix4();
      chunks[index]!.matrices.forEach((matrix, instanceIndex) => {
        mesh.getMatrixAt(instanceIndex, stored);
        expect(stored.elements).toEqual(matrix.elements);
      });
    }
    expect(geometry.groups).toEqual(originalGroups);
    expect(before).toBe(48);
    expect(after).toBe(24);
    expect(meshes[1]!.visible).toBe(false);
    baseline.dispose();
    meshes.forEach((mesh) => mesh.dispose());
    geometry.dispose();
    material.forEach((entry) => entry.dispose());
  });

  test("near offscreen chunks remain shadow casters while a different camera frustum can include them", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial();
    const [chunk] = partitionBuildingMatrices(geometry, [translation(20, 0, 10)]);
    const mesh = makeMesh(geometry, material, chunk!);
    const main = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    const shadow = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 200);
    shadow.position.set(20, 30, 10);
    shadow.lookAt(20, 0, 10);
    const frustum = (camera: THREE.Camera) => {
      camera.updateMatrixWorld();
      return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    };
    mesh.updateMatrixWorld();
    mesh.visible = buildingChunkWithinBudget(chunk!.bounds, mesh.matrixWorld, new THREE.Vector3(), resolveBuildingRenderPolicy(120), true, new THREE.Box3(), new THREE.Sphere());
    expect(mesh.visible && mesh.castShadow && mesh.frustumCulled).toBe(true);
    expect(frustum(main).intersectsObject(mesh)).toBe(false);
    expect(frustum(shadow).intersectsObject(mesh)).toBe(true);
    mesh.dispose();
    geometry.dispose();
    material.dispose();
  });

  test("generated facade placements retain box fallback, kit routing and omissions across near and distant cells", () => {
    const building = generateBuilding({ id: "fixture", seed: "building-chunk-fixture", floors: 6, baysWide: 6, baysDeep: 4 });
    const kit = defineBuildingKit({ parts: { window: ["window.glb"] }, omit: ["roofProp"] });
    const buckets = bucketBuildingParts([
      { building, position: [0, 0, -20], rotationY: 0.3, pivot: [0, 0] },
      { building, position: [1000, 0, -20], rotationY: 0.3, pivot: [0, 0] },
    ], null, kit);
    expect(buckets.boxes.has("wall")).toBe(true);
    expect(buckets.boxes.has("window")).toBe(false);
    expect(buckets.boxes.has("roofProp")).toBe(false);
    expect(buckets.models.get("window.glb")!.length).toBeGreaterThan(0);
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ color: "#123456" });
    const policy = resolveBuildingRenderPolicy(120);
    let originalTriangles = 0;
    let retainedTriangles = 0;
    for (const matrices of buckets.boxes.values()) {
      originalTriangles += matrices.length * 12;
      const chunks = partitionBuildingMatrices(geometry, matrices);
      expect(chunks.flatMap((chunk) => chunk.matrices).length).toBe(matrices.length);
      for (const chunk of chunks) {
        const mesh = makeMesh(geometry, material, chunk);
        mesh.updateMatrixWorld();
        if (buildingChunkWithinBudget(chunk.bounds, mesh.matrixWorld, new THREE.Vector3(), policy, true, new THREE.Box3(), new THREE.Sphere())) {
          retainedTriangles += mesh.count * geometry.index!.count / 3;
        }
        mesh.dispose();
      }
    }
    expect(originalTriangles).toBeGreaterThan(1000);
    expect(retainedTriangles * 2).toBe(originalTriangles);
    geometry.dispose();
    material.dispose();
  });

  test("removing one chunk releases its real Three instance buffers while retaining shared geometry, materials and the other chunk", () => {
    const geometry = new THREE.BoxGeometry();
    const materials = [new THREE.MeshStandardMaterial({ color: "#123456" }), new THREE.MeshStandardMaterial({ color: "#fedcba" })];
    const chunks = partitionBuildingMatrices(geometry, [translation(0), translation(900)]);
    const first = new THREE.InstancedMesh(geometry, materials, 1);
    const second = new THREE.InstancedMesh(geometry, materials, 1);
    const releaseFirst = applyBuildingChunk(first, chunks[0]!);
    const releaseSecond = applyBuildingChunk(second, chunks[1]!);
    first.setColorAt(0, new THREE.Color("#ffffff"));
    second.setColorAt(0, new THREE.Color("#ffffff"));
    const resident = new Set<THREE.BufferAttribute>();
    const objects = WebGLObjects({ ARRAY_BUFFER: 0x8892 }, {
      get: (_mesh: THREE.Mesh, value: THREE.BufferGeometry) => value,
      update: (value: THREE.BufferGeometry) => resident.add(value.getAttribute("position") as THREE.BufferAttribute),
    }, {
      update: (attribute: THREE.BufferAttribute) => resident.add(attribute),
      remove: (attribute: THREE.BufferAttribute) => resident.delete(attribute),
    }, { render: { frame: 1 } });
    let sharedDisposals = 0;
    geometry.addEventListener("dispose", () => sharedDisposals += 1);
    materials.forEach((material) => material.addEventListener("dispose", () => sharedDisposals += 1));
    objects.update(first);
    objects.update(second);
    expect(resident.size).toBe(5);
    releaseFirst();
    expect(resident.has(first.instanceMatrix)).toBe(false);
    expect(resident.has(first.instanceColor!)).toBe(false);
    expect(resident.has(second.instanceMatrix)).toBe(true);
    expect(resident.has(second.instanceColor!)).toBe(true);
    expect(resident.has(geometry.getAttribute("position") as THREE.BufferAttribute)).toBe(true);
    expect(sharedDisposals).toBe(0);
    expect(second.geometry).toBe(geometry);
    expect(second.material).toBe(materials);
    const stored = new THREE.Matrix4();
    second.getMatrixAt(0, stored);
    expect(stored.elements).toEqual(chunks[1]!.matrices[0]!.elements);
    releaseSecond();
    expect(resident.size).toBe(1);
    geometry.dispose();
    materials.forEach((material) => material.dispose());
    expect(sharedDisposals).toBe(3);
    objects.dispose();
  });
});
