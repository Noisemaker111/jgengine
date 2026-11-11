/** @jsxImportSource @jgengine/core/ui/jsx */
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useInsertionEffect, type ReactNode } from "@jgengine/core/ui/jsx";
import { loadGameFonts } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./art/fonts/fonts";
import { AuthProvider } from "./auth";
import { authClient } from "./auth/authClient";
import { convexClient, initialConvexToken } from "./auth/convexClient";
import { Screens } from "./screens/screens";

/** The backend and the signed-in account, for everything LLMville mounts: its screens, or a world on its own. */
export function LlmvilleBackend({ children }: { children: ReactNode }) {
  useInsertionEffect(() => {
    loadGameFonts(GAME_FONTS);
  }, []);
  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={authClient} initialToken={initialConvexToken ?? null}>
      <AuthProvider>{children}</AuthProvider>
    </ConvexBetterAuthProvider>
  );
}

/** All of LLMville: its backend, and whichever screen the installed address is on. */
export function LlmvilleApp() {
  return (
    <LlmvilleBackend>
      <Screens />
    </LlmvilleBackend>
  );
}
