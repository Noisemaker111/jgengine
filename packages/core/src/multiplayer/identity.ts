import { hashString } from "../random/rng";

export interface AuthSession {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  isNew?: boolean;
}

export interface PlayerIdentity {
  userId: string;
  isNew: boolean;
}

export function sessionPlayer(session: AuthSession): PlayerIdentity {
  return { userId: session.userId, isNew: session.isNew ?? false };
}

const DEFAULT_GUEST_SEED = "local";

export function resolveGuestSession(seed?: string): AuthSession {
  const normalized = seed === undefined || seed.trim().length === 0 ? DEFAULT_GUEST_SEED : seed.trim();
  const hash = hashString(normalized).toString(36);
  return {
    userId: `guest_${hash}`,
    displayName: `Guest ${hash.slice(0, 4).toUpperCase()}`,
  };
}
