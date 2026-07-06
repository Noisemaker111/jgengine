import type { HostPersistence } from "@jgengine/core/runtime/hostPersistence";
import { ensureSchema, sqlPersistence, type SqlPool } from "@jgengine/sql/sqlPersistence";

let instance: Promise<HostPersistence> | null = null;

export function getPersistence(): Promise<HostPersistence> {
  instance ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url === undefined) {
      throw new Error("DATABASE_URL is required — the reads hit the shared Postgres from the ws host");
    }
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url }) as unknown as SqlPool;
    await ensureSchema(pool);
    return sqlPersistence(pool);
  })();
  return instance;
}

export function gameIdFrom(url: string): string {
  return new URL(url).searchParams.get("gameId") ?? "";
}
