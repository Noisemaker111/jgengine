import { describe, expect, test } from "bun:test";

import { solidEnclosure, solidOverhead } from "./overhead";
import { createWorldSolids } from "./worldSolids";

describe("solidOverhead", () => {
  const solids = createWorldSolids({ cellSize: 4 });
  // A 4 m square ceiling 3 m up over the origin, a wall beside it, and a long beam turned 45 degrees.
  solids.set("base", [
    { center: [0, 3.1, 0], halfExtents: [2, 0.1, 2] },
    { center: [6, 1.5, 0], halfExtents: [0.1, 1.5, 2] },
    { center: [20, 4, 0], halfExtents: [5, 0.2, 0.3], rotationY: Math.PI / 4 },
  ]);

  test("under a ceiling is covered; beside it, or beside a wall, is open sky", () => {
    expect(solidOverhead(solids, [0, 0, 0])).toBe(true);
    expect(solidOverhead(solids, [1.9, 0, -1.9])).toBe(true);
    expect(solidOverhead(solids, [2.2, 0, 0])).toBe(false);
    expect(solidOverhead(solids, [6.5, 0, 0])).toBe(false);
  });

  test("the floor under your feet and anything below the clearance never count; above the reach is too far", () => {
    // Standing on the ceiling: it is underfoot, not overhead.
    expect(solidOverhead(solids, [0, 3.2, 0])).toBe(false);
    // Up close under it with a clearance over the ceiling, or a reach short of it.
    expect(solidOverhead(solids, [0, 0, 0], { clearance: 3.5 })).toBe(false);
    expect(solidOverhead(solids, [0, 0, 0], { reach: 2.5 })).toBe(false);
  });

  test("a turned solid covers along its own length, not its unturned box", () => {
    // Along the beam's turned length, 3 m out from its centre on the diagonal.
    const along = 3 / Math.SQRT2;
    expect(solidOverhead(solids, [20 + along, 0, -along])).toBe(true);
    // Where the unturned box would have been, 3 m straight along x.
    expect(solidOverhead(solids, [23, 0, 0])).toBe(false);
  });
});

describe("solidEnclosure", () => {
  // A 4 m room 3 m high round the origin: a ceiling and four walls, the north one in two halves either side of a 1 m door gap.
  const room = (door: boolean) => {
    const solids = createWorldSolids({ cellSize: 4 });
    solids.set("base", [
      { center: [0, 3.1, 0], halfExtents: [2, 0.1, 2] },
      { center: [2, 1.5, 0], halfExtents: [0.1, 1.5, 2] },
      { center: [-2, 1.5, 0], halfExtents: [0.1, 1.5, 2] },
      { center: [0, 1.5, -2], halfExtents: [2, 1.5, 0.1] },
      { center: [-1.25, 1.5, 2], halfExtents: [0.75, 1.5, 0.1] },
      { center: [1.25, 1.5, 2], halfExtents: [0.75, 1.5, 0.1] },
      ...(door ? [{ center: [0, 1.5, 2] as const, halfExtents: [0.5, 1.5, 0.1] as const }] : []),
    ]);
    return solids;
  };

  test("a closed room is fully enclosed; with the door gap open, one way out is not", () => {
    expect(solidEnclosure(room(true), [0, 0, 0])).toBe(1);
    expect(solidEnclosure(room(false), [0, 0, 0])).toBe(7 / 8);
  });

  test("under open sky nothing encloses, and walls past the reach do not count", () => {
    expect(solidEnclosure(room(true), [10, 0, 0])).toBe(0);
    expect(solidEnclosure(room(true), [0, 0, 0], { wallReach: 1.5 })).toBe(0);
  });
});
