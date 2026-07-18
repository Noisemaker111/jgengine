import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type {
  GameServerRecord,
  HostPersistence,
  LeaderboardRow,
  PlayerProfileRecord,
  ServerListing,
  SessionAttributes,
  WorldChunkRecord,
} from "@jgengine/core/runtime/hostPersistence";
import {
  applyLeaderboardRows,
  buildHydratePlayers,
  planServerPersist,
  profileLeaderboardStats,
  shouldAutoSave,
  topLeaderboardRows,
  toOpenServerListings,
  toServerListing,
  trimFeedEntries,
} from "@jgengine/core/runtime/hostPersistence";
import {
  isListablePublicly,
  isPrivateJoinBlocked,
  isServerFull,
  isServerMember,
  statusAfterLeave,
  withJoinedMember,
  withoutMember,
} from "@jgengine/core/runtime/hostPolicy";
import type { MatchFilter, SessionListing } from "@jgengine/core/multiplayer/matchmaking";
import { browseSessions, findByJoinCode } from "@jgengine/core/multiplayer/matchmaking";
import {
  createFeedWriteGate,
  validateFeedWrite,
  type FeedWriteGate,
} from "@jgengine/core/multiplayer/feedWriteGate";
import type { GameRuntimeSnapshot, RuntimeChunkRow } from "@jgengine/core/runtime/snapshot";
import { clearDirtyFlags, createEmptyServerRow, splitProfilePlayer } from "@jgengine/core/runtime/snapshot";
import type {
  GameRuntimePlayerView,
  GameRuntimeServerView,
  JoinServerResult,
  TransportRunCommandResult,
} from "@jgengine/core/runtime/transport";

/** A change notification emitted by a `GameHost` for a server, player, or feed mutation. */
export type HostChangeEvent =
  | { type: "server"; serverId: string }
  | { type: "player"; serverId: string; userId: string }
  | { type: "feed"; serverId: string; action: string };

/** Configuration for {@link createGameHost}, including persistence, tick rate, and game runtimes. */
export type GameHostOptions = {
  runtimes?: GameRuntime[];
  persistence: HostPersistence;
  tickMs?: number;
  slotsPerServer?: number;
  now?: () => number;
  createServerId?: () => string;
  allowedFeedActions?: readonly string[];
};

/** A transport-agnostic authoritative game server host that manages sessions, ticking, and persistence. */
export type GameHost = {
  joinServer: (args: {
    userId: string;
    gameId: string;
    serverId?: string;
    attributes?: SessionAttributes;
    code?: string;
  }) => Promise<JoinServerResult>;
  browseServers: (args: {
    gameId: string;
    filter?: MatchFilter;
    limit?: number;
  }) => Promise<SessionListing[]>;
  joinByCode: (args: {
    userId: string;
    gameId: string;
    code: string;
  }) => Promise<JoinServerResult | null>;
  leaveServer: (args: { userId: string; serverId: string }) => Promise<void>;
  runCommand: (args: {
    userId: string;
    serverId: string;
    command: string;
    input: unknown;
  }) => Promise<TransportRunCommandResult>;
  isMember: (args: { userId: string; serverId: string }) => Promise<boolean>;
  getServerView: (args: { userId: string; serverId: string }) => Promise<GameRuntimeServerView | null>;
  getPlayerView: (args: { userId: string; serverId: string }) => Promise<GameRuntimePlayerView | null>;
  getFeed: (args: { userId: string; serverId: string; action: string }) => Promise<unknown[]>;
  pushFeedEntry: (args: {
    userId: string;
    serverId: string;
    action: string;
    entry: unknown;
  }) => Promise<void>;
  listOpenServers: (args: { gameId: string; limit?: number }) => Promise<ServerListing[]>;
  tickOnce: () => Promise<{ ticked: number; saved: number }>;
  flushAll: () => Promise<number>;
  start: () => void;
  stop: () => Promise<void>;
  subscribe: (listener: (event: HostChangeEvent) => void) => () => void;
};

type LiveServer = {
  record: GameServerRecord;
  snapshot: GameRuntimeSnapshot;
};

const builtinCommands = {
  "engine.ping": {
    validate: () => null,
    apply: (snapshot: GameRuntimeSnapshot) => snapshot,
  },
};

/** Max recently-applied `runCommand` op IDs retained per (serverId, userId), oldest evicted first. */
export const OP_LEDGER_LIMIT = 64;

const WS_OP_ID_FIELD = "__jgWsOpId";

type OpLedgerEntry = { opId: string; result: TransportRunCommandResult };

function unwrapOpEnvelope(input: unknown): { opId: string; input: unknown } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const opId = record[WS_OP_ID_FIELD];
  if (typeof opId !== "string") return null;
  const { [WS_OP_ID_FIELD]: _opId, ...rest } = record;
  return { opId, input: rest };
}

function opLedgerKey(serverId: string, userId: string): string {
  return `${serverId}|${userId}`;
}

/** Creates a `GameHost` that runs game servers over the given persistence and runtimes. */
export function createGameHost(options: GameHostOptions): GameHost {
  const now = options.now ?? Date.now;
  const tickMs = options.tickMs ?? 1_000;
  const defaultSlots = options.slotsPerServer ?? 16;
  const createServerId = options.createServerId ?? (() => `srv-${crypto.randomUUID()}`);
  const persistence = options.persistence;
  const feedWriteGate: FeedWriteGate = createFeedWriteGate(options.allowedFeedActions ?? []);

  const runtimes = new Map<string, GameRuntime>();
  for (const runtime of options.runtimes ?? []) {
    runtimes.set(runtime.gameId, runtime);
  }
  const resolveRuntime = (gameId: string): GameRuntime => {
    const existing = runtimes.get(gameId);
    if (existing) return existing;
    const fallback = createGameRuntime({ gameId, save: "none", commands: builtinCommands });
    runtimes.set(gameId, fallback);
    return fallback;
  };

  const live = new Map<string, LiveServer>();
  const listeners = new Set<(event: HostChangeEvent) => void>();
  const emit = (event: HostChangeEvent) => {
    for (const listener of listeners) listener(event);
  };

  const opLedgers = new Map<string, OpLedgerEntry[]>();

  const findAppliedOp = (serverId: string, userId: string, opId: string): TransportRunCommandResult | undefined =>
    opLedgers.get(opLedgerKey(serverId, userId))?.find((entry) => entry.opId === opId)?.result;

  const rememberAppliedOp = (
    serverId: string,
    userId: string,
    opId: string,
    result: TransportRunCommandResult,
  ) => {
    const key = opLedgerKey(serverId, userId);
    const entries = opLedgers.get(key) ?? [];
    entries.push({ opId, result });
    if (entries.length > OP_LEDGER_LIMIT) entries.shift();
    opLedgers.set(key, entries);
  };

  const forgetOpLedger = (serverId: string, userId: string) => {
    opLedgers.delete(opLedgerKey(serverId, userId));
  };

  const roomQueues = new Map<string, Promise<unknown>>();
  const enqueueRoom = <T>(roomId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = roomQueues.get(roomId) ?? Promise.resolve();
    const run = previous.then(operation);
    const settled = run.catch(() => undefined);
    roomQueues.set(roomId, settled);
    void settled.finally(() => {
      if (roomQueues.get(roomId) === settled) {
        roomQueues.delete(roomId);
      }
    });
    return run;
  };

  const hydrate = async (record: GameServerRecord): Promise<LiveServer> => {
    const runtime = resolveRuntime(record.gameId);
    const profiles: Record<string, PlayerProfileRecord | null> = {};
    for (const userId of record.memberUserIds) {
      profiles[userId] = await persistence.loadProfile({ userId, gameId: record.gameId });
    }
    const chunkRecords = await persistence.loadChunks(record.serverId);
    const chunksByKey: Record<string, RuntimeChunkRow> = {};
    for (const chunk of chunkRecords) {
      chunksByKey[chunk.chunkKey] = chunk.snapshot;
    }
    const snapshot = runtime.hydrate({
      gameId: record.gameId,
      serverId: record.serverId,
      serverRow: record.serverState,
      playersByUserId: buildHydratePlayers(record, profiles),
      chunksByKey,
      revision: record.revision,
    });
    const existing = live.get(record.serverId);
    if (existing) return existing;
    const entry: LiveServer = { record, snapshot };
    live.set(record.serverId, entry);
    return entry;
  };

  const getLive = async (serverId: string): Promise<LiveServer | null> => {
    const existing = live.get(serverId);
    if (existing) return existing;
    const record = await persistence.loadServer(serverId);
    if (record === null) return null;
    return hydrate(record);
  };

  const flushServer = async (entry: LiveServer): Promise<void> => {
    const timestamp = now();
    const plan = planServerPersist(entry.record, entry.snapshot, entry.record.save, timestamp);
    const cleared = { ...plan, server: { ...plan.server, dirtyAt: undefined } };
    if (persistence.savePlan) {
      await persistence.savePlan(cleared);
    } else {
      if (cleared.leaderboard.length > 0) {
        await persistence.applyLeaderboardIncrements(entry.record.gameId, cleared.leaderboard);
      }
      for (const profile of cleared.profiles) {
        await persistence.saveProfile(profile);
      }
      if (cleared.chunks.length > 0) {
        await persistence.saveChunks(entry.record.serverId, cleared.chunks);
      }
      if (cleared.deletedChunks.length > 0) {
        await persistence.deleteChunks(entry.record.serverId, cleared.deletedChunks);
      }
      await persistence.saveServer(cleared.server);
    }
    entry.record = cleared.server;
    entry.snapshot = clearDirtyFlags({ ...entry.snapshot, server: cleared.server.serverState });
  };

  const markMutated = (entry: LiveServer) => {
    const timestamp = now();
    entry.record = {
      ...entry.record,
      revision: entry.snapshot.revision,
      dirtyAt: entry.record.dirtyAt ?? timestamp,
      updatedAt: timestamp,
    };
  };

  let interval: ReturnType<typeof setInterval> | null = null;

  const tickOnce = async () => {
    const timestamp = now();
    const outcomes = await Promise.all(
      [...live.values()].map((entry) =>
        enqueueRoom(entry.record.serverId, async () => {
          if (entry.record.status !== "running") return { ticked: 0, saved: 0 };
          if (entry.record.memberUserIds.length === 0) return { ticked: 0, saved: 0 };
          const elapsedMs = timestamp - entry.record.tickAnchorMs;
          if (elapsedMs < tickMs) return { ticked: 0, saved: 0 };

          const runtime = resolveRuntime(entry.record.gameId);
          const before = entry.snapshot.revision;
          entry.snapshot = runtime.tick(entry.snapshot, elapsedMs / 1_000);
          entry.record = { ...entry.record, tickAnchorMs: timestamp, updatedAt: timestamp };
          if (entry.snapshot.revision !== before) {
            markMutated(entry);
            emit({ type: "server", serverId: entry.record.serverId });
          }

          let saved = 0;
          if (shouldAutoSave(entry.record.save, entry.record.dirtyAt, entry.record.lastSavedAt, timestamp)) {
            await flushServer(entry);
            saved = 1;
          }
          return { ticked: 1, saved };
        }),
      ),
    );
    let ticked = 0;
    let saved = 0;
    for (const outcome of outcomes) {
      ticked += outcome.ticked;
      saved += outcome.saved;
    }
    return { ticked, saved };
  };

  const collectListings = async (
    gameId: string,
    options: { includeJoinCode?: boolean } = {},
  ): Promise<SessionListing[]> => {
    const byId = new Map<string, GameServerRecord>();
    for (const record of await persistence.listServers(gameId)) {
      byId.set(record.serverId, record);
    }
    for (const entry of live.values()) {
      if (entry.record.gameId !== gameId) continue;
      byId.set(entry.record.serverId, entry.record);
    }
    return [...byId.values()].map((record) => ({
      serverId: record.serverId,
      gameId: record.gameId,
      status: record.status,
      visibility: record.visibility ?? "public",
      memberCount: record.memberUserIds.length,
      slotsPerServer: record.slotsPerServer,
      label: record.label,
      mode: record.mode,
      ...(options.includeJoinCode === true && record.joinCode !== undefined
        ? { joinCode: record.joinCode }
        : {}),
      tags: record.tags,
      updatedAt: record.updatedAt,
    }));
  };

  const host: GameHost = {
    joinServer: (args) => {
      const joinOperation = async (): Promise<JoinServerResult> => {
        const timestamp = now();
        const runtime = resolveRuntime(args.gameId);

        let entry = args.serverId === undefined ? null : await getLive(args.serverId);
        if (args.serverId !== undefined && entry === null) {
          throw new Error("Server not found");
        }
        if (entry !== null && entry.record.gameId !== args.gameId) {
          throw new Error("Server belongs to a different game");
        }

        if (
          entry !== null &&
          isPrivateJoinBlocked({
            visibility: entry.record.visibility,
            memberUserIds: entry.record.memberUserIds,
            userId: args.userId,
            joinCode: entry.record.joinCode,
            suppliedCode: args.code,
          })
        ) {
          throw new Error("Server is private");
        }

        if (entry === null) {
          const attributes = args.attributes;
          const record: GameServerRecord = {
            serverId: createServerId(),
            gameId: args.gameId,
            status: "running",
            memberUserIds: [],
            slotsPerServer: defaultSlots,
            save: runtime.save,
            serverState: createEmptyServerRow(),
            sessionPlayers: {},
            revision: 0,
            tickAnchorMs: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
            ...(attributes?.label !== undefined ? { label: attributes.label } : {}),
            ...(attributes?.mode !== undefined ? { mode: attributes.mode } : {}),
            ...(attributes?.visibility !== undefined ? { visibility: attributes.visibility } : {}),
            ...(attributes?.joinCode !== undefined ? { joinCode: attributes.joinCode } : {}),
            ...(attributes?.tags !== undefined ? { tags: attributes.tags } : {}),
          };
          entry = await hydrate(record);
        }

        const { record } = entry;
        if (isServerFull(record.memberUserIds, record.slotsPerServer, args.userId)) {
          throw new Error("Server is full");
        }

        const profile = await persistence.loadProfile({ userId: args.userId, gameId: args.gameId });
        const isNew = profile === null;

        entry.record = {
          ...record,
          memberUserIds: withJoinedMember(record.memberUserIds, args.userId),
          status: "running",
          updatedAt: timestamp,
          dirtyAt: timestamp,
        };
        entry.snapshot = runtime.joinPlayer(entry.snapshot, args.userId, isNew);
        await flushServer(entry);
        emit({ type: "server", serverId: entry.record.serverId });
        emit({ type: "player", serverId: entry.record.serverId, userId: args.userId });

        return { serverId: entry.record.serverId, isNew };
      };
      return args.serverId === undefined ? joinOperation() : enqueueRoom(args.serverId, joinOperation);
    },

    browseServers: async (args) =>
      browseSessions(await collectListings(args.gameId), args.filter ?? {}, { limit: args.limit }),

    joinByCode: async (args) => {
      const match = findByJoinCode(
        await collectListings(args.gameId, { includeJoinCode: true }),
        args.code,
      );
      if (match === null) return null;
      return host.joinServer({
        userId: args.userId,
        gameId: args.gameId,
        serverId: match.serverId,
        code: args.code,
      });
    },

    leaveServer: (args) =>
      enqueueRoom(args.serverId, async () => {
        const entry = await getLive(args.serverId);
        if (entry === null) return;
        if (!isServerMember(entry.record.memberUserIds, args.userId)) return;

        await flushServer(entry);

        const timestamp = now();
        const memberUserIds = withoutMember(entry.record.memberUserIds, args.userId);
        const sessionPlayers = { ...entry.record.sessionPlayers };
        delete sessionPlayers[args.userId];
        const players = { ...entry.snapshot.players };
        delete players[args.userId];

        entry.record = {
          ...entry.record,
          memberUserIds,
          sessionPlayers,
          updatedAt: timestamp,
          status: statusAfterLeave(memberUserIds.length, entry.record.status),
        };
        entry.snapshot = { ...entry.snapshot, players };
        await persistence.saveServer(entry.record);
        forgetOpLedger(args.serverId, args.userId);
        if (memberUserIds.length === 0) {
          live.delete(entry.record.serverId);
        }
        emit({ type: "server", serverId: args.serverId });
      }),

    runCommand: (args) =>
      enqueueRoom(args.serverId, async () => {
        const entry = await getLive(args.serverId);
        if (entry === null) {
          return { ok: false as const, reason: "Server not found" };
        }
        if (!isServerMember(entry.record.memberUserIds, args.userId)) {
          return { ok: false as const, reason: "Not a member of this server" };
        }

        const envelope = unwrapOpEnvelope(args.input);
        if (envelope !== null) {
          const applied = findAppliedOp(args.serverId, args.userId, envelope.opId);
          if (applied !== undefined) return applied;
        }
        const commandInput = envelope !== null ? envelope.input : args.input;

        const runtime = resolveRuntime(entry.record.gameId);
        const result = runtime.runCommand(entry.snapshot, args.userId, args.command, commandInput);
        const outcome: TransportRunCommandResult = result.ok
          ? { ok: true }
          : { ok: false, reason: result.reason };

        if (result.ok) {
          entry.snapshot = result.snapshot;
          markMutated(entry);
          emit({ type: "server", serverId: args.serverId });
          emit({ type: "player", serverId: args.serverId, userId: args.userId });
        }

        if (envelope !== null) {
          rememberAppliedOp(args.serverId, args.userId, envelope.opId, outcome);
        }
        return outcome;
      }),

    isMember: async (args) => {
      const entry = await getLive(args.serverId);
      if (entry === null) return false;
      return isServerMember(entry.record.memberUserIds, args.userId);
    },

    getServerView: async (args) => {
      const entry = await getLive(args.serverId);
      if (entry === null) return null;
      if (!isServerMember(entry.record.memberUserIds, args.userId)) return null;
      return {
        serverId: entry.record.serverId,
        gameId: entry.record.gameId,
        revision: entry.snapshot.revision,
        memberUserIds: entry.record.memberUserIds,
        serverState: entry.snapshot.server,
        updatedAt: entry.record.updatedAt,
      };
    },

    getPlayerView: async (args) => {
      const entry = await getLive(args.serverId);
      if (entry === null) return null;
      if (!isServerMember(entry.record.memberUserIds, args.userId)) return null;
      const player = entry.snapshot.players[args.userId];
      if (player !== undefined) {
        return {
          userId: args.userId,
          gameId: entry.record.gameId,
          playerState: splitProfilePlayer(player).persistent,
          updatedAt: entry.record.updatedAt,
        };
      }
      const profile = await persistence.loadProfile({ userId: args.userId, gameId: entry.record.gameId });
      if (profile === null) return null;
      return {
        userId: profile.userId,
        gameId: profile.gameId,
        playerState: profile.playerState,
        updatedAt: profile.updatedAt,
      };
    },

    getFeed: async (args) => {
      const entry = await getLive(args.serverId);
      if (entry === null) return [];
      if (!isServerMember(entry.record.memberUserIds, args.userId)) return [];
      return persistence.loadFeed({ serverId: args.serverId, action: args.action });
    },

    pushFeedEntry: (args) =>
      enqueueRoom(args.serverId, async () => {
        const allowed = validateFeedWrite(feedWriteGate, args.action);
        if (!allowed.ok) {
          throw new Error(allowed.reason);
        }
        const entry = await getLive(args.serverId);
        if (entry === null || !isServerMember(entry.record.memberUserIds, args.userId)) {
          throw new Error("Not a member of this server");
        }
        await persistence.appendFeed({ serverId: args.serverId, action: args.action, entry: args.entry });
        emit({ type: "feed", serverId: args.serverId, action: args.action });
      }),

    listOpenServers: async (args) => {
      const byId = new Map<string, ServerListing>();
      for (const record of await persistence.listServers(args.gameId)) {
        if (!isListablePublicly(record.visibility)) continue;
        byId.set(record.serverId, toServerListing(record));
      }
      for (const entry of live.values()) {
        if (entry.record.gameId !== args.gameId) continue;
        if (!isListablePublicly(entry.record.visibility)) continue;
        byId.set(entry.record.serverId, toServerListing(entry.record));
      }
      return toOpenServerListings(byId.values(), args.limit);
    },

    tickOnce,

    flushAll: async () => {
      const outcomes = await Promise.all(
        [...live.values()].map((entry) =>
          enqueueRoom(entry.record.serverId, async (): Promise<number> => {
            if (entry.record.dirtyAt === undefined) return 0;
            await flushServer(entry);
            return 1;
          }),
        ),
      );
      return outcomes.reduce((total, saved) => total + saved, 0);
    },

    start: () => {
      if (interval !== null) return;
      interval = setInterval(() => {
        void tickOnce();
      }, tickMs);
    },

    stop: async () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      await Promise.all(roomQueues.values());
      await Promise.all(
        [...live.values()].map((entry) =>
          enqueueRoom(entry.record.serverId, async () => {
            if (entry.record.dirtyAt === undefined) return;
            await flushServer(entry);
          }),
        ),
      );
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return host;
}

/** Creates an in-memory `HostPersistence` implementation, useful for tests and ephemeral hosts. */
export function memoryPersistence(now: () => number = Date.now): HostPersistence {
  const servers = new Map<string, GameServerRecord>();
  const profiles = new Map<string, PlayerProfileRecord>();
  const chunks = new Map<string, Map<string, WorldChunkRecord>>();
  const feeds = new Map<string, unknown[]>();
  const leaderboard = new Map<string, LeaderboardRow>();

  const clone = <T>(value: T): T => structuredClone(value);

  return {
    async loadServer(serverId) {
      const record = servers.get(serverId);
      return record === undefined ? null : clone(record);
    },
    async saveServer(record) {
      servers.set(record.serverId, clone(record));
    },
    async listServers(gameId) {
      return [...servers.values()].filter((record) => record.gameId === gameId).map(clone);
    },
    async loadProfile({ userId, gameId }) {
      const record = profiles.get(`${gameId}|${userId}`);
      return record === undefined ? null : clone(record);
    },
    async saveProfile(record) {
      profiles.set(`${record.gameId}|${record.userId}`, clone(record));
    },
    async loadChunks(serverId) {
      return [...(chunks.get(serverId)?.values() ?? [])].map(clone);
    },
    async saveChunks(serverId, records) {
      const byKey = chunks.get(serverId) ?? new Map();
      for (const record of records) {
        byKey.set(record.chunkKey, clone(record));
      }
      chunks.set(serverId, byKey);
    },
    async deleteChunks(serverId, chunkKeys) {
      const byKey = chunks.get(serverId);
      if (byKey === undefined) return;
      for (const chunkKey of chunkKeys) {
        byKey.delete(chunkKey);
      }
    },
    async loadFeed({ serverId, action }) {
      return clone(feeds.get(`${serverId}|${action}`) ?? []);
    },
    async appendFeed({ serverId, action, entry }) {
      const key = `${serverId}|${action}`;
      const entries = trimFeedEntries([...(feeds.get(key) ?? []), clone(entry)]);
      feeds.set(key, entries);
      return clone(entries);
    },
    async applyLeaderboardIncrements(gameId, entries) {
      applyLeaderboardRows(leaderboard, gameId, entries, now());
    },
    async getLeaderboardTop(args) {
      return topLeaderboardRows(leaderboard.values(), args);
    },
    async getLeaderboardProfile({ gameId, userId }) {
      return profileLeaderboardStats(leaderboard.values(), gameId, userId);
    },
  };
}
