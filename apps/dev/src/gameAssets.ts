import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { pagePrefetch } from "@jgengine/core/boot/assetPrefetch";
import { GAME_PUBLIC_FOLDER, gamePublic } from "virtual:jgengine-game-public";

/**
 * Point the asset resolver at this game's own files before it loads anything (the runner serves
 * every game from one origin, and two games may ship different files at the same path), then start
 * fetching the files the game names in the background, near ones first, while its menu shows.
 */
export async function installGameAssets(gameId: string): Promise<void> {
  const load = gamePublic[gameId];
  if (load === undefined) {
    setGameAssetFiles(null);
    pagePrefetch.start([]);
    return;
  }
  const { files, prefetch } = await load();
  setGameAssetFiles(`${GAME_PUBLIC_FOLDER}/${gameId}/`, files);
  pagePrefetch.start(prefetch);
}
