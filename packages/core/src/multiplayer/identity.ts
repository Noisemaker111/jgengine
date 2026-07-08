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
  const hash = fnv1a(normalized);
  return {
    userId: `guest_${hash}`,
    displayName: `Guest ${hash.slice(0, 4).toUpperCase()}`,
  };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
