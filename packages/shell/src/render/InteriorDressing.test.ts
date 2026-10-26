import { expect, test } from "bun:test";
import * as THREE from "three";

import { planInteriorDressing } from "@jgengine/core/world/interiorDressing";

import { DEFAULT_INTERIOR_SURFACES, groupInteriorDecals, interiorCableGeometry, interiorDressingShapes, practicalFlicker, writeInteriorDecals } from "./InteriorDressing";
import { groupStaticShapeInstances } from "../instancing/staticShapeInstances";

const plan = planInteriorDressing([{ x: 0, z: 0, w: 12, d: 8 }, { x: 9, z: 2, w: 6, d: 10 }], { seed: "shell", floorY: 0, ceilingY: 4 });

test("every trim, panel, fitting, pipe and lamp becomes one static shape, in a handful of batches", () => {
  const shapes = interiorDressingShapes(plan);
  expect(plan.panels.length).toBeGreaterThan(0);
  expect(shapes).toHaveLength(plan.trims.length + plan.panels.length + plan.fittings.length + plan.pipes.length + plan.fixtures.length * 2);
  // One batch per family-and-shape: trim, panel, hatch, fitting box, valve, pipe, housing, lens, dead lens.
  expect(groupStaticShapeInstances(shapes).length).toBeLessThanOrEqual(9);
});

test("the lens of a dead lamp wears the unlit finish", () => {
  const fixture = { ...plan.fixtures[0]!, state: "dead" as const };
  const shapes = interiorDressingShapes({ ...plan, trims: [], panels: [], fittings: [], pipes: [], fixtures: [fixture, { ...fixture, id: "lit", state: "lit" }] });
  expect(shapes[1]!.surface).toBe(DEFAULT_INTERIOR_SURFACES.lensOff);
  expect(shapes[3]!.surface).toBe(DEFAULT_INTERIOR_SURFACES.lens);
});

test("a flickering lamp is mostly on, sometimes stutters and drops out, and repeats for a time and phase", () => {
  const samples = Array.from({ length: 400 }, (_, i) => practicalFlicker(i / 30, 0.37));
  expect(samples.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(samples.filter((value) => value > 0.85).length).toBeGreaterThan(samples.length / 2);
  expect(samples.some((value) => value < 0.1)).toBe(true);
  expect(practicalFlicker(1.234, 0.5)).toBe(practicalFlicker(1.234, 0.5));
});

test("a pipe cylinder lies along its run", () => {
  const shapes = interiorDressingShapes({ ...plan, trims: [], panels: [], fittings: [], fixtures: [], pipes: [{ id: "p", from: [0, 3, 0], to: [4, 3, 0], radius: 0.05 }] });
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
