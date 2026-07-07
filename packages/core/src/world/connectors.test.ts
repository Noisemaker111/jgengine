import { describe, expect, test } from "bun:test";

import {
  snapToNearest,
  socketWorldPosition,
  socketsCompatible,
  type ConnectorPieceDef,
  type ConnectorRegistry,
  type PlacedPiece,
} from "./connectors";

const foundation: ConnectorPieceDef = {
  kind: "foundation",
  sockets: [
    { id: "e", type: "edge", offset: [1, 0, 0] },
    { id: "w", type: "edge", offset: [-1, 0, 0] },
    { id: "top", type: "snapTop", offset: [0, 0.5, 0], accepts: ["wallBase"] },
  ],
};

const wall: ConnectorPieceDef = {
  kind: "wall",
  sockets: [{ id: "base", type: "wallBase", offset: [0, -0.5, 0], accepts: ["snapTop"] }],
};

const registry: ConnectorRegistry = (kind) =>
  kind === "foundation" ? foundation : kind === "wall" ? wall : null;

describe("connectors", () => {
  test("sockets are compatible only when both accept the other type", () => {
    expect(socketsCompatible(foundation.sockets[0]!, foundation.sockets[1]!)).toBe(true);
    expect(socketsCompatible(foundation.sockets[2]!, wall.sockets[0]!)).toBe(true);
    expect(socketsCompatible(foundation.sockets[0]!, wall.sockets[0]!)).toBe(false);
  });

  test("socket world position rotates the local offset about Y", () => {
    const pos = socketWorldPosition(foundation.sockets[0]!, [5, 0, 5], Math.PI / 2);
    expect(pos[0]).toBeCloseTo(5);
    expect(pos[2]).toBeCloseTo(4);
  });

  test("snapToNearest aligns a wall base onto the nearest foundation top", () => {
    const placed: PlacedPiece[] = [{ id: "f1", kind: "foundation", position: [0, 0, 0], rotationY: 0 }];
    const snap = snapToNearest(registry, placed, wall, [0.2, 1, 0.1], { snapDistance: 2 });
    expect(snap).not.toBeNull();
    expect(snap?.targetPieceId).toBe("f1");
    expect(snap?.targetSocketId).toBe("top");
    expect(snap?.position[0]).toBeCloseTo(0);
    expect(snap?.position[1]).toBeCloseTo(1);
    expect(snap?.position[2]).toBeCloseTo(0);
  });

  test("snapToNearest returns null when nothing compatible is in range", () => {
    const placed: PlacedPiece[] = [{ id: "f1", kind: "foundation", position: [40, 0, 40], rotationY: 0 }];
    expect(snapToNearest(registry, placed, wall, [0, 1, 0], { snapDistance: 2 })).toBeNull();
  });

  test("snapToNearest prefers the closer of two candidates", () => {
    const placed: PlacedPiece[] = [
      { id: "far", kind: "foundation", position: [1.5, 0.5, 0], rotationY: 0 },
      { id: "near", kind: "foundation", position: [0, 0.5, 0], rotationY: 0 },
    ];
    const snap = snapToNearest(registry, placed, wall, [0.1, 1, 0], { snapDistance: 3 });
    expect(snap?.targetPieceId).toBe("near");
  });
});
