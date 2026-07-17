import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition, authoredSpawnRotation, markersOfKind } from "./authoredSpawn";

const document = {
  markers: [
    { id: "crate_1", kind: "prop", position: { x: 3, y: 0, z: -2 } },
    { id: "player_spawn", kind: "player_spawn", position: { x: 1, y: 0.5, z: 8 }, rotationY: Math.PI },
    { id: "arena_spawn", kind: "player_spawn", position: { x: -20, y: 0, z: 0 } },
    { id: "boss_1", kind: "boss", position: { x: 0, y: 0, z: -30 } },
  ],
};

describe("authoredSpawn", () => {
  test("markersOfKind returns document-order matches", () => {
    expect(markersOfKind(document, "player_spawn").map((marker) => marker.id)).toEqual([
      "player_spawn",
      "arena_spawn",
    ]);
    expect(markersOfKind(document, "vendor")).toEqual([]);
  });

  test("authoredSpawnPosition reads the first player_spawn as a tuple", () => {
    expect(authoredSpawnPosition(document)).toEqual([1, 0.5, 8]);
  });

  test("authoredSpawnPosition resolves a specific marker id", () => {
    expect(authoredSpawnPosition(document, { id: "arena_spawn" })).toEqual([-20, 0, 0]);
  });

  test("authoredSpawnPosition supports a non-default kind and misses as null", () => {
    expect(authoredSpawnPosition(document, { kind: "boss" })).toEqual([0, 0, -30]);
    expect(authoredSpawnPosition(document, { kind: "travel" })).toBeNull();
    expect(authoredSpawnPosition({ markers: [] })).toBeNull();
  });

  test("authoredSpawnRotation reads the marker yaw and defaults to 0", () => {
    expect(authoredSpawnRotation(document)).toBe(Math.PI);
    expect(authoredSpawnRotation(document, { id: "arena_spawn" })).toBe(0);
    expect(authoredSpawnRotation({ markers: [] })).toBe(0);
  });
});
