import { afterEach, expect, test } from "bun:test";

import { resolveAssetBaseUrl, setAssetBase, setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { loadAfterAssets } from "./loadAfterAssets";

afterEach(() => {
  setGameAssetFiles(null);
  setAssetBase("/");
});

test("a font a game resolves while its module evaluates loads from the game's own folder on the site", async () => {
  setAssetBase("/play/");
  const install = async () => {
    // The file list arrives after a network hop; a game module that is already cached would win a race.
    await new Promise((resolve) => setTimeout(resolve, 20));
    setGameAssetFiles("games/drift-foundry/", ["/fonts/saira-stencil-one/saira-stencil-one.woff2"]);
  };
  const load = async () => ({ font: resolveAssetBaseUrl("/fonts/saira-stencil-one/saira-stencil-one.woff2") });
  const loaded = await loadAfterAssets(install, load);
  expect(loaded.font).toBe("/play/games/drift-foundry/fonts/saira-stencil-one/saira-stencil-one.woff2");
});
