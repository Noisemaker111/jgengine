import { expect, test } from "bun:test";
import * as THREE from "three";

import { planInteriorDressing } from "@jgengine/core/world/interiorDressing";

import { groupInteriorDecals, interiorCableGeometry, interiorDressingShapes, writeInteriorDecals } from "./InteriorDressing";
import { groupStaticShapeInstances } from "./staticShapeInstances";

const plan = planInteriorDressing([{ x: 0, z: 0, w: 12, d: 8 }, { x: 9, z: 2, w: 6, d: 10 }], { seed: "shell", floorY: 0, ceilingY: 4 });

test("every trim, fitting, pipe and lamp becomes one static shape, in a handful of batches", () => {
  const shapes = interiorDressingShapes(plan);
  expect(shapes).toHaveLength(plan.trims.length + plan.fittings.length + plan.pipes.length + plan.fixtures.length * 2);
  // One batch per family-and-shape: trim, fitting box, valve, pipe, housing, lens.
  expect(groupStaticShapeInstances(shapes).length).toBeLessThanOrEqual(6);
});

test("a pipe cylinder lies along its run", () => {
  const shapes = interiorDressingShapes({ ...plan, trims: [], fittings: [], fixtures: [], pipes: [{ id: "p", from: [0, 3, 0], to: [4, 3, 0], radius: 0.05 }] });
  const pipe = shapes[0]!;
  expect(pipe.shape).toBe("cylinder");
  expect(pipe.position).toEqual([2, 3, 0]);
  expect(pipe.scale).toEqual([0.05, 4, 0.05]);
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...pipe.rotation!));
  expect(Math.abs(axis.x)).toBeCloseTo(1);
});

test("the surfaces a game passes replace the defaults per family", () => {
  const shapes = interiorDressingShapes(plan, { pipe: { color: "#aa5522", metalness: 0.9 } });
  const pipes = shapes.filter((shape) => shape.surface.color === "#aa5522");
  expect(pipes).toHaveLength(plan.pipes.length);
});

test("all cables merge into one tube geometry", () => {
  const geometry = interiorCableGeometry(plan);
  expect(geometry).not.toBeNull();
  expect(geometry!.getAttribute("position").count).toBeGreaterThan(plan.cables.length * 20);
  expect(interiorCableGeometry({ ...plan, cables: [] })).toBeNull();
});

test("decals group by style and each faces its surface's normal", () => {
  const groups = groupInteriorDecals(plan.decals);
  expect([...groups.values()].reduce((sum, list) => sum + list.length, 0)).toBe(plan.decals.length);
  const floor = plan.decals.filter((decal) => decal.surface === "floor");
  const wall = plan.decals.filter((decal) => decal.surface === "wall");
  for (const list of [floor, wall]) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), list.length);
    writeInteriorDecals(mesh, list);
    const matrix = new THREE.Matrix4();
    list.forEach((decal, index) => {
      mesh.getMatrixAt(index, matrix);
      const facing = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
      expect(facing.dot(new THREE.Vector3(...decal.normal))).toBeCloseTo(1);
    });
    expect(mesh.count).toBe(list.length);
  }
});
