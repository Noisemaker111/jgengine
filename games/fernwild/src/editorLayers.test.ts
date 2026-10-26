import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "./editorLayers";

describe("authored scene", () => {
  test("ships a player_spawn marker the runtime honors", () => {
    expect(authoredSpawnPosition(editorLayers)).not.toBeNull();
  });
});
