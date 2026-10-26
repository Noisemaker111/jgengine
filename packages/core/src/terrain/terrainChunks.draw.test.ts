import { describe, expect, test } from "bun:test";

import { runToEnd } from "@jgengine/core/run/slicedWork";
import * as THREE from "three";

import { CHUNKED_GROUND_MIN_VERTICES, GroundChunks } from "./terrainChunks.draw";
import { createFieldGroundGeometry, groundPatchJob, resolveFieldGroundGrid } from "./terrainMath.draw";

const hill = { sampleHeight: (x: number, z: number) => Math.sin(x * 0.3) * 2 + Math.cos(z * 0.2), sampleNormal: () => [0, 1, 0] as const };

describe("ground patches", () => {
  test("a full-density window off the origin matches the same vertices of the whole ground", () => {
    const options = { size: [20, 20] as const, segments: [8, 8] as const };
    const grid = resolveFieldGroundGrid(hill, options);
    const whole = createFieldGroundGeometry(hill, options);
    const patch = runToEnd(groundPatchJob(grid, { col0: 4, row0: 2, cols: 4, rows: 4, step: 1, skirt: 0, origin: [3, -1] }));
    const wholePositions = whole.attributes.position!.array;
    const wholeNormals = whole.attributes.normal!.array;
    const patchPositions = patch.attributes.position!.array;
    const patchNormals = patch.attributes.normal!.array;
    expect(patch.attributes.position!.count).toBe(25);
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const p = (row * 5 + column) * 3;
        const w = ((row + 2) * 9 + column + 4) * 3;
        expect(patchPositions[p]! + 3).toBeCloseTo(wholePositions[w]!, 5);
        expect(patchPositions[p + 1]!).toBeCloseTo(wholePositions[w + 1]!, 5);
        expect(patchPositions[p + 2]! - 1).toBeCloseTo(wholePositions[w + 2]!, 5);
        for (let axis = 0; axis < 3; axis += 1) expect(patchNormals[p + axis]!).toBeCloseTo(wholeNormals[w + axis]!, 5);
      }
    }
  });

  test("a coarse window keeps its far edge and drops a skirt under every edge", () => {
    const grid = resolveFieldGroundGrid(hill, { size: [20, 20], segments: [10, 10] });
    const patch = runToEnd(groundPatchJob(grid, { col0: 0, row0: 0, cols: 10, rows: 10, step: 4, skirt: 2, origin: [0, 0] }));
    // Indices 0, 4, 8 and the edge 10: four per side, plus a skirt copy of the 4 * 4 edge vertices.
    expect(patch.attributes.position!.count).toBe(16 + 16);
    const positions = patch.attributes.position!.array;
    expect(positions[3 * 3]!).toBeCloseTo(10, 5);
    for (let skirt = 16; skirt < 32; skirt += 1) {
      const y = positions[skirt * 3 + 1]!;
      expect(y).toBeLessThan(Math.sin(positions[skirt * 3]! * 0.3) * 2 + Math.cos(positions[skirt * 3 + 2]! * 0.2) - 1.99);
    }
  });
});

describe("chunked ground", () => {
  const big = resolveFieldGroundGrid(hill, { size: [4000, 4000], segments: [640, 640] });

  test("a ground past the threshold splits into tiles that show for a sliver of its vertices", () => {
    expect(641 * 641).toBeGreaterThan(CHUNKED_GROUND_MIN_VERTICES);
    const chunks = new GroundChunks(big, new THREE.MeshBasicMaterial(), true);
    expect(chunks.tileCount).toBe(25);
    runToEnd(chunks.initialJob(() => new THREE.Vector3(0, 30, 0)));
    expect(chunks.builtVertices()).toBeLessThan((641 * 641) / 4);
    chunks.dispose();
  });

  test("the stride coarsens with distance and refinement follows the camera", () => {
    const chunks = new GroundChunks(big, new THREE.MeshBasicMaterial(), false);
    expect(chunks.stepAt(0)).toBe(1);
    expect(chunks.stepAt(100_000)).toBe(16);
    expect(chunks.stepAt(2000)).toBeGreaterThan(chunks.stepAt(10));
    const far = new THREE.Vector3(1900, 10, 1900);
    runToEnd(chunks.initialJob(() => new THREE.Vector3(0, 10, 0)));
    expect(chunks.nextRefinement(new THREE.Vector3(0, 10, 0))).toBeNull();
    const before = chunks.builtVertices();
    let job = chunks.nextRefinement(far);
    expect(job).not.toBeNull();
    while (job !== null) {
      runToEnd(job);
      job = chunks.nextRefinement(far);
    }
    expect(chunks.builtVertices()).toBeGreaterThan(before);
    chunks.dispose();
  });
});
