import { api } from "@llmville/backend/convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { FormEvent } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { authClient } from "@/auth/authClient";
import { deriveUsernameFromEmail } from "@/auth/authCredentials";
import { destinationAfterAuth, type PlayEntryIntent } from "@/runtime/playEntry";
import {
  CONVEX_TOKEN_REFRESH_LEEWAY_SECONDS,
  convexTokenSecondsRemaining,
  persistConvexToken,
  readConvexTokenSubject,
  readPersistedConvexToken,
} from "@/auth/sessionToken";
import { normalizeAvatarId } from "@/user/user";

type SessionPayload = Awaited<ReturnType<typeof authClient.getSession>>["data"];
type AuthUser = NonNullable<SessionPayload>["user"];
type ConvexUser = NonNullable<FunctionReturnType<typeof api.user.getCurrentUser>>;

function isAnonymousUser(user: AuthUser | null): boolean {
  return Boolean(user && "isAnonymous" in user && user.isAnonymous);
}

function betterAuthErrorMessage(
  error: { message?: string; statusText?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.message) return error.message;
  if (error.statusText && error.status) return `${error.statusText} (${error.status})`;
  if (error.statusText) return error.statusText;
  if (error.status) return `Request failed (${error.status})`;
  return fallback;
}

interface AuthContextType {
  /** better-auth session user. Resolves behind a cross-domain round-trip, so
   * prefer the Convex-auth signals below for anything on the load critical path;
   * use this for email/display fallbacks and the login/signup/create-world flow. */
  user: AuthUser | null;
  /** True while the better-auth session is still resolving. */
  isLoading: boolean;
  /** Session-derived: a better-auth user exists. */
  isAuthenticated: boolean;
  /** Convex auth from the optimistic token — true on the first render of a
   * remembered session, with no session round-trip. The honest signal for the
   * menu and any gameplay query. */
  isConvexAuthenticated: boolean;
  /** True only on a genuine cold first-auth (no remembered token yet). */
  isConvexAuthLoading: boolean;
  /** Session-derived: the current session is an anonymous guest. */
  isAnonymous: boolean;
  login: (email: string, password: string) => Promise<{ error?: { message: string } }>;
  register: (email: string, password: string) => Promise<{ error?: { message: string } }>;
  signInAsGuest: () => Promise<{ error?: { message: string } }>;
  logout: () => Promise<void>;
  convexUser: ConvexUser | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // better-auth's reactive session store is the single source of truth: it
  // updates itself on sign-in / sign-up / sign-out, so there is no manual
  // session state, no getSession polling, and no setUser juggling to drift.
  const { data: session, isPending } = authClient.useSession();
  const user: AuthUser | null = session?.user ?? null;

  const { isAuthenticated: convexAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const createOrUpdateUser = useMutation(api.user.createOrUpdate);

  // Keep a recent Convex JWT in storage so the next cold load can authenticate
  // optimistically (ConvexBetterAuthProvider `initialToken`) instead of waiting
  // for the session round-trip before any query runs. Only mint a new token when
  // the stored one is missing or close to expiring, so steady-state reloads add
  // no extra request.
  // Refresh a stale JWT as soon as Convex auth is ready — do not wait on the
  // better-auth `user` hook, because optimistic loads authenticate from the
  // cached token before `/get-session` resolves.
  useEffect(() => {
    if (!convexAuthenticated) return;
    const remaining = convexTokenSecondsRemaining(readPersistedConvexToken());
    if (remaining !== null && remaining > CONVEX_TOKEN_REFRESH_LEEWAY_SECONDS) return;
    let cancelled = false;
    void authClient.convex
      .token({ fetchOptions: { throw: false } })
      .then((result) => {
        if (cancelled) return;
        persistConvexToken(result.data?.token ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [convexAuthenticated]);

  // Once the session has actually resolved to "signed out" (not merely pending),
  // drop any stale token so logged-out cold loads don't attempt optimistic auth.
  useEffect(() => {
    if (isPending) return;
    if (user === null) persistConvexToken(null);
  }, [isPending, user]);

  // The one genuine side effect: mirror the better-auth user into Convex once
  // the Convex identity is ready. Guarded by id so it runs once per user.
  const syncedUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      syncedUserRef.current = null;
      return;
    }
    if (!convexAuthenticated || syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    if (isAnonymousUser(user)) {
      void createOrUpdateUser({ displayName: "Guest" }).catch((error) => {
        syncedUserRef.current = null;
        console.error("Failed to sync user to Convex:", error);
      });
      return;
    }
    const email = user.email || undefined;
    const preferredUsername = email ? deriveUsernameFromEmail(email) : undefined;
    void createOrUpdateUser({
      displayName: preferredUsername ?? user.name ?? "Lab Builder",
      email,
      username: preferredUsername,
    }).catch((error) => {
      syncedUserRef.current = null;
      console.error("Failed to sync user to Convex:", error);
    });
  }, [user, convexAuthenticated, createOrUpdateUser]);

  // Sourced from the Convex token, not the session: resolves on the first render
  // of a remembered login so the menu/profile never wait on `/get-session`.
  const convexUser = useQuery(
    api.user.getCurrentUser,
    convexAuthenticated ? {} : "skip",
  );

  const login = useCallback(async (email: string, password: string) => {
    const result = await authClient.signIn.email({ email: email.trim(), password });
    if (result.error) {
      return { error: { message: result.error.message || "Invalid credentials" } };
    }
    return {};
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim();
    const result = await authClient.signUp.email({
      email: trimmed,
      password,
      name: deriveUsernameFromEmail(trimmed),
    });
    if (result.error) {
      return { error: { message: result.error.message || "Registration failed" } };
    }
    return {};
  }, []);

  const signInAsGuest = useCallback(async () => {
    const result = await authClient.signIn.anonymous({
      fetchOptions: { throw: false },
    });
    const tokenResult = await authClient.convex.token({ fetchOptions: { throw: false } });
    if (!tokenResult.error) {
      persistConvexToken(tokenResult.data?.token ?? null);
      return {};
    }

    // better-auth anonymous sign-in can occasionally return an error after it
    // has already created the user/session. In that case token minting is the
    // source of truth for whether the guest session actually started.
    if (result.error) {
      return { error: { message: betterAuthErrorMessage(result.error, "Could not start guest session") } };
    }

    return { error: { message: betterAuthErrorMessage(tokenResult.error, "Could not start guest session") } };
  }, []);

  const logout = useCallback(async () => {
    // signOut clears the reactive session store, so `user` falls to null on its
    // own — we just wait for it and return home. Drop the optimistic-auth token
    // up front so the next load doesn't briefly authenticate as the old user.
    persistConvexToken(null);
    await authClient.signOut();
    window.location.assign("/");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated: user !== null,
        isConvexAuthenticated: convexAuthenticated,
        isConvexAuthLoading: convexAuthLoading,
        isAnonymous: isAnonymousUser(user),
        login,
        register,
        signInAsGuest,
        logout,
        convexUser: convexUser ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function usePlayerIdentity() {
  const { user, convexUser, isConvexAuthenticated } = useAuth();

  return {
    // The external id (== JWT subject) is available the moment Convex auth is
    // ready: from the user row if loaded, else straight from the token, with the
    // session `user.id` only as a last resort. Never waits on `/get-session`.
    playerId: convexUser?.externalId ?? readConvexTokenSubject() ?? user?.id ?? "anonymous",
    playerName: convexUser?.displayName || user?.name || "Lab Builder",
    isAuthenticated: isConvexAuthenticated,
    avatarId: normalizeAvatarId(convexUser?.avatarId),
  };
}

async function startGoogleAuth(playIntent?: PlayEntryIntent): Promise<{ error?: { message: string } }> {
  try {
    const { to } = destinationAfterAuth(playIntent);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${to}`,
    });

    if (result.error) {
      return { error: { message: result.error.message || "Google sign-in failed" } };
    }

    return {};
  } catch (error) {
    console.error("Google auth error:", error);
    return { error: { message: "Google sign-in failed" } };
  }
}

export function useLoginForm(onSuccess: () => void, playIntent?: PlayEntryIntent) {
  const { login, signInAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setIsGoogleLoading(true);
    const result = await startGoogleAuth(playIntent);
    if (result.error) {
      setError(result.error.message);
      setIsGoogleLoading(false);
    }
  }, [playIntent]);

  const handleGuest = useCallback(async () => {
    setError(null);
    setIsGuestLoading(true);
    const result = await signInAsGuest();
    if (result.error) {
      setError(result.error.message);
      setIsGuestLoading(false);
      return;
    }
    onSuccess();
  }, [onSuccess, signInAsGuest]);

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await login(email, password);
    if (result.error) {
      setError(result.error.message);
      setIsSubmitting(false);
      return;
    }

    onSuccess();
  }, [email, login, onSuccess, password]);

  return {
    email,
    password,
    error,
    isLoading: isSubmitting,
    isGoogleLoading,
    isGuestLoading,
    setEmail,
    setPassword,
    handleGoogleSignIn,
    handleGuest,
    handleSubmit,
  };
}

export const MAIN_MENU_ACCOUNT_CHIP_KIND = {
  signedOut: "signed_out",
  guest: "guest",
  profileLink: "profile_link",
  profilePending: "profile_pending",
} as const;

export type MainMenuAccountChipVm =
  | { kind: typeof MAIN_MENU_ACCOUNT_CHIP_KIND.signedOut }
  | { kind: typeof MAIN_MENU_ACCOUNT_CHIP_KIND.guest }
  | {
      kind: typeof MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink;
      username: string;
      displayLine: string;
    }
  | {
      kind: typeof MAIN_MENU_ACCOUNT_CHIP_KIND.profilePending;
      displayLine: string;
    };

export function useMainMenuAccountChipVm(): MainMenuAccountChipVm {
  const { user, isConvexAuthenticated, isAnonymous, convexUser } = useAuth();

  if (!isConvexAuthenticated) {
    return { kind: MAIN_MENU_ACCOUNT_CHIP_KIND.signedOut };
  }

  if (isAnonymous) {
    return { kind: MAIN_MENU_ACCOUNT_CHIP_KIND.guest };
  }

  if (convexUser?.username) {
    return {
      kind: MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink,
      username: convexUser.username,
      displayLine: convexUser.displayName || user?.name || "Director",
    };
  }

  return {
    kind: MAIN_MENU_ACCOUNT_CHIP_KIND.profilePending,
    displayLine: convexUser?.displayName || user?.name || "Director",
  };
}

export type DashboardScreenPhase = "loading" | "signed_out" | "guest" | "signed_in";

export function useDashboardScreenState() {
  const { user, convexUser, isConvexAuthenticated, isConvexAuthLoading, isAnonymous, logout } = useAuth();

  const phase: DashboardScreenPhase = isConvexAuthLoading
    ? "loading"
    : !isConvexAuthenticated
      ? "signed_out"
      : isAnonymous
        ? "guest"
        : "signed_in";

  return {
    phase,
    user,
    convexUser,
    logout,
    displayName: convexUser?.displayName ?? user?.name ?? "Lab Builder",
    email: user?.email ?? "Unknown",
    username: convexUser?.username ?? null,
  };
}

export function useSignupForm(onSuccess: () => void, playIntent?: PlayEntryIntent) {
  const { register, signInAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleGoogleSignUp = useCallback(async () => {
    setError(null);
    setIsGoogleLoading(true);
    const result = await startGoogleAuth(playIntent);
    if (result.error) {
      setError(result.error.message);
      setIsGoogleLoading(false);
    }
  }, [playIntent]);

  const handleGuest = useCallback(async () => {
    setError(null);
    setIsGuestLoading(true);
    const result = await signInAsGuest();
    if (result.error) {
      setError(result.error.message);
      setIsGuestLoading(false);
      return;
    }
    onSuccess();
  }, [onSuccess, signInAsGuest]);

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await register(email, password);
    if (result.error) {
      setError(result.error.message);
      setIsSubmitting(false);
      return;
    }

    onSuccess();
  }, [email, onSuccess, password, register]);

  return {
    email,
    password,
    error,
    isLoading: isSubmitting,
    isGoogleLoading,
    isGuestLoading,
    setEmail,
    setPassword,
    handleGoogleSignUp,
    handleGuest,
    handleSubmit,
  };
}
