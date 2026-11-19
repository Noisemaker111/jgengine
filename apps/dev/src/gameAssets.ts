import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { pagePrefetch } from "@jgengine/core/boot/assetPrefetch";
import { GAME_PUBLIC_FOLDER, gamePublic } from "virtual:jgengine-game-public";

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
