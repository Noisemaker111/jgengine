import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  resolveGuestSession,
  sessionPlayer,
  type AuthSession,
  type PlayerIdentity,
} from "@jgengine/core/multiplayer/identity";

export interface IdentitySource {
  session: AuthSession | null;
  isLoading: boolean;
  signOut?: () => void;
}

export interface ClerkUserShape {
  id: string;
  fullName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  createdAt?: Date | null;
  lastSignInAt?: Date | null;
}

export interface ClerkUserState {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  user: ClerkUserShape | null | undefined;
}

export function clerkIdentity(state: ClerkUserState, options?: { signOut?: () => void }): IdentitySource {
  if (!state.isLoaded) return { session: null, isLoading: true };
  const user = state.user;
  if (state.isSignedIn !== true || user === null || user === undefined) {
    return { session: null, isLoading: false };
  }
  const displayName = user.fullName ?? user.username ?? undefined;
  const session: AuthSession = { userId: user.id };
  if (displayName !== undefined) session.displayName = displayName;
  if (user.imageUrl !== null && user.imageUrl !== undefined) session.avatarUrl = user.imageUrl;
  const email = user.primaryEmailAddress?.emailAddress;
  if (email !== undefined) session.email = email;
  if (user.createdAt !== null && user.createdAt !== undefined) {
    session.isNew =
      user.lastSignInAt === null ||
      user.lastSignInAt === undefined ||
      user.lastSignInAt.getTime() <= user.createdAt.getTime();
  }
  const source: IdentitySource = { session, isLoading: false };
  if (options?.signOut !== undefined) source.signOut = options.signOut;
  return source;
}

export interface BetterAuthUserShape {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface BetterAuthSessionState {
  data: { user: BetterAuthUserShape } | null | undefined;
  isPending: boolean;
}

export function betterAuthIdentity(
  state: BetterAuthSessionState,
  options?: { signOut?: () => void },
): IdentitySource {
  if (state.isPending) return { session: null, isLoading: true };
  const user = state.data?.user;
  if (user === undefined) return { session: null, isLoading: false };
  const session: AuthSession = { userId: user.id };
  if (user.name !== null && user.name !== undefined) session.displayName = user.name;
  if (user.image !== null && user.image !== undefined) session.avatarUrl = user.image;
  if (user.email !== null && user.email !== undefined) session.email = user.email;
  const source: IdentitySource = { session, isLoading: false };
  if (options?.signOut !== undefined) source.signOut = options.signOut;
  return source;
}

export function guestIdentity(seed?: string): IdentitySource {
  return { session: resolveGuestSession(seed), isLoading: false };
}

const IdentityReactContext = createContext<IdentitySource | null>(null);

export function GameIdentityProvider({
  source,
  children,
}: {
  source: IdentitySource;
  children?: ReactNode;
}) {
  return <IdentityReactContext.Provider value={source}>{children}</IdentityReactContext.Provider>;
}

export function useSession(): IdentitySource {
  const source = useContext(IdentityReactContext);
  if (source === null) throw new Error("useSession must be used within <GameIdentityProvider>");
  return source;
}

export function useAuthedPlayer(options?: { guestSeed?: string }): PlayerIdentity | null {
  const { session, isLoading } = useSession();
  const guestSeed = options?.guestSeed;
  return useMemo(() => {
    if (session !== null) return sessionPlayer(session);
    if (isLoading || guestSeed === undefined) return null;
    return sessionPlayer(resolveGuestSession(guestSeed));
  }, [session, isLoading, guestSeed]);
}

export function RequireSession({
  fallback,
  loading,
  children,
}: {
  fallback?: ReactNode;
  loading?: ReactNode;
  children?: ReactNode;
}) {
  const { session, isLoading } = useSession();
  if (isLoading) return <>{loading ?? null}</>;
  if (session === null) return <>{fallback ?? null}</>;
  return <>{children}</>;
}

export function UserBadge({
  className,
  avatarClassName,
  nameClassName,
  renderBadge,
}: {
  className?: string;
  avatarClassName?: string;
  nameClassName?: string;
  renderBadge?: (session: AuthSession) => ReactNode;
}) {
  const { session } = useSession();
  if (session === null) return null;
  if (renderBadge !== undefined) return <>{renderBadge(session)}</>;
  return (
    <span className={className} data-user={session.userId}>
      {session.avatarUrl !== undefined && (
        <img className={avatarClassName} src={session.avatarUrl} alt="" data-avatar />
      )}
      <span className={nameClassName} data-display-name>
        {session.displayName ?? session.userId}
      </span>
    </span>
  );
}

export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { session, signOut } = useSession();
  if (session === null || signOut === undefined) return null;
  return (
    <button type="button" className={className} data-sign-out onClick={() => signOut()}>
      {children ?? "Sign out"}
    </button>
  );
}
