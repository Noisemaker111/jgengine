import { normalizeJoinCode } from "../multiplayer/matchmaking";
import type { GameServerStatus, SessionVisibility } from "./hostPersistence";

/**
 * Hard ceiling on `slotsPerServer` for a single hosted server row.
 *
 * A hosted server keeps its whole roster, every member's session state, and the world row in one
 * backing document. On Convex that document caps at 1 MiB with at most 1024 entries in an object, and
 * the host rewrites the session map on every persist — so member count is a per-transaction cost, not
 * just a number in a config. 256 leaves room for a real world row and a real session blob per member
 * inside those limits. A world that needs more concurrent players needs more than one server row.
 */
export const JG_MAX_MEMBERS_PER_SERVER = 256;

/** Whether a `slotsPerServer` value is a capacity a single hosted server row can actually hold. */
export function validateSlotsPerServer(
  slotsPerServer: number,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(slotsPerServer) || slotsPerServer < 1) {
    return { ok: false, reason: `slotsPerServer must be a positive integer, got ${slotsPerServer}` };
  }
  if (slotsPerServer > JG_MAX_MEMBERS_PER_SERVER) {
    return {
      ok: false,
      reason:
        `slotsPerServer ${slotsPerServer} exceeds JG_MAX_MEMBERS_PER_SERVER (${JG_MAX_MEMBERS_PER_SERVER}). ` +
        "One hosted server row holds its roster, every member's session state, and the world row in a " +
        "single document; past this the host cannot guarantee the write fits. Shard across servers instead.",
    };
  }
  return { ok: true };
}

/**
 * How auto-match behaves when no `serverId` is supplied.
 *
 * - `"auto"` — fill open public rooms, create a new one when none has capacity (many parallel rooms).
 * - `"singleton"` — one shared world per game: always match the existing room, and refuse the join
 *   when it is full rather than silently starting a second world the player would be alone in.
 */
export type MatchmakingMode = "auto" | "singleton";

/** A row `selectJoinTarget` can choose between — the matchmaking-relevant fields of a server record. */
export type JoinCandidate = {
  memberUserIds: readonly string[];
  slotsPerServer: number;
  visibility?: SessionVisibility | undefined;
  createdAt: number;
};

/** What a join should do with the candidate rows it found. */
export type JoinTarget<T extends JoinCandidate> =
  | { kind: "join"; row: T }
  | { kind: "create" }
  | { kind: "refuse"; reason: string };

/**
 * Resolve an auto-match join against the game's joinable rows under a {@link MatchmakingMode}.
 * Reach for it instead of hand-rolling the "find a room with space, else make one" scan, which is
 * where a singleton world silently shards into per-player copies.
 * @capability host-join-target choose or refuse an auto-matched server under a matchmaking mode
 */
export function selectJoinTarget<T extends JoinCandidate>(
  rows: readonly T[],
  args: {
    userId: string;
    mode?: MatchmakingMode;
    /** Capacity to judge rows against — the host's current option, when it supersedes the stored value. */
    slotsPerServer?: number;
  },
): JoinTarget<T> {
  const capacityOf = (row: T): number => args.slotsPerServer ?? row.slotsPerServer;
  const member = rows.find((row) => isServerMember(row.memberUserIds, args.userId));
  if (member) return { kind: "join", row: member };

  if ((args.mode ?? "auto") === "singleton") {
    const oldest = rows.reduce<T | null>(
      (best, row) => (best === null || row.createdAt < best.createdAt ? row : best),
      null,
    );
    if (oldest === null) return { kind: "create" };
    if (oldest.memberUserIds.length >= capacityOf(oldest)) {
      return { kind: "refuse", reason: "Server is full" };
    }
    return { kind: "join", row: oldest };
  }

  const open = rows.find((row) =>
    isAutoJoinCandidate({
      memberUserIds: row.memberUserIds,
      slotsPerServer: capacityOf(row),
      visibility: row.visibility,
      userId: args.userId,
    }),
  );
  return open === undefined ? { kind: "create" } : { kind: "join", row: open };
}

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
