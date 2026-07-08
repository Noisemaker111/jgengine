import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  GameServerRecord,
  HostPersistence,
  LeaderboardRow,
  PlayerProfileRecord,
  WorldChunkRecord,
} from "@jgengine/core/runtime/hostPersistence";
import {
  applyLeaderboardRows,
  leaderboardRowKey,
  profileLeaderboardStats,
  topLeaderboardRows,
  trimFeedEntries,
} from "@jgengine/core/runtime/hostPersistence";

export { memoryPersistence } from "@jgengine/ws/host";

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
        applyLeaderboardRows(rows, gameId, entries, now());
        await writeJson(leaderboardPath, [...rows.values()]);
      });
      leaderboardLock = run.catch(() => undefined);
      await run;
    },
    async getLeaderboardTop(args) {
      await ensureDirs();
      return topLeaderboardRows((await loadLeaderboard()).values(), args);
    },
    async getLeaderboardProfile({ gameId, userId }) {
      await ensureDirs();
      return profileLeaderboardStats((await loadLeaderboard()).values(), gameId, userId);
    },
  };
}

export async function clearFilePersistence(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
