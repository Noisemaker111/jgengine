/**
 * Persisted Convex auth token, used to authenticate the very first render of a
 * remembered session optimistically.
 *
 * Without this, a cold load runs a serial chain before any authed query can
 * fire: better-auth fetches `/get-session`, and only once that resolves does the
 * Convex provider mint a JWT. Seeding `ConvexBetterAuthProvider`'s `initialToken`
 * with the last token flips Convex auth to "authenticated" on the first render,
 * so queries start immediately and the token refresh overlaps the session fetch
 * instead of waiting behind it.
 *
 * Only comfortably-valid tokens may seed `initialToken`. An expired JWT still
 * makes `ConvexBetterAuthProvider` report authenticated (cached token) while
 * `isLoading` is false, so gameplay queries never resolve until the session
 * fetch finishes — and a hard refresh makes that stall look permanent.
 */
const STORAGE_KEY = "llmville.convex-token";

/** Match the refresh threshold in `AuthProvider` — tokens inside this window are not optimistic. */
export const CONVEX_TOKEN_REFRESH_LEEWAY_SECONDS = 120;

export function readPersistedConvexToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Token safe to pass as `ConvexBetterAuthProvider` `initialToken` on a cold load.
 * Near-expiry JWTs are dropped (and cleared from storage) so Convex auth stays in
 * the honest loading state until the better-auth session can mint a fresh token.
 */
export function readOptimisticConvexToken(): string | undefined {
  const token = readPersistedConvexToken();
  if (!token) return undefined;
  const remaining = convexTokenSecondsRemaining(token);
  if (remaining === null || remaining <= CONVEX_TOKEN_REFRESH_LEEWAY_SECONDS) {
    persistConvexToken(null);
    return undefined;
  }
  return token;
}

export function persistConvexToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can throw in private mode or when full — optimistic auth is a
    // best-effort speedup, so a failure here just falls back to the slow path.
  }
}

function decodeConvexTokenPayload(token: string | undefined): { exp?: number; sub?: string } | null {
  if (!token) return null;
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    return JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
      sub?: string;
    };
  } catch {
    return null;
  }
}

/** Seconds until the JWT's `exp`, or `null` when it can't be read. */
export function convexTokenSecondsRemaining(token: string | undefined): number | null {
  const payload = decodeConvexTokenPayload(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return payload.exp - Math.floor(Date.now() / 1000);
}

/**
 * The signed-in player's external id (== Convex JWT subject == better-auth user
 * id), read straight from the persisted token. Available the instant Convex auth
 * is ready, with no query and no session round-trip — so the game route can mint
 * a stable `playerId` before `getCurrentUser` or `/get-session` resolve.
 */
export function readConvexTokenSubject(): string | null {
  const payload = decodeConvexTokenPayload(readPersistedConvexToken());
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}
