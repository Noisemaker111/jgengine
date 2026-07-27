import type { LeaderboardScope } from "../game/leaderboard";
import type { NormalizedScenarioReset } from "./persistenceScope";
import type { SaveConfig } from "./save";
import {
  isSaveEnabled,
  parseSaveAutoMs,
  saveScopeIncludesChunks,
  saveScopeIncludesPlayer,
} from "./save";
import type {
  GameRuntimeSnapshot,
  RuntimeChunkRow,
  RuntimePlayerRow,
  RuntimeServerRow,
} from "./snapshot";
import { createEmptyPlayerRow, splitProfilePlayer } from "./snapshot";

export type GameServerStatus = "open" | "running" | "closed";

export type SessionVisibility = "public" | "private";

export type SessionAttributes = {
  label?: string;
  mode?: string;
  visibility?: SessionVisibility;
  joinCode?: string;
  tags?: string[];
};

export type GameServerRecord = {
  serverId: string;
  gameId: string;
  status: GameServerStatus;
  mode?: string;
  modeConfig?: unknown;
  label?: string;
  visibility?: SessionVisibility;
  joinCode?: string;
  tags?: string[];
  memberUserIds: string[];
  slotsPerServer: number;
  save: SaveConfig;
  serverState: RuntimeServerRow;
  sessionPlayers: Record<string, RuntimePlayerRow>;
  revision: number;
  tickAnchorMs: number;
  lastSavedAt?: number;
  dirtyAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type PlayerProfileRecord = {
  userId: string;
  gameId: string;
  playerState: RuntimePlayerRow;
  revision: number;
  updatedAt: number;
};

export type WorldChunkRecord = {
  serverId: string;
  chunkKey: string;
  snapshot: RuntimeChunkRow;
  updatedAt: number;
};

export type LeaderboardIncrement = {
  userId: string;
  stat: string;
  scope: LeaderboardScope;
  serverId?: string;
  by: number;
};

export type LeaderboardEntry = {
  userId: string;
  value: number;
};

export const LEADERBOARD_PENDING_KEY = "leaderboardPending";

function isLeaderboardIncrement(value: unknown): value is LeaderboardIncrement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LeaderboardIncrement>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.stat === "string" &&
    (candidate.scope === "global" || candidate.scope === "server" || candidate.scope === "profile") &&
    typeof candidate.by === "number" &&
    (candidate.serverId === undefined || typeof candidate.serverId === "string")
  );
}

/** @internal */
export function drainPendingLeaderboardIncrements(session: Record<string, unknown>): {
  increments: LeaderboardIncrement[];
  session: Record<string, unknown>;
} {
  const raw = session[LEADERBOARD_PENDING_KEY];
  if (!Array.isArray(raw) || raw.length === 0) {
    return { increments: [], session };
  }
  const rest = { ...session };
  delete rest[LEADERBOARD_PENDING_KEY];
  return { increments: raw.filter(isLeaderboardIncrement), session: rest };
}

export const LEADERBOARD_TOP_LIMIT = 100;

/** @internal */
export function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(Math.max(Math.floor(candidate), 1), max);
}

export type LeaderboardRow = {
  gameId: string;
  stat: string;
  scope: LeaderboardScope;
  serverId?: string;
  userId: string;
  value: number;
  updatedAt: number;
};

/** @internal */
export function leaderboardRowKey(row: Omit<LeaderboardRow, "value" | "updatedAt">): string {
  return [row.gameId, row.scope, row.stat, row.serverId ?? "", row.userId].join("|");
}

/** @internal */
export function applyLeaderboardRows(
  rows: Map<string, LeaderboardRow>,
  gameId: string,
  entries: LeaderboardIncrement[],
  now: number,
): void {
  for (const entry of entries) {
    const key = leaderboardRowKey({ ...entry, gameId });
    const existing = rows.get(key);
    if (existing) {
      rows.set(key, { ...existing, value: existing.value + entry.by, updatedAt: now });
    } else {
      rows.set(key, {
        gameId,
        stat: entry.stat,
        scope: entry.scope,
        serverId: entry.serverId,
        userId: entry.userId,
        value: entry.by,
        updatedAt: now,
      });
    }
  }
}

/** @internal */
export function topLeaderboardRows(
  rows: Iterable<LeaderboardRow>,
  args: {
    gameId: string;
    stat: string;
    scope: LeaderboardScope;
    serverId?: string;
    limit?: number;
  },
): LeaderboardEntry[] {
  const limit = clampLimit(args.limit, LEADERBOARD_TOP_LIMIT, LEADERBOARD_TOP_LIMIT);
  return [...rows]
    .filter(
      (row) =>
        row.gameId === args.gameId &&
        row.stat === args.stat &&
        row.scope === args.scope &&
        (args.serverId === undefined || row.serverId === args.serverId),
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((row) => ({ userId: row.userId, value: row.value }));
}

/** @internal */
export function profileLeaderboardStats(
  rows: Iterable<LeaderboardRow>,
  gameId: string,
  userId: string,
): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const row of rows) {
    if (row.gameId === gameId && row.userId === userId && row.scope === "profile") {
      profile[row.stat] = row.value;
    }
  }
  return profile;
}

export const FEED_RING_LIMIT = 20;

/** @internal */
export function trimFeedEntries<T>(entries: T[], limit = FEED_RING_LIMIT): T[] {
  if (entries.length <= limit) return entries;
  return entries.slice(entries.length - limit);
}

/** @internal */
export function shouldAutoSave(
  save: SaveConfig,
  dirtyAt: number | undefined,
  lastSavedAt: number | undefined,
  now: number,
): boolean {
  if (!isSaveEnabled(save)) return false;
  if (dirtyAt === undefined) return false;
  const intervalMs = parseSaveAutoMs(save.auto);
  const anchor = lastSavedAt ?? 0;
  return now - anchor >= intervalMs;
}

export type ServerListing = {
  serverId: string;
  status: GameServerStatus;
  memberCount: number;
  slotsPerServer: number;
  mode?: string;
  label?: string;
  visibility?: SessionVisibility;
  joinCode?: string;
  tags?: string[];
  updatedAt: number;
};

export type ToServerListingOptions = {
  includeJoinCode?: boolean;
};

/** @internal */
export function toServerListing(
  record: GameServerRecord,
  options: ToServerListingOptions = {},
): ServerListing {
  return {
    serverId: record.serverId,
    status: record.status,
    memberCount: record.memberUserIds.length,
    slotsPerServer: record.slotsPerServer,
    mode: record.mode,
    label: record.label,
    visibility: record.visibility,
    ...(options.includeJoinCode === true && record.joinCode !== undefined
      ? { joinCode: record.joinCode }
      : {}),
    tags: record.tags,
    updatedAt: record.updatedAt,
  };
}

export const OPEN_SERVER_LISTING_LIMIT = 20;
export const OPEN_SERVER_LISTING_MAX = 100;

/** @internal */
export function toOpenServerListings(
  listings: Iterable<ServerListing>,
  limit: number = OPEN_SERVER_LISTING_LIMIT,
): ServerListing[] {
  return [...listings]
    .filter((listing) => listing.status === "running")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, clampLimit(limit, OPEN_SERVER_LISTING_LIMIT, OPEN_SERVER_LISTING_MAX));
}

export type HostPersistence = {
  savePlan?: (plan: ServerPersistPlan) => Promise<void>;
  resetScenario?: (reset: NormalizedScenarioReset) => Promise<void>;
  loadServer: (serverId: string) => Promise<GameServerRecord | null>;
  saveServer: (record: GameServerRecord) => Promise<void>;
  listServers: (gameId: string) => Promise<GameServerRecord[]>;
  loadProfile: (args: { userId: string; gameId: string }) => Promise<PlayerProfileRecord | null>;
  saveProfile: (record: PlayerProfileRecord) => Promise<void>;
  loadChunks: (serverId: string) => Promise<WorldChunkRecord[]>;
  saveChunks: (serverId: string, chunks: WorldChunkRecord[]) => Promise<void>;
  deleteChunks: (serverId: string, chunkKeys: string[]) => Promise<void>;
  loadFeed: (args: { serverId: string; action: string }) => Promise<unknown[]>;
  appendFeed: (args: { serverId: string; action: string; entry: unknown }) => Promise<unknown[]>;
  applyLeaderboardIncrements: (gameId: string, entries: LeaderboardIncrement[]) => Promise<void>;
  getLeaderboardTop: (args: {
    gameId: string;
    stat: string;
    scope: LeaderboardScope;
    serverId?: string;
    limit?: number;
  }) => Promise<LeaderboardEntry[]>;
  getLeaderboardProfile: (args: { gameId: string; userId: string }) => Promise<Record<string, number>>;
};

/**
 * Hydrate the runtime's player map from the server row plus whatever profiles were loaded.
 *
 * `userIds` narrows the work to a subset of the roster (partial hydration); omit it for the whole
 * roster. A member with a loaded profile takes it as authoritative and keeps its session blob from
 * the server row.
 *
 * A member with no profile row resolves by save scope, not by falling back to the blob: when the game
 * persists players, a missing profile means the profile was deleted, so the member hydrates empty and
 * the deletion sticks. Only a game that never writes profiles (`save: "none"`, or a scope without
 * `player`) treats the server row's session copy as the player's state.
 * @internal
 */
export function buildHydratePlayers(
  server: GameServerRecord,
  profiles: Record<string, PlayerProfileRecord | null>,
  userIds?: readonly string[],
): Record<string, RuntimePlayerRow> {
  const persistsPlayers = isSaveEnabled(server.save) && saveScopeIncludesPlayer(server.save.scope);
  const players: Record<string, RuntimePlayerRow> = {};
  for (const userId of userIds ?? server.memberUserIds) {
    const profile = profiles[userId] ?? null;
    const sessionPlayer = server.sessionPlayers[userId];
    const session = sessionPlayer?.session;
    if (profile) {
      players[userId] = {
        ...profile.playerState,
        ...(session ? { session } : {}),
      };
    } else if (sessionPlayer && !persistsPlayers) {
      players[userId] = sessionPlayer;
    } else {
      players[userId] = {
        ...createEmptyPlayerRow(userId),
        ...(session ? { session } : {}),
      };
    }
  }
  return players;
}

/** True when a snapshot carries no unwritten mutation — nothing for a persist to do. */
export function isSnapshotClean(snapshot: GameRuntimeSnapshot): boolean {
  return (
    !snapshot.dirty.server &&
    snapshot.dirty.players.length === 0 &&
    snapshot.dirty.chunks.length === 0
  );
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export type ServerPersistPlan = {
  server: GameServerRecord;
  profiles: PlayerProfileRecord[];
  chunks: WorldChunkRecord[];
  deletedChunks: string[];
  leaderboard: LeaderboardIncrement[];
  /**
   * Which fields of the server row the plan actually moved. A store that pays per written field —
   * or whose subscribers re-push a whole document on any change — writes only what changed and skips
   * the row entirely when `changed.any` is false.
   */
  changed: {
    serverState: boolean;
    sessionPlayers: boolean;
    revision: boolean;
    any: boolean;
  };
};

/** @internal */
export function planServerPersist(
  server: GameServerRecord,
  snapshot: GameRuntimeSnapshot,
  save: SaveConfig,
  now: number,
): ServerPersistPlan {
  const drained = drainPendingLeaderboardIncrements(snapshot.server.session);
  const serverState =
    drained.increments.length > 0 ? { ...snapshot.server, session: drained.session } : snapshot.server;
  const leaderboard = drained.increments.map((entry) =>
    entry.scope === "server" && entry.serverId === undefined
      ? { ...entry, serverId: server.serverId }
      : entry,
  );

  const canWritePlayers = isSaveEnabled(save) && saveScopeIncludesPlayer(save.scope);
  const canWriteChunks = isSaveEnabled(save) && saveScopeIncludesChunks(save.scope);

  // Merged over the stored map rather than rebuilt from `snapshot.players`, so a partially hydrated
  // snapshot cannot drop the session state of members it never loaded.
  const sessionPlayers: Record<string, RuntimePlayerRow> = {};
  const roster = new Set(server.memberUserIds);
  for (const [userId, stored] of Object.entries(server.sessionPlayers ?? {})) {
    if (roster.has(userId)) sessionPlayers[userId] = stored;
  }
  const profiles: PlayerProfileRecord[] = [];
  for (const userId of Object.keys(snapshot.players)) {
    const player = snapshot.players[userId];
    if (!player) continue;
    const { persistent, session } = splitProfilePlayer(player);
    if (roster.has(userId)) sessionPlayers[userId] = { ...persistent, session };

    if (canWritePlayers && snapshot.dirty.players.includes(userId)) {
      profiles.push({
        userId,
        gameId: server.gameId,
        playerState: persistent,
        revision: snapshot.revision,
        updatedAt: now,
      });
    }
  }

  const chunks: WorldChunkRecord[] = [];
  const deletedChunks: string[] = [];
  if (canWriteChunks) {
    for (const chunkKey of snapshot.dirty.chunks) {
      const chunk = snapshot.chunks[chunkKey];
      if (chunk) {
        chunks.push({ serverId: server.serverId, chunkKey, snapshot: chunk, updatedAt: now });
      } else {
        deletedChunks.push(chunkKey);
      }
    }
  }

  // Server state is written unconditionally, so only unwritable player/chunk dirt keeps the row dirty;
  // anything else would make shouldAutoSave re-fire forever after a successful full flush.
  const unwritten =
    (snapshot.dirty.players.length > 0 && !canWritePlayers) ||
    (snapshot.dirty.chunks.length > 0 && !canWriteChunks);

  const serverStateChanged = !sameJson(serverState, server.serverState);
  const sessionPlayersChanged = !sameJson(sessionPlayers, server.sessionPlayers);
  const revisionChanged = snapshot.revision !== server.revision;

  return {
    server: {
      ...server,
      serverState,
      sessionPlayers,
      revision: snapshot.revision,
      dirtyAt: unwritten ? (server.dirtyAt ?? now) : undefined,
      updatedAt: now,
      lastSavedAt: now,
    },
    profiles,
    chunks,
    deletedChunks,
    leaderboard,
    changed: {
      serverState: serverStateChanged,
      sessionPlayers: sessionPlayersChanged,
      revision: revisionChanged,
      any:
        serverStateChanged ||
        sessionPlayersChanged ||
        revisionChanged ||
        profiles.length > 0 ||
        chunks.length > 0 ||
        deletedChunks.length > 0 ||
        leaderboard.length > 0 ||
        (server.dirtyAt !== undefined) !== unwritten,
    },
  };
}
