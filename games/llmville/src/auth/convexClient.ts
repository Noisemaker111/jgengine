import { ConvexReactClient } from "convex/react";

import { env } from "../webEnv";
import { readOptimisticConvexToken } from "./sessionToken";

/** A Convex client for one LLMville mount; whoever creates it closes it when that mount goes. */
export function createConvexClient(): ConvexReactClient {
  // Convex's leave-page warning adds a window listener its `close()` never removes, so every closed game would keep one.
  return new ConvexReactClient(env.VITE_CONVEX_URL, { unsavedChangesWarning: false });
}

// Read once at startup: seeds Convex auth from the last remembered session so the
// first render is authenticated without waiting for the session round-trip.
// Expired/near-expiry JWTs are skipped so hard refresh does not get stuck loading.
export const initialConvexToken = readOptimisticConvexToken();
