import { describe, expect, test } from "bun:test";

import * as THREE from "three";

import type { ParticleBuffers } from "@jgengine/core/vfx/particles";

import { createFieldGeometry, fieldPrograms, packFieldFrame, returnFieldMaterial, takeFieldMaterial } from "./ParticleField.draw";

function twoParticles(): ParticleBuffers {
  return {
    count: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6, 0, 0, 0]),
    sizes: new Float32Array([0.5, 0.7, 0]),
    colors: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0, 0, 0]),
    alphas: new Float32Array([0.9, 0.8, 0]),
    ids: new Float64Array([10, 11, 0]),
    velocities: new Float32Array([7, 8, 9, 10, 11, 12, 0, 0, 0]),
    previousPositions: new Float32Array([-1, -2, -3, -4, -5, -6, 0, 0, 0]),
  };
}

function sharedBuffers(geometry: THREE.BufferGeometry, names: string[]): Set<unknown> {
  return new Set(names.map((name) => {
    const attribute = geometry.getAttribute(name);
    return "data" in attribute ? attribute.data : attribute;
  }));
}

describe("particle field geometry", () => {
  test("a quad field keeps every per-particle value in one buffer and sends only its live particles", () => {
    const field = createFieldGeometry(3, true, false);
    expect(sharedBuffers(field.geometry, ["aCenter", "aEnd", "aVelocity", "aColor", "aId", "aSize", "aAlpha"])).toEqual(new Set([field.packed]));
    const before = field.packed.version;
    packFieldFrame(field, twoParticles());
    const read = (name: string, index: number) => {
      const attribute = field.geometry.getAttribute(name);
      return [attribute.getX(index), attribute.itemSize > 1 ? attribute.getY(index) : undefined];
    };
    expect(read("aCenter", 1)).toEqual([4, 5]);
    expect(read("aEnd", 0)).toEqual([-1, -2]);
    expect(read("aVelocity", 1)).toEqual([10, 11]);
    expect(read("aColor", 1)[0]).toBeCloseTo(0.4);
    expect(read("aId", 1)[0]).toBe(11);
    expect(read("aSize", 0)[0]).toBeCloseTo(0.5);
    expect(read("aAlpha", 1)[0]).toBeCloseTo(0.8);
    expect(field.packed.version).toBe(before + 1);
    expect(field.packed.updateRanges).toEqual([{ start: 0, count: 2 * field.packed.stride }]);
    expect((field.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(2);
  });

  test("a ribbon segment ends at the particle born just before it", () => {
    const field = createFieldGeometry(3, true, true);
    packFieldFrame(field, twoParticles());
    const end = field.geometry.getAttribute("aEnd");
    expect([end.getX(1), end.getY(1), end.getZ(1)]).toEqual([1, 2, 3]);
    expect([end.getX(0), end.getY(0), end.getZ(0)]).toEqual([-1, -2, -3]);
  });

  test("a point field shares one buffer too, and an emptied field draws nothing and sends nothing", () => {
    const field = createFieldGeometry(3, false, false);
    expect(sharedBuffers(field.geometry, ["position", "aColor", "aSize", "aAlpha"])).toEqual(new Set([field.packed]));
    packFieldFrame(field, twoParticles());
    expect(field.geometry.getAttribute("position").getY(1)).toBe(5);
    expect(field.geometry.drawRange.count).toBe(2);
    const sent = field.packed.version;
    packFieldFrame(field, { ...twoParticles(), count: 0 });
    expect(field.geometry.drawRange.count).toBe(0);
    expect(field.packed.version).toBe(sent);
  });
});

describe("particle field materials", () => {
  test("warmup keeps one of each real field program alive without adding any particles", () => {
    const primers = fieldPrograms();
    const point = primers.objects.find((object): object is THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> => object instanceof THREE.Points);
    const quad = primers.objects.find((object): object is THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> => object instanceof THREE.Mesh && object.geometry instanceof THREE.InstancedBufferGeometry);
    expect(point).toBeDefined();
    expect(quad).toBeDefined();
    if (point === undefined || quad === undefined) throw new Error("both field kinds must be primed");
    expect(point.geometry.drawRange.count).toBe(0);
    expect(quad.geometry.instanceCount).toBe(0);
    expect(primers.objects.every((object) => object.parent === null)).toBe(true);
    const live = takeFieldMaterial(true, false, "additive");
    expect(live.vertexShader).toBe(quad.material.vertexShader);
    expect(live.fragmentShader).toBe(quad.material.fragmentShader);
    expect(live.side).toBe(quad.material.side);
    let disposed = false;
    quad.material.addEventListener("dispose", () => { disposed = true; });
    primers.dispose();
    expect(disposed).toBe(false);
    expect(takeFieldMaterial(true, false, "additive")).toBe(quad.material);
    returnFieldMaterial(live);
  });

  test("a field that leaves hands its material, and so its linked program, to the next field made the same way", () => {
    const first = takeFieldMaterial(false, false, "additive");
    let disposed = false;
    first.addEventListener("dispose", () => {
      disposed = true;
    });
    returnFieldMaterial(first);
    expect(disposed).toBe(false);
    expect(takeFieldMaterial(true, false, "additive")).not.toBe(first);
    expect(takeFieldMaterial(false, false, "additive")).toBe(first);
    expect(takeFieldMaterial(false, false, "additive")).not.toBe(first);
  });
});
