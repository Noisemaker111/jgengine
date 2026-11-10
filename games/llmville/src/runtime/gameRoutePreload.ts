import { preloadSceneAssets } from "../scene/sceneAssetPreloadLazy";
import { preloadScreen } from "../screens/screens";

// The game-session chunk pulls in three.js / R3F, so it is large and slow to
// download on a cold cache. React keeps the *previous* screen visible while a
// navigation transition suspends, so if we navigate before this chunk is ready
// the player sees the old screen frozen with no feedback until it loads. Sharing
// one memoized import lets entry points await it (showing a loading state) and
// lets the route's lazy() resolve from the same promise instead of re-fetching.
let gameSessionModulePromise: Promise<typeof import("./components/GameSession")> | null =
  null;

export function loadGameSessionModule() {
  gameSessionModulePromise ??= import("./components/GameSession");
  return gameSessionModulePromise;
}

/** Warm the world screen's code and its heavy runtime modules ahead of the press that opens it. */
export function preloadGameRoute(): void {
  void loadGameSessionModule();
  void preloadSceneAssets();
  preloadScreen("/game/$gameId");
}
