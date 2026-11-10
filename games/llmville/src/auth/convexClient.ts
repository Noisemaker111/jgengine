import { ConvexReactClient } from "convex/react";

import { env } from "../webEnv";
import { readOptimisticConvexToken } from "./sessionToken";

export const convexClient = new ConvexReactClient(env.VITE_CONVEX_URL);

// Read once at startup: seeds Convex auth from the last remembered session so the
// first render is authenticated without waiting for the session round-trip.
// Expired/near-expiry JWTs are skipped so hard refresh does not get stuck loading.
export const initialConvexToken = readOptimisticConvexToken();
