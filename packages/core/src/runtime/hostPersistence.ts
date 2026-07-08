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

export type LeaderboardRow = {
  gameId: string;
  stat: string;
  scope: LeaderboardScope;
  serverId?: string;
  userId: string;
  value: number;
  updatedAt: number;
};

export function leaderboardRowKey(row: Omit<LeaderboardRow, "value" | "updatedAt">): string {
  return [row.gameId, row.scope, row.stat, row.serverId ?? "", row.userId].join("|");
}

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
  const limit = Math.min(Math.max(args.limit ?? LEADERBOARD_TOP_LIMIT, 1), LEADERBOARD_TOP_LIMIT);
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

export function trimFeedEntries<T>(entries: T[], limit = FEED_RING_LIMIT): T[] {
  if (entries.length <= limit) return entries;
  return entries.slice(entries.length - limit);
}

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

export function toServerListing(record: GameServerRecord): ServerListing {
  return {
    serverId: record.serverId,
    status: record.status,
    memberCount: record.memberUserIds.length,
    slotsPerServer: record.slotsPerServer,
    mode: record.mode,
    label: record.label,
    visibility: record.visibility,
    joinCode: record.joinCode,
    tags: record.tags,
    updatedAt: record.updatedAt,
  };
}

export function toOpenServerListings(listings: Iterable<ServerListing>, limit = 20): ServerListing[] {
  return [...listings]
    .filter((listing) => listing.status === "running")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
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

export function buildHydratePlayers(
  server: GameServerRecord,
  profiles: Record<string, PlayerProfileRecord | null>,
): Record<string, RuntimePlayerRow> {
  const players: Record<string, RuntimePlayerRow> = {};
  for (const userId of server.memberUserIds) {
    const profile = profiles[userId] ?? null;
    const sessionPlayer = server.sessionPlayers[userId];
    if (profile) {
      players[userId] = {
        ...profile.playerState,
        ...(sessionPlayer?.session ? { session: sessionPlayer.session } : {}),
      };
    } else if (sessionPlayer) {
      players[userId] = sessionPlayer;
    } else {
      players[userId] = createEmptyPlayerRow(userId);
    }
  }
  return players;
}

export type ServerPersistPlan = {
  server: GameServerRecord;
  profiles: PlayerProfileRecord[];
  chunks: WorldChunkRecord[];
  leaderboard: LeaderboardIncrement[];
};

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

  const sessionPlayers: Record<string, RuntimePlayerRow> = {};
  const profiles: PlayerProfileRecord[] = [];
  for (const userId of Object.keys(snapshot.players)) {
    const player = snapshot.players[userId];
    if (!player) continue;
    const { persistent, session } = splitProfilePlayer(player);
    sessionPlayers[userId] = { ...persistent, session };

    if (
      isSaveEnabled(save) &&
      saveScopeIncludesPlayer(save.scope) &&
      snapshot.dirty.players.includes(userId)
    ) {
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
  if (isSaveEnabled(save) && saveScopeIncludesChunks(save.scope)) {
    for (const chunkKey of snapshot.dirty.chunks) {
      const chunk = snapshot.chunks[chunkKey];
      if (!chunk) continue;
      chunks.push({ serverId: server.serverId, chunkKey, snapshot: chunk, updatedAt: now });
    }
  }

  return {
    server: {
      ...server,
      serverState,
      sessionPlayers,
      revision: snapshot.revision,
      dirtyAt: snapshot.dirty.server || snapshot.dirty.players.length > 0 ? now : server.dirtyAt,
      updatedAt: now,
      lastSavedAt: now,
    },
    profiles,
    chunks,
    leaderboard,
  };
}
