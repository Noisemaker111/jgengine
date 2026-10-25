import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { AuthProvider } from "@/auth";
import { authClient } from "@/auth/authClient";
import { readOptimisticConvexToken } from "@/auth/sessionToken";
import { registerServiceWorker } from "@/pwa/serviceWorker";
import { loadGameSessionModule } from "@/runtime/gameRoutePreload";
import { loadAuthScreenModule } from "@/user/authScreenPreload";
import { convex, initialConvexToken, router } from "./routerInstance";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialConvexToken}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ConvexBetterAuthProvider>,
  );
}

registerServiceWorker();

// A remembered login almost always lands in the 3D world, whose chunk (three.js
// + R3F) is the single biggest download. Warm it on idle after first paint so it
// arrives in parallel with auth — by the time "Continue" is clicked it is cached,
// not a 5-second wait. New visitors land on /login instead, so warm the small
// auth-screen chunk and keep the giant game download off their critical path.
{
  const warm = readOptimisticConvexToken()
    ? () => void loadGameSessionModule()
    : () => void loadAuthScreenModule();
  const idle = (window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  }).requestIdleCallback;
  if (idle) idle(warm, { timeout: 2000 });
  else window.setTimeout(warm, 200);
}
