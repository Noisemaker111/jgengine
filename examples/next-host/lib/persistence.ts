import type { HostPersistence } from "@jgengine/core/runtime/hostPersistence";
import { ensureSchema, sqlPersistence, type SqlPool } from "@jgengine/sql/sqlPersistence";

const globalForPersistence = globalThis as typeof globalThis & {
  __jgPersistence?: Promise<HostPersistence>;
};

async function initPersistence(): Promise<HostPersistence> {
  const url = process.env.DATABASE_URL;
  if (url === undefined) {
    throw new Error("DATABASE_URL is required — the reads hit the shared Postgres from the ws host");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url }) as unknown as SqlPool;
  await ensureSchema(pool);
  return sqlPersistence(pool);
}

export function createPersistence(): Promise<HostPersistence> {
  globalForPersistence.__jgPersistence ??= initPersistence();
  return globalForPersistence.__jgPersistence;
}
