import { afterEach, expect, test } from "bun:test";

import {
  blankWorld,
  createBlankPlayable,
  loadDroppedAssets,
  type AssetImporter,
  type StandaloneAsset,
} from "./StandaloneEditor";

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

function modelFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "model/gltf-binary" });
}

test("loadDroppedAssets persists models through the host importer, keeping its durable id/url", async () => {
  const durable: AssetImporter = (file) =>
    Promise.resolve({ id: "tree", url: `/__jgengine/assets/${file.name}`, label: file.name });

  const assets = await loadDroppedAssets([modelFile("Tree.glb")], durable);

  expect(assets).toEqual([{ id: "tree", url: "/__jgengine/assets/Tree.glb", label: "Tree.glb" }]);
  // A durable (non-blob) url means the placement survives reload.
  expect(assets[0]?.url.startsWith("blob:")).toBe(false);
});

test("loadDroppedAssets skips non-model files", async () => {
  const importer: AssetImporter = (file) =>
    Promise.resolve({ id: file.name, url: `/x/${file.name}`, label: file.name });
  const assets = await loadDroppedAssets([modelFile("ok.glb"), modelFile("readme.txt")], importer);
  expect(assets.map((asset) => asset.label)).toEqual(["ok.glb"]);
});

const originalCreateObjectURL = (URL as { createObjectURL?: (blob: unknown) => string })
  .createObjectURL;

afterEach(() => {
  (URL as { createObjectURL?: (blob: unknown) => string }).createObjectURL = originalCreateObjectURL;
});

test("loadDroppedAssets falls back to an ephemeral blob url when no host answers", async () => {
  (URL as { createObjectURL?: (blob: unknown) => string }).createObjectURL = () => "blob:ephemeral";
  const noHost: AssetImporter = () => Promise.resolve(null);

  const assets: StandaloneAsset[] = await loadDroppedAssets([modelFile("Rock.glb")], noHost);

  expect(assets).toEqual([{ id: "rock", url: "blob:ephemeral", label: "Rock.glb" }]);
});
