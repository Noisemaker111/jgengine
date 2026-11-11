/** @jsxImportSource @jgengine/core/ui/jsx */
import { navigate } from "./screenRouter";
import type { ScreenProps } from "./screens";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { Suspense, lazy, useEffect } from "@jgengine/core/ui/jsx";

import { useAuth, usePlayerIdentity } from "../auth";
import { loadGameSessionModule, preloadGameRoute } from "../runtime/gameRoutePreload";
import { GAME_ROUTE_ACCESS_PHASE, useGameRouteAccess, useWarmGameWorldQueries } from "../world/world";

import { GameRouteErrorBoundary } from "../runtime/components/GameRouteErrorBoundary";
import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { LlmRoot } from "../ui/kit";

const GameSession = lazy(async () =>
  loadGameSessionModule().then((module) => ({
    default: module.GameSession,
  })),
);

export function GameScreen({ params }: ScreenProps) {
  // type-escape: a path segment becomes a Convex id only here; the world query rejects one that is not a game.
  const gameId = (params["gameId"] ?? "") as Id<"games">;
  // Identity comes from Convex auth (the optimistic token), so a hard refresh
  // into the game boots without waiting on the better-auth session round-trip.
  const { isConvexAuthenticated, isConvexAuthLoading, convexUser } = useAuth();
  const { playerId, playerName } = usePlayerIdentity();
  const routeAccessPhase = useGameRouteAccess(gameId);

  useWarmGameWorldQueries(gameId);

  useEffect(() => {
    preloadGameRoute();
  }, [gameId]);

  useEffect(() => {
    // Only bounce to login once Convex auth has settled to genuinely signed-out.
    if (isConvexAuthLoading || isConvexAuthenticated) return;
    void navigate({ to: "/login" });
  }, [isConvexAuthenticated, isConvexAuthLoading]);

  if (isConvexAuthLoading || routeAccessPhase !== GAME_ROUTE_ACCESS_PHASE.ready || !isConvexAuthenticated) {
    const detail =
      routeAccessPhase === GAME_ROUTE_ACCESS_PHASE.redirecting
        ? "Redirecting to your world…"
        : isConvexAuthLoading
          ? "Checking session…"
          : "Connecting to your lab…";
    return <LlmRoot><RouteLoadingScreen label="Loading world" detail={detail} /></LlmRoot>;
  }

  return (
    <GameRouteErrorBoundary>
      <Suspense fallback={<LlmRoot><RouteLoadingScreen label="Loading world" /></LlmRoot>}>
        <GameSession user={{ id: playerId, name: playerName }} convexUser={convexUser} gameId={gameId} />
      </Suspense>
    </GameRouteErrorBoundary>
  );
}
