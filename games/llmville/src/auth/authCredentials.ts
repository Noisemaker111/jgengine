import {
  deriveUsernameFromEmail,
  isValidGameUsername,
  normalizeLoginUsername,
} from "@llmville/game/auth/loginIdentifier";

export { deriveUsernameFromEmail };

/** Resolve the stored profile handle (skips the founder username step). */
export function resolveAuthUsername(
  convexUser: { username?: string | null } | null | undefined,
): string | null {
  const fromConvex = convexUser?.username ? normalizeLoginUsername(convexUser.username) : "";
  return isValidGameUsername(fromConvex) ? fromConvex : null;
}
