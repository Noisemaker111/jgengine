import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { preloadSceneAssets } from "@/scene/sceneAssetPreloadLazy";

/** The signed-in player's current world, derived from the Convex auth token.
 *
 * `getUserWorld` resolves identity server-side from the JWT, so this fires the
 * instant Convex auth is ready (optimistic token on a cold load) — it never
 * waits on the better-auth `/get-session` round-trip. The result stays honest:
 * `undefined` until loaded, then `null` only when the authenticated user
 * genuinely has no world. */
export function useUserWorld() {
  const { isAuthenticated: convexAuthenticated } = useConvexAuth();
  return useQuery(api.world.getUserWorld, convexAuthenticated ? {} : "skip");
}

export type GameRouteAccessPhase = "loading" | "redirecting" | "ready";

export const GAME_ROUTE_ACCESS_PHASE = {
  loading: "loading",
  redirecting: "redirecting",
  ready: "ready",
} as const satisfies Record<string, GameRouteAccessPhase>;

/** Redirect stale /game/:id URLs to the user's current world or home.
 *
 * Gated purely on Convex auth (the optimistic token), so an in-game refresh
 * resolves access without waiting on the better-auth `/get-session` round-trip. */
export function useGameRouteAccess(gameId: Id<"games">): GameRouteAccessPhase {
  const navigate = useNavigate();
  const { isAuthenticated: convexAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const userWorld = useUserWorld();
  const gameState = useQuery(
    api.world.state,
    convexAuthenticated ? { gameId } : "skip",
  );
  const authReady = !convexAuthLoading && convexAuthenticated;

  useEffect(() => {
    if (!authReady) return;
    if (userWorld === undefined || gameState === undefined) return;
    if (gameState.access.canView) return;

    if (userWorld !== null && userWorld._id !== gameId) {
      void navigate({ to: "/game/$gameId", params: { gameId: userWorld._id }, replace: true });
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [authReady, gameId, gameState, navigate, userWorld]);

  if (!authReady) return GAME_ROUTE_ACCESS_PHASE.loading;
  if (userWorld === undefined || gameState === undefined) return GAME_ROUTE_ACCESS_PHASE.loading;
  if (!gameState.access.canView) return GAME_ROUTE_ACCESS_PHASE.redirecting;
  return GAME_ROUTE_ACCESS_PHASE.ready;
}

/**
 * Start world scene queries and map assets as early as possible on the game route
 * so they overlap with auth, route-access checks, and JS chunk loading.
 */
export function useWarmGameWorldQueries(gameId: Id<"games">): void {
  const { isAuthenticated: convexAuthenticated } = useConvexAuth();
  const canQuery = convexAuthenticated;

  useQuery(
    api.world.state,
    canQuery ? { gameId } : "skip",
  );
  useQuery(
    api.world.scene,
    canQuery ? { gameId } : "skip",
  );

  useEffect(() => {
    preloadSceneAssets();
  }, []);
}
