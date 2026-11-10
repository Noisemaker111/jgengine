import { navigate } from "../screens/screenRouter";
import { preloadScreen } from "../screens/screens";
import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "@jgengine/core/ui/jsx";

import { useAuth } from "../auth";
import { resolveAuthUsername } from "../auth/authCredentials";
import { formatChunkLoadError } from "./chunkLoadError";
import { loadGameSessionModule, preloadGameRoute } from "./gameRoutePreload";
import { clearAllLocalGamePersistence } from "../user/localGameState";
import { getDefaultAvatarId, normalizeAvatarId } from "../user/user";
import { useUserWorld } from "../world/world";

export type GameCreatePhase = "auth" | "loading" | "bootstrapping" | "redirecting" | "error";

/** Warm the create route and game-session chunk ahead of a click. */
export function preloadGameCreateRoute() {
  void loadGameSessionModule();
  preloadScreen("/game/create");
}

/**
 * Authenticated play entry: resume an existing world or bootstrap one, then
 * navigate to `/game/$gameId`. Uses Convex auth so remembered sessions do not
 * wait on the better-auth `/get-session` round-trip.
 */
export function useGameCreateEntry() {
  const { isConvexAuthenticated, isConvexAuthLoading, isAuthenticated, isLoading, convexUser, user } = useAuth();
  const userWorld = useUserWorld();
  const bootstrapWorld = useMutation(api.world.bootstrapWorld);

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const startedRef = useRef(false);

  const displayName =
    convexUser?.displayName?.trim() || resolveAuthUsername(convexUser) || user?.name?.trim() || "Player";
  const avatarId = convexUser?.avatarId ? normalizeAvatarId(convexUser.avatarId) : getDefaultAvatarId();

  const enterGame = useCallback(
    async (gameId: Id<"games">) => {
      preloadGameRoute();
      await loadGameSessionModule();
      await navigate({ to: "/game/$gameId", params: { gameId }, replace: true });
    },
    [],
  );

  useEffect(() => {
    if (isConvexAuthLoading) return;
    if (!isConvexAuthenticated) {
      if (isLoading || isAuthenticated) return;
      void navigate({ to: "/login", search: { intent: "play" }, replace: true });
      return;
    }
    if (userWorld === undefined) return;
    if (startedRef.current) return;

    if (userWorld !== null) {
      startedRef.current = true;
      // Same failure handling as the bootstrap path below — without it a
      // failed chunk load left the player on an eternal "Joining world"
      // screen with no retry.
      void (async () => {
        try {
          await enterGame(userWorld._id);
        } catch (enterError) {
          setError(formatChunkLoadError(enterError));
          startedRef.current = false;
        }
      })();
      return;
    }

    startedRef.current = true;
    void (async () => {
      try {
        clearAllLocalGamePersistence();
        const bootstrapped = await bootstrapWorld({
          displayName,
          avatarId,
          forceNew: false,
        });
        if (!bootstrapped.gameId) {
          throw new Error("Your lab is still being set up. Try again in a moment.");
        }
        await enterGame(bootstrapped.gameId);
      } catch (bootstrapError) {
        setError(formatChunkLoadError(bootstrapError));
        startedRef.current = false;
      }
    })();
  }, [
    avatarId,
    bootstrapWorld,
    displayName,
    enterGame,
    isAuthenticated,
    isConvexAuthenticated,
    isConvexAuthLoading,
    isLoading,
    navigate,
    userWorld,
    retryCount,
  ]);

  const phase: GameCreatePhase = (() => {
    if (isConvexAuthLoading || !isConvexAuthenticated) return "auth";
    if (error !== null) return "error";
    if (userWorld === undefined) return "loading";
    if (userWorld !== null) return "redirecting";
    return "bootstrapping";
  })();

  const retry = useCallback(() => {
    setError(null);
    startedRef.current = false;
    setRetryCount((count) => count + 1);
  }, []);

  return { phase, error, retry };
}