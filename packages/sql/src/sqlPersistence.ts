import type {
  GameServerRecord,
  HostPersistence,
  LeaderboardIncrement,
  PlayerProfileRecord,
  ServerPersistPlan,
  WorldChunkRecord,
} from "@jgengine/core/runtime/hostPersistence";
import { clampLimit, trimFeedEntries } from "@jgengine/core/runtime/hostPersistence";
import { applyRunReset } from "@jgengine/core/runtime/persistenceScope";

export type SqlQueryResult = { rows: Record<string, unknown>[] };

export type SqlQueryable = {
  query: (text: string, params?: unknown[]) => Promise<SqlQueryResult>;
};

export type SqlPoolClient = SqlQueryable & {
  release: () => void;
};

export type SqlPool = SqlQueryable & {
  connect: () => Promise<SqlPoolClient>;
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS jg_game_servers (
    server_id text PRIMARY KEY,
    game_id text NOT NULL,
    status text NOT NULL,
    updated_at bigint NOT NULL,
    record jsonb NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS jg_game_servers_by_game ON jg_game_servers (game_id, status)`,
  `CREATE TABLE IF NOT EXISTS jg_player_profiles (
    game_id text NOT NULL,
    user_id text NOT NULL,
    updated_at bigint NOT NULL,
    record jsonb NOT NULL,
    PRIMARY KEY (game_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS jg_world_chunks (
    server_id text NOT NULL,
    chunk_key text NOT NULL,
    updated_at bigint NOT NULL,
    record jsonb NOT NULL,
    PRIMARY KEY (server_id, chunk_key)
  )`,
  `CREATE TABLE IF NOT EXISTS jg_leaderboard_rows (
    game_id text NOT NULL,
    scope text NOT NULL,
    stat text NOT NULL,
    server_id text NOT NULL DEFAULT '',
    user_id text NOT NULL,
    value double precision NOT NULL,
    updated_at bigint NOT NULL,
    PRIMARY KEY (game_id, scope, stat, server_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS jg_leaderboard_top ON jg_leaderboard_rows (game_id, scope, stat, value)`,
  `CREATE TABLE IF NOT EXISTS jg_feed_buffers (
    server_id text NOT NULL,
    action text NOT NULL,
    updated_at bigint NOT NULL,
    entries jsonb NOT NULL,
    PRIMARY KEY (server_id, action)
  )`,
];

export async function ensureSchema(pool: SqlQueryable): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}

const MAX_TOP_LIMIT = 100;

function asJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

async function upsertServer(db: SqlQueryable, record: GameServerRecord): Promise<void> {
  await db.query(
    `INSERT INTO jg_game_servers (server_id, game_id, status, updated_at, record)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id) DO UPDATE SET
       game_id = EXCLUDED.game_id,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at,
       record = EXCLUDED.record`,
    [record.serverId, record.gameId, record.status, record.updatedAt, JSON.stringify(record)],
  );
}

async function upsertProfile(db: SqlQueryable, record: PlayerProfileRecord): Promise<void> {
  await db.query(
    `INSERT INTO jg_player_profiles (game_id, user_id, updated_at, record)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (game_id, user_id) DO UPDATE SET
       updated_at = EXCLUDED.updated_at,
       record = EXCLUDED.record`,
    [record.gameId, record.userId, record.updatedAt, JSON.stringify(record)],
  );
}

async function upsertChunk(db: SqlQueryable, record: WorldChunkRecord): Promise<void> {
  await db.query(
    `INSERT INTO jg_world_chunks (server_id, chunk_key, updated_at, record)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, chunk_key) DO UPDATE SET
       updated_at = EXCLUDED.updated_at,
       record = EXCLUDED.record`,
    [record.serverId, record.chunkKey, record.updatedAt, JSON.stringify(record)],
  );
}

async function applyIncrements(
  db: SqlQueryable,
  gameId: string,
  entries: LeaderboardIncrement[],
  now: number,
): Promise<void> {
  for (const entry of entries) {
    await db.query(
      `INSERT INTO jg_leaderboard_rows (game_id, scope, stat, server_id, user_id, value, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (game_id, scope, stat, server_id, user_id) DO UPDATE SET
         value = jg_leaderboard_rows.value + EXCLUDED.value,
         updated_at = EXCLUDED.updated_at`,
      [gameId, entry.scope, entry.stat, entry.serverId ?? "", entry.userId, entry.by, now],
    );
  }
}

export function sqlPersistence(pool: SqlPool, now: () => number = Date.now): HostPersistence {
  const transact = async (work: (client: SqlQueryable) => Promise<void>): Promise<void> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await work(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return {
    async savePlan(plan: ServerPersistPlan) {
      await transact(async (client) => {
        if (plan.leaderboard.length > 0) {
          await applyIncrements(client, plan.server.gameId, plan.leaderboard, now());
        }
        for (const profile of plan.profiles) {
          await upsertProfile(client, profile);
        }
        for (const chunk of plan.chunks) {
          await upsertChunk(client, chunk);
        }
        if (plan.deletedChunks.length > 0) {
          await client.query(`DELETE FROM jg_world_chunks WHERE server_id = $1 AND chunk_key = ANY($2::text[])`, [
            plan.server.serverId,
            plan.deletedChunks,
          ]);
        }
        await upsertServer(client, plan.server);
      });
    },

    async resetScenario(reset) {
      await transact(async (client) => {
        if (reset.serverId !== null) {
          if (reset.wipeChunks) {
            await client.query(`DELETE FROM jg_world_chunks WHERE server_id = $1`, [reset.serverId]);
          }
          if (reset.wipeServerSession) {
            await client.query(`DELETE FROM jg_feed_buffers WHERE server_id = $1`, [reset.serverId]);
            await client.query(`DELETE FROM jg_leaderboard_rows WHERE game_id = $1 AND server_id = $2`, [
              reset.gameId,
              reset.serverId,
            ]);
            await client.query(`DELETE FROM jg_game_servers WHERE server_id = $1`, [reset.serverId]);
          }
        } else {
          const servers = await client.query(
            `SELECT server_id FROM jg_game_servers WHERE game_id = $1`,
            [reset.gameId],
          );
          for (const row of servers.rows) {
            const serverId = String(row.server_id);
            if (reset.wipeChunks) {
              await client.query(`DELETE FROM jg_world_chunks WHERE server_id = $1`, [serverId]);
            }
            if (reset.wipeServerSession) {
              await client.query(`DELETE FROM jg_feed_buffers WHERE server_id = $1`, [serverId]);
            }
          }
          if (reset.wipeServerSession) {
            await client.query(`DELETE FROM jg_leaderboard_rows WHERE game_id = $1`, [reset.gameId]);
            await client.query(`DELETE FROM jg_game_servers WHERE game_id = $1`, [reset.gameId]);
          }
        }

        if (reset.resetPlayers === "run" && reset.runFields.length > 0) {
          const profiles = await client.query(
            `SELECT record FROM jg_player_profiles WHERE game_id = $1`,
            [reset.gameId],
          );
          const at = now();
          for (const row of profiles.rows) {
            const profile = asJson<PlayerProfileRecord>(row.record);
            await upsertProfile(client, applyRunReset(profile, reset.runFields, at));
          }
        }
      });
    },

    async loadServer(serverId) {
      const result = await pool.query(`SELECT record FROM jg_game_servers WHERE server_id = $1`, [
        serverId,
      ]);
      const row = result.rows[0];
      return row === undefined ? null : asJson<GameServerRecord>(row.record);
    },

    async saveServer(record) {
      await upsertServer(pool, record);
    },

    async listServers(gameId) {
      const result = await pool.query(`SELECT record FROM jg_game_servers WHERE game_id = $1`, [
        gameId,
      ]);
      return result.rows.map((row) => asJson<GameServerRecord>(row.record));
    },

    async loadProfile({ userId, gameId }) {
      const result = await pool.query(
        `SELECT record FROM jg_player_profiles WHERE game_id = $1 AND user_id = $2`,
        [gameId, userId],
      );
      const row = result.rows[0];
      return row === undefined ? null : asJson<PlayerProfileRecord>(row.record);
    },

    async saveProfile(record) {
      await upsertProfile(pool, record);
    },

    async loadChunks(serverId) {
      const result = await pool.query(`SELECT record FROM jg_world_chunks WHERE server_id = $1`, [
        serverId,
      ]);
      return result.rows.map((row) => asJson<WorldChunkRecord>(row.record));
    },

    async saveChunks(serverId, chunks) {
      void serverId;
      await transact(async (client) => {
        for (const chunk of chunks) {
          await upsertChunk(client, chunk);
        }
      });
    },

    async deleteChunks(serverId, chunkKeys) {
      if (chunkKeys.length === 0) return;
      await pool.query(`DELETE FROM jg_world_chunks WHERE server_id = $1 AND chunk_key = ANY($2::text[])`, [
        serverId,
        chunkKeys,
      ]);
    },

    async loadFeed({ serverId, action }) {
      const result = await pool.query(
        `SELECT entries FROM jg_feed_buffers WHERE server_id = $1 AND action = $2`,
        [serverId, action],
      );
      const row = result.rows[0];
      return row === undefined ? [] : asJson<unknown[]>(row.entries);
    },

    async appendFeed({ serverId, action, entry }) {
      let entries: unknown[] = [];
      await transact(async (client) => {
        const result = await client.query(
          `SELECT entries FROM jg_feed_buffers WHERE server_id = $1 AND action = $2`,
          [serverId, action],
        );
        const row = result.rows[0];
        const existing = row === undefined ? [] : asJson<unknown[]>(row.entries);
        entries = trimFeedEntries([...existing, entry]);
        await client.query(
          `INSERT INTO jg_feed_buffers (server_id, action, updated_at, entries)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (server_id, action) DO UPDATE SET
             updated_at = EXCLUDED.updated_at,
             entries = EXCLUDED.entries`,
          [serverId, action, now(), JSON.stringify(entries)],
        );
      });
      return entries;
    },

    async applyLeaderboardIncrements(gameId, entries) {
      await transact(async (client) => {
        await applyIncrements(client, gameId, entries, now());
      });
    },

    async getLeaderboardTop(args) {
      const limit = clampLimit(args.limit, MAX_TOP_LIMIT, MAX_TOP_LIMIT);
      const params: unknown[] = [args.gameId, args.scope, args.stat];
      let filter = "";
      if (args.serverId !== undefined) {
        params.push(args.serverId);
        filter = ` AND server_id = $4`;
      }
      const result = await pool.query(
        `SELECT user_id, value FROM jg_leaderboard_rows
         WHERE game_id = $1 AND scope = $2 AND stat = $3${filter}
         ORDER BY value DESC
         LIMIT ${limit}`,
        params,
      );
      return result.rows.map((row) => ({ userId: String(row.user_id), value: Number(row.value) }));
    },

    async getLeaderboardProfile({ gameId, userId }) {
      const result = await pool.query(
        `SELECT stat, value FROM jg_leaderboard_rows
         WHERE game_id = $1 AND user_id = $2 AND scope = 'profile'`,
        [gameId, userId],
      );
      const profile: Record<string, number> = {};
      for (const row of result.rows) {
        profile[String(row.stat)] = Number(row.value);
      }
      return profile;
    },
  };
}
