/** @jsxImportSource @jgengine/core/ui/jsx */
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useEffect, useInsertionEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import type { ConvexReactClient } from "convex/react";
import { loadGameFonts } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./art/fonts/fonts";
import { AuthProvider } from "./auth";
import { authClient } from "./auth/authClient";
import { createConvexClient, initialConvexToken } from "./auth/convexClient";
import { Screens } from "./screens/screens";

export function LlmvilleBackend({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  useInsertionEffect(() => {
    loadGameFonts(GAME_FONTS);
  }, []);
  return (
    <ConvexBetterAuthProvider client={client} authClient={authClient} initialToken={initialConvexToken ?? null}>
      <AuthProvider>{children}</AuthProvider>
    </ConvexBetterAuthProvider>
  );
}

export function LlmvilleApp() {
  const client = useMemo(createConvexClient, []);
  useEffect(() => () => void client.close(), [client]);
  return (
    <LlmvilleBackend client={client}>
      <Screens />
    </LlmvilleBackend>
  );
}
