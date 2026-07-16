import { describe, expect, test } from "bun:test";

import { decodeGameLayers, loadGameLayers } from "./loadGameLayers";

describe("decodeGameLayers", () => {
  test("undefined export decodes to an empty document", () => {
    const decoded = decodeGameLayers(undefined);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.document.markers).toEqual([]);
    expect(decoded.document.volumes).toEqual([]);
  });

  test("valid layers pass through typed", () => {
    const decoded = decodeGameLayers({
      markers: [{ id: "spawn", kind: "player_spawn", position: { x: 1, y: 0, z: 2 } }],
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.document.markers).toHaveLength(1);
    expect(decoded.document.markers[0]?.id).toBe("spawn");
  });

  test("malformed layers are rejected with a path-specific diagnostic", () => {
    const decoded = decodeGameLayers({
      markers: [{ kind: "player_spawn" }],
      paths: "not-an-array",
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    const paths = decoded.errors.map((e) => e.path);
    expect(paths).toContain("$.markers[0].id");
    expect(paths).toContain("$.markers[0].position");
    expect(paths).toContain("$.paths");
  });

  test("a non-object export is rejected", () => {
    const decoded = decodeGameLayers("not-a-document");
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$", message: "editor document must be an object" }]);
  });
});

describe("loadGameLayers", () => {
  test("a game with no editorLayers.ts loads an empty document, not an error", async () => {
    const loaded = await loadGameLayers("__no-such-game__");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("expected load success");
    expect(loaded.document.markers).toEqual([]);
  });

  test("a real game's editorLayers export decodes to a typed document", async () => {
    const loaded = await loadGameLayers("studio-showcase");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("expected load success");
    expect(loaded.document.version).toBe(1);
  });
});
