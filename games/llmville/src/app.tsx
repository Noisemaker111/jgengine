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

/** The backend and the signed-in account, for everything LLMville mounts: its screens, or a world on its own. */
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

/** All of LLMville: its backend, and whichever screen the installed address is on. */
export function LlmvilleApp() {
  const client = useMemo(createConvexClient, []);
  useEffect(() => () => void client.close(), [client]);
  return (
    <LlmvilleBackend client={client}>
      <Screens />
    </LlmvilleBackend>
  );
}
