import { expect, test } from "bun:test";
import { newDb } from "pg-mem";
import { ensureSchema, type SqlPool } from "./sqlPersistence";
import { sqlWorldStore } from "./sqlWorldStore";

test("hosted world records round-trip", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as SqlPool;
  await ensureSchema(pool);
  const store = sqlWorldStore(pool, "world-1");
  expect(await store.load()).toBeNull();
  const record = { snapshot: { entities: [{ id: "hero" }] }, revision: 4 };
  await store.save(record);
  expect(await store.load()).toEqual(record);
});
