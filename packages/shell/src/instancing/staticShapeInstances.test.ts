import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { groupStaticShapeInstances, writeStaticShapeInstances, type StaticShapeInstance } from "./staticShapeInstances";

const box: StaticShapeInstance = { shape: "box", position: [2, 1, -3], scale: [2, 1, 3], surface: { color: "#765432" } };
describe("static authored shapes", () => {
  test("groups compatible shapes with stable map ordering while preserving shadow and sampler policy", () => {
    const first = { ...box, surface: { maps: { color: "c.png", normal: "n.png" } } };
    const second = { ...box, surface: { maps: { normal: "n.png", color: "c.png" } } };
    const batches = groupStaticShapeInstances([first, second, { ...first, shadows: "none" }, { ...first, surface: { ...first.surface, wrapping: "clamp" } }, { ...box, shape: "cylinder" }]);
    expect(batches).toHaveLength(4);
    expect(batches[0]!.instances).toEqual([first, second]);
    expect(batches[3]!.radialSegments).toBe(16);
    expect(() => groupStaticShapeInstances([{ ...box, scale: [1, 0, 1] }])).toThrow();
    expect(() => groupStaticShapeInstances([{ ...box, position: [NaN, 0, 0] }])).toThrow();
    expect(() => groupStaticShapeInstances([{ ...box, shape: "cylinder", radialSegments: 2 }])).toThrow();
  });

  test("normalized height displacement remains inside conservative scaled bounds", () => {
    const geometry = new THREE.BoxGeometry();
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 1);
    const instance: StaticShapeInstance = { ...box, position: [0, 0, 0], scale: [2, 3, 4], surface: { maps: { height: "height.png" }, displacementScale: 0.6, displacementBias: -0.2 } };
    writeStaticShapeInstances(mesh, [instance]);
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) {
      for (const displacement of [-0.2, 0.4]) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).addScaledVector(new THREE.Vector3().fromBufferAttribute(normals, i), displacement).applyMatrix4(matrix);
        expect(mesh.boundingBox!.containsPoint(point)).toBe(true);
        expect(mesh.boundingSphere!.containsPoint(point)).toBe(true);
      }
    }
    mesh.dispose(); geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });

  test("bounds enclose rotated nonuniform instances under an affine parent and shrink after replacement", () => {
    const geometry = new THREE.BoxGeometry();
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
    const instances: StaticShapeInstance[] = [box, { ...box, position: [40, 10, -7], rotation: [0.3, 0.7, 1], scale: [1, 7, 0.3] }];
    writeStaticShapeInstances(mesh, instances);
    const parent = new THREE.Matrix4().set(3, 2, 1, 4, 0, 0.3, 1, 5, 1, 1, 2, 8, 0, 0, 0, 1);
    const worldSphere = mesh.boundingSphere!.clone().applyMatrix4(parent);
    const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < instances.length; i++) {
      mesh.getMatrixAt(i, matrix);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
        expect(mesh.boundingBox!.containsPoint(point)).toBe(true);
        expect(worldSphere.distanceToPoint(point.applyMatrix4(parent))).toBeLessThanOrEqual(1e-5);
      }
    }
    const radius = mesh.boundingSphere!.radius;
    writeStaticShapeInstances(mesh, [box]);
    expect(mesh.count).toBe(1);
    expect(mesh.boundingSphere!.radius).toBeLessThan(radius);
    mesh.dispose(); geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });
});

test("mounted batches retune matrices, share only compatible draws and dispose owned resources", async () => {
  const { act, createRoot, extend } = await import("@react-three/fiber");
  const { createElement, Suspense } = await import("react");
  const { StaticShapeInstances } = await import("./staticShapeInstances");
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  try {
    let scene: THREE.Scene;
    const render = async (instances: StaticShapeInstance[]) => act(async () => {
      scene = root.render(createElement(Suspense, { fallback: null }, createElement(StaticShapeInstances, { instances }))).getState().scene;
    });
    await render([box, { ...box, position: [10, 0, 0] }]);
    const meshes = () => scene.children.filter(node => (node as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes()).toHaveLength(1);
    const mesh = meshes()[0]!;
    expect(mesh.count).toBe(2);
    const geometry = mesh.geometry;
    const material = mesh.material as THREE.MeshStandardMaterial;
    let geometryDisposals = 0, materialDisposals = 0, meshDisposals = 0;
    geometry.addEventListener("dispose", () => geometryDisposals++);
    material.addEventListener("dispose", () => materialDisposals++);
    mesh.addEventListener("dispose", () => meshDisposals++);
    await render([{ ...box, position: [50, 0, 0] }, box]);
    expect(meshes()[0]).toBe(mesh);
    expect(meshes()[0]!.geometry).toBe(geometry);
    expect(meshes()[0]!.material).toBe(material);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(50);
    expect(geometryDisposals + materialDisposals).toBe(0);
    await act(async () => root.render(null));
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(meshDisposals).toBe(1);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
