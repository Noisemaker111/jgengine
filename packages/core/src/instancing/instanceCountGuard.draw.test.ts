import { describe, expect, test } from "bun:test";
import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial } from "three";

import { clampInstanceCount, guardInstanceCounts, instanceCapacity } from "./instanceCountGuard.draw";

const mesh = (allocated: number, name = "palms") => {
  const m = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), allocated);
  m.name = name;
  return m;
};

describe("instance count guard", () => {
  test("a count past the instance buffer is clamped and the mesh named once (Harbor Heat's 28 of 16)", () => {
    const m = mesh(16);
    m.count = 28;
    const errors: string[] = [];
    expect(clampInstanceCount(m, (e) => errors.push(e))).toBe(true);
    expect(m.count).toBe(16);
    m.count = 17;
    clampInstanceCount(m, (e) => errors.push(e));
    expect(m.count).toBe(16);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"palms" was asked to draw 28 instances but its instance buffers hold 16');
  });

  test("a count within the buffer is left alone", () => {
    const m = mesh(44);
    m.count = 30;
    expect(clampInstanceCount(m, () => { throw new Error("no report expected"); })).toBe(false);
    expect(m.count).toBe(30);
  });

  test("a smaller instanceColor buffer decides", () => {
    const m = mesh(44);
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(10 * 3), 3);
    expect(instanceCapacity(m)).toBe(10);
  });

  test("the renderer guard clamps before every draw, main or shadow pass", () => {
    const calls: number[] = [];
    const renderer = { renderBufferDirect: (_c: unknown, _s: unknown, _g: unknown, _m: unknown, object: InstancedMesh) => { calls.push(object.count); } } as any;
    guardInstanceCounts(renderer);
    guardInstanceCounts(renderer); // idempotent: one wrap
    const m = mesh(16, "guarded");
    m.count = 60;
    const original = console.error;
    console.error = () => {};
    try { renderer.renderBufferDirect(null, null, m.geometry, m.material, m, null); } finally { console.error = original; }
    expect(calls).toEqual([16]);
  });
});
