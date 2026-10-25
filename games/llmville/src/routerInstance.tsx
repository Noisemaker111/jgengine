import { env } from "@/webEnv";
import { createRouter } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";

import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import { readOptimisticConvexToken } from "@/auth/sessionToken";
import { GameRouteErrorComponent } from "@/runtime/components/GameRouteErrorComponent";

import { routeTree } from "./routeTree.gen";

export const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

// Read once at startup: seeds Convex auth from the last remembered session so the
// first render is authenticated without waiting for the session round-trip.
// Expired/near-expiry JWTs are skipped so hard refresh does not get stuck loading.
export const initialConvexToken = readOptimisticConvexToken();

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingMinMs: 0,
  defaultPendingMs: 50,
  defaultPendingComponent: () => <RouteLoadingScreen />,
  defaultErrorComponent: GameRouteErrorComponent,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
