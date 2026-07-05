import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  GameServerRecord,
  HostPersistence,
  LeaderboardEntry,
  LeaderboardIncrement,
  PlayerProfileRecord,
  WorldChunkRecord,
} from "@jgengine/core/runtime/hostPersistence";
import { trimFeedEntries } from "@jgengine/core/runtime/hostPersistence";

const MAX_TOP_LIMIT = 100;

type LeaderboardRow = {
  gameId: string;
  stat: string;
  scope: LeaderboardIncrement["scope"];
  serverId?: string;
  userId: string;
  value: number;
  updatedAt: number;
};

function leaderboardRowKey(row: Omit<LeaderboardRow, "value" | "updatedAt">): string {
  return [row.gameId, row.scope, row.stat, row.serverId ?? "", row.userId].join("|");
}

function applyIncrements(
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

function topRows(
  rows: Iterable<LeaderboardRow>,
  args: {
    gameId: string;
    stat: string;
    scope: LeaderboardIncrement["scope"];
    serverId?: string;
    limit?: number;
  },
): LeaderboardEntry[] {
  const limit = Math.min(Math.max(args.limit ?? MAX_TOP_LIMIT, 1), MAX_TOP_LIMIT);
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

function profileStats(rows: Iterable<LeaderboardRow>, gameId: string, userId: string): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const row of rows) {
    if (row.gameId === gameId && row.userId === userId && row.scope === "profile") {
      profile[row.stat] = row.value;
    }
  }
  return profile;
}

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
      const byKey = chunks.get(serverId) ?? new Map<string, WorldChunkRecord>();
      for (const record of records) {
        byKey.set(record.chunkKey, clone(record));
      }
      chunks.set(serverId, byKey);
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
      applyIncrements(leaderboard, gameId, entries, now());
    },
    async getLeaderboardTop(args) {
      return topRows(leaderboard.values(), args);
    },
    async getLeaderboardProfile({ gameId, userId }) {
      return profileStats(leaderboard.values(), gameId, userId);
    },
  };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(value), "utf8");
  await rename(temp, path);
}

const enc = encodeURIComponent;

export function filePersistence(dir: string, now: () => number = Date.now): HostPersistence {
  const serversDir = join(dir, "servers");
  const profilesDir = join(dir, "profiles");
  const chunksDir = join(dir, "chunks");
  const feedsDir = join(dir, "feeds");
  const leaderboardPath = join(dir, "leaderboard.json");

  let ready: Promise<void> | null = null;
  const ensureDirs = () => {
    ready ??= Promise.all(
      [serversDir, profilesDir, chunksDir, feedsDir].map((path) => mkdir(path, { recursive: true })),
    ).then(() => undefined);
    return ready;
  };

  const loadLeaderboard = async (): Promise<Map<string, LeaderboardRow>> => {
    const rows = (await readJson<LeaderboardRow[]>(leaderboardPath)) ?? [];
    return new Map(rows.map((row) => [leaderboardRowKey(row), row]));
  };

  let leaderboardLock: Promise<unknown> = Promise.resolve();

  return {
    async loadServer(serverId) {
      await ensureDirs();
      return readJson<GameServerRecord>(join(serversDir, `${enc(serverId)}.json`));
    },
    async saveServer(record) {
      await ensureDirs();
      await writeJson(join(serversDir, `${enc(record.serverId)}.json`), record);
    },
    async listServers(gameId) {
      await ensureDirs();
      const files = await readdir(serversDir);
      const records: GameServerRecord[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const record = await readJson<GameServerRecord>(join(serversDir, file));
        if (record !== null && record.gameId === gameId) records.push(record);
      }
      return records;
    },
    async loadProfile({ userId, gameId }) {
      await ensureDirs();
      return readJson<PlayerProfileRecord>(join(profilesDir, `${enc(gameId)}__${enc(userId)}.json`));
    },
    async saveProfile(record) {
      await ensureDirs();
      await writeJson(join(profilesDir, `${enc(record.gameId)}__${enc(record.userId)}.json`), record);
    },
    async loadChunks(serverId) {
      await ensureDirs();
      const serverDir = join(chunksDir, enc(serverId));
      let files: string[];
      try {
        files = await readdir(serverDir);
      } catch {
        return [];
      }
      const records: WorldChunkRecord[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const record = await readJson<WorldChunkRecord>(join(serverDir, file));
        if (record !== null) records.push(record);
      }
      return records;
    },
    async saveChunks(serverId, records) {
      await ensureDirs();
      const serverDir = join(chunksDir, enc(serverId));
      await mkdir(serverDir, { recursive: true });
      for (const record of records) {
        await writeJson(join(serverDir, `${enc(record.chunkKey)}.json`), record);
      }
    },
    async loadFeed({ serverId, action }) {
      await ensureDirs();
      return (await readJson<unknown[]>(join(feedsDir, `${enc(serverId)}__${enc(action)}.json`))) ?? [];
    },
    async appendFeed({ serverId, action, entry }) {
      await ensureDirs();
      const path = join(feedsDir, `${enc(serverId)}__${enc(action)}.json`);
      const entries = trimFeedEntries([...((await readJson<unknown[]>(path)) ?? []), entry]);
      await writeJson(path, entries);
      return entries;
    },
    async applyLeaderboardIncrements(gameId, entries) {
      const run = leaderboardLock.then(async () => {
        await ensureDirs();
        const rows = await loadLeaderboard();
        applyIncrements(rows, gameId, entries, now());
        await writeJson(leaderboardPath, [...rows.values()]);
      });
      leaderboardLock = run.catch(() => undefined);
      await run;
    },
    async getLeaderboardTop(args) {
      await ensureDirs();
      return topRows((await loadLeaderboard()).values(), args);
    },
    async getLeaderboardProfile({ gameId, userId }) {
      await ensureDirs();
      return profileStats((await loadLeaderboard()).values(), gameId, userId);
    },
  };
}

export async function clearFilePersistence(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
