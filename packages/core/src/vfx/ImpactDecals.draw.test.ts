import { describe, expect, test } from "bun:test";

import { createImpactDecalPool } from "./impactDecals";
import { createDecalBuffers, createImpactDecalLayer, decalLookRect, writeImpactDecalGeometry } from "./ImpactDecals.draw";

function pool(capacity = 8) {
  return createImpactDecalPool({
    capacity,
    kinds: {
      hole: { look: "hole", tint: "#ff0000", lifeSeconds: 10, fadeSeconds: 2 },
      splash: { look: "splash", lifeSeconds: 10, fadeSeconds: 2 },
    },
  });
}

describe("writeImpactDecalGeometry", () => {
  test("every live mark of every kind is one quad in the same buffers, oldest first", () => {
    const decals = pool();
    decals.add({ kind: "hole", point: [0, 0, 0], normal: [0, 1, 0], size: 1, at: 0 });
    decals.add({ kind: "splash", point: [5, 0, 0], normal: [1, 0, 0], size: 1, at: 0 });
    decals.add({ kind: "hole", point: [9, 0, 0], normal: [0, 0, 1], size: 1, at: 0 });
    const buffers = createDecalBuffers(8);
    expect(writeImpactDecalGeometry(decals, 1, buffers)).toBe(3);
    // The second quad's vertices carry its own normal.
    expect(Array.from(buffers.normals.slice(12, 15))).toEqual([1, 0, 0]);
    // Its UVs sit inside the splash cell of the atlas.
    const [u0, v0, u1, v1] = decalLookRect("splash");
    for (let corner = 0; corner < 4; corner += 1) {
      const u = buffers.uvs[(4 + corner) * 2]!;
      const v = buffers.uvs[(4 + corner) * 2 + 1]!;
      expect(u).toBeGreaterThanOrEqual(u0 - 1e-6);
      expect(u).toBeLessThanOrEqual(u1 + 1e-6);
      expect(v).toBeGreaterThanOrEqual(v0 - 1e-6);
      expect(v).toBeLessThanOrEqual(v1 + 1e-6);
    }
  });

  test("the kind's tint is the colour and the fade is the alpha", () => {
    const decals = pool();
    decals.add({ kind: "hole", point: [0, 0, 0], normal: [0, 1, 0], size: 1, at: 0 });
    const buffers = createDecalBuffers(8);
    writeImpactDecalGeometry(decals, 9, buffers);
    expect(buffers.colors[0]).toBeCloseTo(1);
    expect(buffers.colors[1]).toBeCloseTo(0);
    expect(buffers.colors[3]).toBeCloseTo(0.5);
  });

  test("a spent mark writes nothing", () => {
    const decals = pool();
    decals.add({ kind: "hole", point: [0, 0, 0], normal: [0, 1, 0], size: 1, at: 0 });
    expect(writeImpactDecalGeometry(decals, 10, createDecalBuffers(8))).toBe(0);
  });

  test("looks never share atlas cells", () => {
    const hole = decalLookRect("hole");
    const splash = decalLookRect("splash");
    const overlaps = hole[0] < splash[2] && splash[0] < hole[2] && hole[1] < splash[3] && splash[1] < hole[3];
    expect(overlaps).toBe(false);
  });
});

describe("createImpactDecalLayer", () => {
  test("a full pool of mixed kinds draws as one mesh with six indices per mark", () => {
    const decals = pool(64);
    for (let i = 0; i < 64; i += 1) {
      decals.add({ kind: i % 2 === 0 ? "hole" : "splash", point: [i, 0, 0], normal: [0, 1, 0], size: 0.4, at: 0 });
    }
    const layer = createImpactDecalLayer(64);
    layer.sync(decals, 1);
    expect(layer.mesh.geometry.drawRange.count).toBe(64 * 6);
    expect(layer.mesh.children).toHaveLength(0);
    const material = layer.mesh.material as { depthWrite: boolean; polygonOffset: boolean; vertexColors: boolean };
    expect(material.depthWrite).toBe(false);
    expect(material.polygonOffset).toBe(true);
    expect(material.vertexColors).toBe(true);
    layer.dispose();
  });

  test("expired marks are pruned on sync and leave the draw", () => {
    const decals = pool();
    decals.add({ kind: "hole", point: [0, 0, 0], normal: [0, 1, 0], size: 1, at: 0 });
    const layer = createImpactDecalLayer(8);
    layer.sync(decals, 1);
    expect(layer.mesh.geometry.drawRange.count).toBe(6);
    layer.sync(decals, 11);
    expect(decals.list()).toHaveLength(0);
    expect(layer.mesh.geometry.drawRange.count).toBe(0);
    layer.dispose();
  });
});
