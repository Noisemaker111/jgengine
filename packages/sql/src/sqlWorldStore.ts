import type { HostedWorldRecord, HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import type { SqlQueryable } from "./sqlPersistence";

/** Create an asynchronous hosted-world store backed by one JSONB row.
 * @capability hosted-world-persistence Persist hosted authoritative world snapshots in SQL.
 */
export function sqlWorldStore(pool: SqlQueryable, worldId: string): HostedWorldStore {
  return {
    async load() {
      const result = await pool.query(`SELECT record FROM jg_hosted_worlds WHERE world_id = $1`, [worldId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return (typeof row.record === "string" ? JSON.parse(row.record) : row.record) as HostedWorldRecord;
    },
    async save(record) {
      await pool.query(
        `INSERT INTO jg_hosted_worlds (world_id, record) VALUES ($1, $2)
         ON CONFLICT (world_id) DO UPDATE SET record = EXCLUDED.record`,
        [worldId, JSON.stringify(record)],
      );
    },
  };
}
