import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { z } from "zod";

import { useAuth, usePlayerIdentity } from "@/auth";
import { loadGameSessionModule, preloadGameRoute } from "@/runtime/gameRoutePreload";
import { GAME_ROUTE_ACCESS_PHASE, useGameRouteAccess, useWarmGameWorldQueries } from "@/world/world";

import { GameRouteErrorBoundary } from "@/runtime/components/GameRouteErrorBoundary";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";

const GameSession = lazy(async () =>
  loadGameSessionModule().then((module) => ({
    default: module.GameSession,
  })),
);

const gameRouteParamsSchema = z.object({
  gameId: z.custom<Id<"games">>(
    (value) => typeof value === "string" && value.length > 0,
    "Invalid game id.",
  ),
});

export const Route = createFileRoute("/game/$gameId")({
  params: {
    parse: (rawParams) => gameRouteParamsSchema.parse(rawParams),
    stringify: (params) => ({ gameId: params.gameId }),
  },
  // Keep the same loading screen while the route chunk resolves so players see
  // one continuous "Loading world" state instead of the generic router spinner.
  pendingComponent: () => <RouteLoadingScreen label="Loading world" />,
  component: GameRoute,
});

function GameRoute() {
  const navigate = useNavigate();
  const router = useRouter();
  const { gameId } = Route.useParams();
  // Identity comes from Convex auth (the optimistic token), so a hard refresh
  // into the game boots without waiting on the better-auth session round-trip.
  const { isConvexAuthenticated, isConvexAuthLoading, convexUser } = useAuth();
  const { playerId, playerName } = usePlayerIdentity();
  const routeAccessPhase = useGameRouteAccess(gameId);

  useWarmGameWorldQueries(gameId);

  useEffect(() => {
    preloadGameRoute(router, gameId);
  }, [gameId, router]);

  useEffect(() => {
    // Only bounce to login once Convex auth has settled to genuinely signed-out.
    if (isConvexAuthLoading || isConvexAuthenticated) return;
    navigate({ to: "/login" });
  }, [isConvexAuthenticated, isConvexAuthLoading, navigate]);

  if (isConvexAuthLoading || routeAccessPhase !== GAME_ROUTE_ACCESS_PHASE.ready || !isConvexAuthenticated) {
    const detail =
      routeAccessPhase === GAME_ROUTE_ACCESS_PHASE.redirecting
        ? "Redirecting to your world…"
        : isConvexAuthLoading
          ? "Checking session…"
          : "Connecting to your lab…";
    return <RouteLoadingScreen label="Loading world" detail={detail} />;
  }

  return (
    <GameRouteErrorBoundary>
      <Suspense fallback={<RouteLoadingScreen label="Loading world" />}>
        <GameSession user={{ id: playerId, name: playerName }} convexUser={convexUser} gameId={gameId} />
      </Suspense>
    </GameRouteErrorBoundary>
  );
}
