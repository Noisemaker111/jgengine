import { expect, test } from "bun:test";

import { blankWorld, createBlankPlayable } from "./StandaloneEditor";

test("createBlankPlayable builds a gameless playable over a flat world", () => {
  const playable = createBlankPlayable();
  expect(playable.game.name).toBe("Standalone Scene");
  expect(playable.game.world?.kind).toBe("environment");
  expect(playable.environment).toBeDefined();
  expect(playable.game.assets.ids()).toEqual([]);
});

test("createBlankPlayable registers supplied assets into the catalog", () => {
  const playable = createBlankPlayable({
    assets: [
      { id: "tree", url: "blob:tree" },
      { id: "rock", url: "blob:rock" },
    ],
  });
  expect(playable.game.assets.ids()).toEqual(["tree", "rock"]);
  expect(playable.game.assets.resolve("tree")?.url).toBe("blob:tree");
});

test("blankWorld is an environment feature with ground", () => {
  const world = blankWorld("seed");
  expect(world.kind).toBe("environment");
});
