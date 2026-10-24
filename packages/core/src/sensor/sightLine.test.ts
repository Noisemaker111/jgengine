import { describe, expect, test } from "bun:test";
import { createWorldSolids } from "@jgengine/core/world/worldSolids";
import { sightLineBlocked } from "./sightLine";

function walled(): ReturnType<typeof createWorldSolids> {
  const solids = createWorldSolids();
  solids.set("building", [{ center: [0, 1, 4], halfExtents: [3, 1.5, 0.25] }]);
  return solids;
}

describe("sightLineBlocked", () => {
  test("a box across the segment blocks it, and the same length beside it does not", () => {
    const solids = walled();
    expect(sightLineBlocked(solids, [0, 1, 0], [0, 1, 8])).toBe(true);
    expect(sightLineBlocked(solids, [8, 1, 0], [8, 1, 8])).toBe(false);
  });

  test("a target past the wall and one short of it differ", () => {
    const solids = walled();
    expect(sightLineBlocked(solids, [0, 1, 0], [0, 1, 3.2])).toBe(false);
    expect(sightLineBlocked(solids, [0, 1, 0], [0, 1, 4.8])).toBe(true);
  });

  test("a solid the observer stands inside cannot lie between eye and target", () => {
    const solids = walled();
    expect(sightLineBlocked(solids, [0, 1, 4], [0, 1, 9])).toBe(false);
  });

  test("a yawed box blocks along its turned axis", () => {
    const solids = createWorldSolids();
    solids.set("wall", [{ center: [0, 1, 4], halfExtents: [0.25, 1.5, 4], rotationY: Math.PI / 2 }]);
    expect(sightLineBlocked(solids, [0, 1, 0], [0, 1, 8])).toBe(true);
  });

  test("an empty set never blocks, and identical points are not a segment", () => {
    const solids = createWorldSolids();
    expect(sightLineBlocked(solids, [0, 0, 0], [0, 0, 40])).toBe(false);
    expect(sightLineBlocked(walled(), [0, 1, 0], [0, 1, 0])).toBe(false);
  });

  test("the inBox fallback finds the same wall when inRay is absent", () => {
    const indexed = walled();
    const boxOnly = { inBox: (min: readonly [number, number, number], max: readonly [number, number, number]) => indexed.inBox(min, max) };
    expect(sightLineBlocked(boxOnly, [0, 1, 0], [0, 1, 8])).toBe(true);
    expect(sightLineBlocked(boxOnly, [8, 1, 0], [8, 1, 8])).toBe(false);
  });
});
