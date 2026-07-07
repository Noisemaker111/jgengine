import { describe, expect, test } from "bun:test";

import { solveSupport, toDebrisBodies, type SupportPiece } from "./support";

describe("support solver", () => {
  test("pieces connected to a grounded anchor stay supported", () => {
    const pieces: SupportPiece[] = [
      { id: "ground", grounded: true },
      { id: "a" },
      { id: "b" },
    ];
    const result = solveSupport(pieces, [
      { a: "ground", b: "a" },
      { a: "a", b: "b" },
    ]);
    expect(result.supported.sort()).toEqual(["a", "b", "ground"]);
    expect(result.unsupported).toEqual([]);
    expect(result.distance.b).toBe(2);
  });

  test("a disconnected island collapses", () => {
    const pieces: SupportPiece[] = [
      { id: "ground", grounded: true },
      { id: "a" },
      { id: "floating" },
    ];
    const result = solveSupport(pieces, [{ a: "ground", b: "a" }]);
    expect(result.supported.sort()).toEqual(["a", "ground"]);
    expect(result.unsupported).toEqual(["floating"]);
  });

  test("maxDistance collapses pieces beyond the support reach", () => {
    const pieces: SupportPiece[] = [
      { id: "ground", grounded: true },
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ];
    const result = solveSupport(
      pieces,
      [
        { a: "ground", b: "a" },
        { a: "a", b: "b" },
        { a: "b", b: "c" },
      ],
      { maxDistance: 2 },
    );
    expect(result.supported.sort()).toEqual(["a", "b", "ground"]);
    expect(result.unsupported).toEqual(["c"]);
  });

  test("collapsed pieces convert into scattered debris bodies", () => {
    const pieces: SupportPiece[] = [
      { id: "ground", grounded: true, position: [0, 0, 0] },
      { id: "floating", position: [3, 5, 2], halfExtents: [0.5, 0.5, 0.5], mass: 2 },
    ];
    const result = solveSupport(pieces, []);
    const debris = toDebrisBodies(pieces, result.unsupported, { seed: 7 });
    expect(debris).toHaveLength(1);
    expect(debris[0]!.position).toEqual([3, 5, 2]);
    expect(debris[0]!.mass).toBe(2);
    expect(debris[0]!.velocity?.[1]).toBe(0);
  });
});
