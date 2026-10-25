import { preloadSceneAssets } from "@/scene/sceneAssetPreloadLazy";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { useRouter } from "@tanstack/react-router";

type RouterPreload = Pick<ReturnType<typeof useRouter>, "preloadRoute">;

// The game-session chunk pulls in three.js / R3F, so it is large and slow to
// download on a cold cache. React keeps the *previous* screen visible while a
// navigation transition suspends, so if we navigate before this chunk is ready
// the player sees the old screen frozen with no feedback until it loads. Sharing
// one memoized import lets entry points await it (showing a loading state) and
// lets the route's lazy() resolve from the same promise instead of re-fetching.
let gameSessionModulePromise: Promise<typeof import("@/runtime/components/GameSession")> | null =
  null;

export function loadGameSessionModule() {
  gameSessionModulePromise ??= import("@/runtime/components/GameSession");
  return gameSessionModulePromise;
}

/** Warm the game route chunk and heavy runtime modules ahead of navigation. */
export function preloadGameRoute(
  router: RouterPreload,
  gameId: Id<"games">,
): void {
  void loadGameSessionModule();
  void preloadSceneAssets();
  void router.preloadRoute({ to: "/game/$gameId", params: { gameId } });
}
