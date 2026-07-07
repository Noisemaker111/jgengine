import { describe, expect, test } from "bun:test";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { createRevealQuery } from "@jgengine/core/sensor/revealQuery";

function queryFrom(positions: Record<string, EntityPosition>, tags: Record<string, readonly string[]>) {
  return createRevealQuery({
    resolvePosition: (id) => positions[id],
    resolveTags: (id) => tags[id] ?? [],
    candidates: () => Object.keys(positions),
  });
}

describe("revealQuery", () => {
  test("finds tagged entities in range regardless of walls between them", () => {
    const query = queryFrom(
      { player: [0, 0, 0], ghost: [3, 0, 0], wall: [1.5, 0, 0], stranger: [3, 0, 0] },
      { ghost: ["clue"], wall: ["obstacle"], stranger: [] },
    );
    const hits = query.inRadius("player", 5, ["clue"]);
    expect(hits.map((hit) => hit.instanceId)).toEqual(["ghost"]);
    expect(hits[0]!.distance).toBe(3);
  });

  test("excludes entities outside the radius", () => {
    const query = queryFrom({ player: [0, 0, 0], far: [50, 0, 0] }, { far: ["clue"] });
    expect(query.inRadius("player", 5, ["clue"])).toEqual([]);
  });

  test("with no requested tags, returns everything in range", () => {
    const query = queryFrom({ player: [0, 0, 0], a: [1, 0, 0], b: [2, 0, 0] }, { a: ["x"], b: [] });
    expect(query.inRadius("player", 5, []).map((hit) => hit.instanceId)).toEqual(["a", "b"]);
  });

  test("accepts a raw position center and excludes unresolvable ids", () => {
    const query = queryFrom({ ghost: [4, 0, 0] }, { ghost: ["clue"] });
    expect(query.inRadius([0, 0, 0], 10, ["clue"]).map((hit) => hit.instanceId)).toEqual(["ghost"]);
    expect(query.inRadius("missing", 10, ["clue"])).toEqual([]);
  });

  test("sorts hits nearest-first", () => {
    const query = queryFrom(
      { player: [0, 0, 0], near: [1, 0, 0], mid: [3, 0, 0], far: [4, 0, 0] },
      { near: ["clue"], mid: ["clue"], far: ["clue"] },
    );
    expect(query.inRadius("player", 10, ["clue"]).map((hit) => hit.instanceId)).toEqual(["near", "mid", "far"]);
  });
});
