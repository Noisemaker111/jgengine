import { normalizeJoinCode } from "../multiplayer/matchmaking";
import type { GameServerStatus, SessionVisibility } from "./hostPersistence";

/**
 * True when a server's `visibility` should surface in public listings / browse results.
 * @capability host-listing-filter exclude private sessions from public browse results
 */
export function isListablePublicly(visibility: SessionVisibility | undefined): boolean {
  return (visibility ?? "public") !== "private";
}

/**
 * Private-server join-code gate. Existing members always pass; non-members must present a
 * matching `joinCode` (loose-normalized via {@link normalizeJoinCode}). Callers still decide
 * whether the server is private — this only answers the code/membership half.
 * @capability host-join-code-gate membership-or-code gate for private hosted servers
 */
export function canJoinPrivateServer(args: {
  isMember: boolean;
  joinCode: string | undefined;
  suppliedCode: string | undefined;
}): boolean {
  if (args.isMember) return true;
  if (args.joinCode === undefined || args.suppliedCode === undefined) return false;
  return normalizeJoinCode(args.suppliedCode) === normalizeJoinCode(args.joinCode);
}

/** Whether `userId` is already on the server's member roster. */
export function isServerMember(memberUserIds: readonly string[], userId: string): boolean {
  return memberUserIds.includes(userId);
}

/**
 * True when the server has no free slots for a non-member. Existing members never count as
 * "full" so rejoin/leave cycles keep working.
 */
export function isServerFull(
  memberUserIds: readonly string[],
  slotsPerServer: number,
  userId: string,
): boolean {
  return memberUserIds.length >= slotsPerServer && !memberUserIds.includes(userId);
}

/**
 * Whether a private-visibility server blocks this join (non-member without a matching code).
 * Public / undefined visibility never blocks.
 */
export function isPrivateJoinBlocked(args: {
  visibility: SessionVisibility | undefined;
  memberUserIds: readonly string[];
  userId: string;
  joinCode: string | undefined;
  suppliedCode: string | undefined;
}): boolean {
  if ((args.visibility ?? "public") !== "private") return false;
  return !canJoinPrivateServer({
    isMember: isServerMember(args.memberUserIds, args.userId),
    joinCode: args.joinCode,
    suppliedCode: args.suppliedCode,
  });
}

/** Roster after a successful join: unchanged when already a member, else appended. */
export function withJoinedMember(memberUserIds: readonly string[], userId: string): string[] {
  return memberUserIds.includes(userId) ? [...memberUserIds] : [...memberUserIds, userId];
}

/** Roster after a leave: `userId` removed; order of remaining members preserved. */
export function withoutMember(memberUserIds: readonly string[], userId: string): string[] {
  return memberUserIds.filter((id) => id !== userId);
}

/** Status after a leave: empty rooms reopen; non-empty rooms keep their current status. */
export function statusAfterLeave(
  remainingMemberCount: number,
  currentStatus: GameServerStatus,
): GameServerStatus {
  return remainingMemberCount === 0 ? "open" : currentStatus;
}

/**
 * Auto-match candidate when no `serverId` is supplied: already a member, or a public room with
 * free capacity. Private rooms are never auto-picked (join-by-code / direct id only).
 */
export function isAutoJoinCandidate(args: {
  memberUserIds: readonly string[];
  slotsPerServer: number;
  visibility: SessionVisibility | undefined;
  userId: string;
}): boolean {
  if (isServerMember(args.memberUserIds, args.userId)) return true;
  if (args.memberUserIds.length >= args.slotsPerServer) return false;
  return isListablePublicly(args.visibility);
}
