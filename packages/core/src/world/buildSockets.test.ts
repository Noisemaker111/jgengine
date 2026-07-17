import { describe, expect, test } from "bun:test";

import {
  createBuildSocketCatalog,
  footprintCells,
  pieceSocketsFromModel,
  type BuildCell,
  type BuildSocketCatalogConfig,
  type PlacedPiece,
} from "./buildSockets";

/**
 * A minimal modular-building catalog: a square foundation with four edge sockets facing outward
 * on the cardinal directions, and a wall whose base socket faces back (yaw π) so it mates into an
 * edge. Foundation "top" accepts a wall "bottom"; "edge" mates "edge".
 */
function baseCatalog(): BuildSocketCatalogConfig {
  return {
    cellSize: 1,
    pieces: [
      {
        type: "foundation",
        footprint: { w: 4, d: 4 },
        sockets: [
          { name: "north", kind: "edge", position: [0, 0, 2], yaw: 0 },
          { name: "south", kind: "edge", position: [0, 0, -2], yaw: Math.PI },
          { name: "top", kind: "top", position: [0, 0.5, 0], yaw: 0 },
        ],
      },
      {
        type: "wall",
        footprint: { w: 4, d: 1 },
        sockets: [
          { name: "base", kind: "edge", position: [0, 0, 0], yaw: Math.PI },
          { name: "foot", kind: "bottom", position: [0, 0, 0], yaw: 0 },
        ],
      },
      {
        type: "pillar",
        sockets: [{ name: "cap", kind: "top", position: [0, 0, 0], yaw: 0 }],
      },
    ],
    rules: [
      { a: "edge", b: "edge" },
      { a: "bottom", b: "top" },
    ],
  };
}

const foundationAtOrigin: PlacedPiece = { type: "foundation", transform: { position: [0, 0, 0] } };

describe("createBuildSocketCatalog connection rules", () => {
  test("compatible socket kinds connect, incompatible do not", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    expect(cat.canConnect("edge", "edge")).toBe(true);
    expect(cat.canConnect("bottom", "top")).toBe(true);
    // mutual default → reverse also allowed
    expect(cat.canConnect("top", "bottom")).toBe(true);
    // no rule
    expect(cat.canConnect("top", "top")).toBe(false);
    expect(cat.canConnect("edge", "top")).toBe(false);
  });

  test("directional rule (mutual:false) only connects one way", () => {
    const cat = createBuildSocketCatalog({
      pieces: [],
      rules: [{ a: "peg", b: "hole", mutual: false }],
    });
    expect(cat.canConnect("peg", "hole")).toBe(true);
    expect(cat.canConnect("hole", "peg")).toBe(false);
  });
});

describe("worldSockets", () => {
  test("resolves local sockets into world space with piece yaw", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const sockets = cat.worldSockets({ type: "foundation", transform: { position: [10, 0, 0], yaw: Math.PI / 2 } });
    const north = sockets.find((s) => s.name === "north")!;
    // [0,0,2] rotated +90° about Y → [-2,0,0], offset by origin [10,0,0]
    expect(north.position[0]).toBeCloseTo(8);
    expect(north.position[1]).toBeCloseTo(0);
    expect(north.position[2]).toBeCloseTo(0);
    expect(north.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe("resolveSnaps alignment", () => {
  test("candidate socket world position aligns onto the target socket", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const snaps = cat.resolveSnaps(foundationAtOrigin, "wall");
    // wall.base (edge) mates each foundation edge socket; wall.foot (bottom) mates foundation.top
    const onNorth = snaps.find((s) => s.targetSocket === "north" && s.candidateSocket === "base")!;
    expect(onNorth).toBeDefined();

    // Re-derive the candidate's socket world position from the returned transform and assert it
    // lands exactly on the shared mate point.
    const placedWall: PlacedPiece = { type: "wall", transform: onNorth.transform };
    const wallSockets = cat.worldSockets(placedWall);
    const base = wallSockets.find((s) => s.name === "base")!;
    expect(base.position[0]).toBeCloseTo(onNorth.point[0]);
    expect(base.position[1]).toBeCloseTo(onNorth.point[1]);
    expect(base.position[2]).toBeCloseTo(onNorth.point[2]);
    // and the mate point is the foundation's north edge at [0,0,2]
    expect(onNorth.point).toEqual([0, 0, 2]);
    // candidate socket faces opposite the target (π apart)
    const target = cat.worldSockets(foundationAtOrigin).find((s) => s.name === "north")!;
    const delta = Math.abs(((base.yaw - target.yaw) % (2 * Math.PI)));
    expect(delta).toBeCloseTo(Math.PI);
  });

  test("alignment holds when the placed piece is rotated", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const placed: PlacedPiece = { type: "foundation", transform: { position: [5, 0, -3], yaw: Math.PI / 2 } };
    for (const snap of cat.resolveSnaps(placed, "wall")) {
      const wallSockets = cat.worldSockets({ type: "wall", transform: snap.transform });
      const socket = wallSockets.find((s) => s.name === snap.candidateSocket)!;
      expect(socket.position[0]).toBeCloseTo(snap.point[0]);
      expect(socket.position[1]).toBeCloseTo(snap.point[1]);
      expect(socket.position[2]).toBeCloseTo(snap.point[2]);
    }
  });

  test("only compatible sockets appear; incompatible candidate yields none", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    // pillar has only a "top" socket; foundation edges are "edge", top is "top".
    // top↔top has no rule, but top↔(foundation.top via bottom rule)? pillar.cap kind top,
    // foundation.top kind top → no rule → no snaps against edges; but bottom↔top is mutual so
    // top can connect to bottom, not to top. Foundation has no bottom sockets → no snaps.
    const snaps = cat.resolveSnaps(foundationAtOrigin, "pillar");
    expect(snaps).toHaveLength(0);
  });

  test("multiple sockets on one placed piece each produce a snap", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const snaps = cat.resolveSnaps(foundationAtOrigin, "wall");
    // wall.base(edge) × {north,south}=2, wall.foot(bottom) × top = 1 → 3
    expect(snaps).toHaveLength(3);
    const pairs = snaps.map((s) => `${s.targetSocket}/${s.candidateSocket}`).sort();
    expect(pairs).toEqual(["north/base", "south/base", "top/foot"]);
  });

  test("unknown candidate type yields no snaps", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    expect(cat.resolveSnaps(foundationAtOrigin, "nope")).toHaveLength(0);
  });
});

describe("resolveSnaps deterministic ordering", () => {
  test("orders nearest-first by mate point distance to the cursor", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    // cursor near the north edge [0,0,2]
    const near = cat.resolveSnaps(foundationAtOrigin, "wall", { cursor: [0, 0, 5] });
    expect(near[0]!.targetSocket).toBe("north");
    // last should be the south edge [0,0,-2] (farthest)
    expect(near[near.length - 1]!.targetSocket).toBe("south");
  });

  test("without a cursor, order is stable declaration order across repeated calls", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const a = cat.resolveSnaps(foundationAtOrigin, "wall").map((s) => `${s.targetSocket}/${s.candidateSocket}`);
    const b = cat.resolveSnaps(foundationAtOrigin, "wall").map((s) => `${s.targetSocket}/${s.candidateSocket}`);
    expect(a).toEqual(b);
    expect(a).toEqual(["north/base", "south/base", "top/foot"]);
    expect(a.every((v, i) => v === b[i])).toBe(true);
    // distance is 0 without a cursor
    expect(cat.resolveSnaps(foundationAtOrigin, "wall")[0]!.distance).toBe(0);
  });
});

describe("footprint occupancy interop", () => {
  test("footprintCells matches a footprintGrid-style cell mapping", () => {
    // wall footprint {4,1} centered at [0,0,2], yaw 0, cellSize 1
    const cells = footprintCells([0, 0, 2], { w: 4, d: 1 }, 0, 1);
    expect(cells).toHaveLength(4);
    // cols=4 → originCol = round(0 - 2) = -2; rows=1 → originRow = round(2 - 0.5) = 2
    expect(cells).toEqual([
      { col: -2, row: 2 },
      { col: -1, row: 2 },
      { col: 0, row: 2 },
      { col: 1, row: 2 },
    ]);
  });

  test("quarter-turn yaw swaps footprint width/depth", () => {
    const straight = footprintCells([0, 0, 0], { w: 4, d: 1 }, 0, 1);
    const turned = footprintCells([0, 0, 0], { w: 4, d: 1 }, Math.PI / 2, 1);
    expect(straight).toHaveLength(4);
    expect(turned).toHaveLength(4);
    // straight spans 4 cols × 1 row; turned spans 1 col × 4 rows
    expect(new Set(straight.map((c) => c.col)).size).toBe(4);
    expect(new Set(turned.map((c) => c.row)).size).toBe(4);
  });

  test("isFree predicate rejects snaps whose target cells are occupied", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const occupied = new Set<string>();
    // Occupy every cell the north snap would claim.
    const northSnap = cat.resolveSnaps(foundationAtOrigin, "wall").find((s) => s.targetSocket === "north")!;
    for (const cell of footprintCells(northSnap.transform.position, { w: 4, d: 1 }, northSnap.transform.yaw, 1)) {
      occupied.add(`${cell.col}:${cell.row}`);
    }
    const isFree = (cell: BuildCell): boolean => !occupied.has(`${cell.col}:${cell.row}`);

    const filtered = cat.resolveSnaps(foundationAtOrigin, "wall", { isFree });
    expect(filtered.some((s) => s.targetSocket === "north")).toBe(false);
    // other edges remain available
    expect(filtered.some((s) => s.targetSocket === "south")).toBe(true);
  });

  test("occupancy predicate is ignored for pieces without a footprint", () => {
    const cat = createBuildSocketCatalog({
      pieces: [
        { type: "anchor", sockets: [{ name: "hub", kind: "edge", position: [0, 0, 1] }] },
        { type: "beam", sockets: [{ name: "end", kind: "edge", position: [0, 0, 0] }] }, // no footprint
      ],
      rules: [{ a: "edge", b: "edge" }],
    });
    const placed: PlacedPiece = { type: "anchor", transform: { position: [0, 0, 0] } };
    const snaps = cat.resolveSnaps(placed, "beam", { isFree: () => false });
    expect(snaps).toHaveLength(1); // footprint-less piece bypasses occupancy
  });
});

describe("modelSockets interop", () => {
  test("pieceSocketsFromModel maps named attach points into socket defs", () => {
    const model = [
      { name: "socket_top", offset: [0, 1, 0] as const },
      { name: "socket_edge_n", offset: [0, 0, 1] as const },
    ];
    const defs = pieceSocketsFromModel(
      model,
      (name) => (name.includes("top") ? "top" : "edge"),
      (name) => (name.endsWith("_n") ? 0 : Math.PI),
    );
    expect(defs).toEqual([
      { name: "socket_top", kind: "top", position: [0, 1, 0], yaw: Math.PI },
      { name: "socket_edge_n", kind: "edge", position: [0, 0, 1], yaw: 0 },
    ]);
  });

  test("yaw is omitted when no yawOf classifier is given", () => {
    const defs = pieceSocketsFromModel([{ name: "a", offset: [1, 2, 3] }], () => "edge");
    expect(defs[0]).toEqual({ name: "a", kind: "edge", position: [1, 2, 3] });
    expect("yaw" in defs[0]!).toBe(false);
  });
});

describe("serialization round-trip", () => {
  test("toJSON snapshot rebuilds an equivalent catalog", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const snapshot = cat.toJSON();
    // snapshot is plain/serializable
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot as unknown as Record<string, unknown>);

    const rebuilt = createBuildSocketCatalog(snapshot);
    expect(rebuilt.types()).toEqual(cat.types());
    expect(rebuilt.resolveSnaps(foundationAtOrigin, "wall")).toEqual(
      cat.resolveSnaps(foundationAtOrigin, "wall"),
    );
    expect(rebuilt.canConnect("bottom", "top")).toBe(cat.canConnect("bottom", "top"));
  });

  test("snapshot preserves a directional rule", () => {
    const cat = createBuildSocketCatalog({ pieces: [], rules: [{ a: "peg", b: "hole", mutual: false }] });
    const rebuilt = createBuildSocketCatalog(cat.toJSON());
    expect(rebuilt.canConnect("peg", "hole")).toBe(true);
    expect(rebuilt.canConnect("hole", "peg")).toBe(false);
  });

  test("piece() returns a defensive copy, not the internal def", () => {
    const cat = createBuildSocketCatalog(baseCatalog());
    const a = cat.piece("wall")!;
    const b = cat.piece("wall")!;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(cat.piece("missing")).toBeNull();
  });
});
