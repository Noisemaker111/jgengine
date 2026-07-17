import { describe, expect, test } from "bun:test";

import { authoredEntitySpawns } from "./authoredEntities";

const document = {
  markers: [
    { id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } },
    { id: "grunt_1", kind: "mob", position: { x: -4, y: 0, z: -9 }, rotationY: 1.5, catalogId: "grunt" },
    { id: "legacy", kind: "mob", position: { x: 1, y: 0, z: 2 }, meta: { catalogId: "slime" } },
    { id: "arena", kind: "boss", position: { x: 10, y: 0, z: 10 } },
    { id: "kingpin", kind: "boss", position: { x: 5, y: 0, z: 5 }, catalogId: "kingpin" },
  ],
};

describe("authoredEntitySpawns", () => {
  test("returns mob and boss markers that carry a catalog id", () => {
    const spawns = authoredEntitySpawns(document);
    expect(spawns.map((spawn) => spawn.markerId)).toEqual(["grunt_1", "legacy", "kingpin"]);
  });

  test("reads catalogId from top-level and from the meta alias", () => {
    const spawns = authoredEntitySpawns(document);
    expect(spawns.find((spawn) => spawn.markerId === "grunt_1")?.catalogId).toBe("grunt");
    expect(spawns.find((spawn) => spawn.markerId === "legacy")?.catalogId).toBe("slime");
  });

  test("skips markers without a catalog id (placement-only)", () => {
    expect(authoredEntitySpawns(document).some((spawn) => spawn.markerId === "arena")).toBe(false);
  });

  test("carries a spawn-ready position tuple and facing", () => {
    const grunt = authoredEntitySpawns(document).find((spawn) => spawn.markerId === "grunt_1");
    expect(grunt?.position).toEqual([-4, 0, -9]);
    expect(grunt?.rotationY).toBe(1.5);
  });

  test("honors a custom kind set", () => {
    expect(authoredEntitySpawns(document, ["boss"]).map((spawn) => spawn.markerId)).toEqual(["kingpin"]);
  });
});
