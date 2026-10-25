import { expect, test } from "bun:test";
const previousSiteUrl = process.env.CONVEX_SITE_URL;
process.env.CONVEX_SITE_URL ??= "http://127.0.0.1:3211";
const { migrateLegacyReports } = await import("../convex/clientErrors");
const { migrateLegacyMessages } = await import("../convex/multiplayer/worldChat");
if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;

type Row = Record<string, any> & { _id: string };
function fixture(seed: Record<string, Row[]>) {
  const tables = new Map(Object.entries(seed));
  let serial = 0;
  const rows = (table: string) => tables.get(table) ?? [];
  const ctx = { db: {
    query(table: string) {
      const constraints: [string, unknown][] = [];
      const selected = () => rows(table).filter(row => constraints.every(([key, value]) => row[key] === value));
      const range = { eq(key: string, value: unknown) { constraints.push([key, value]); return range; } };
      const query = {
        withIndex(_name: string, callback?: (q: typeof range) => unknown) { callback?.(range); return query; },
        async first() { return selected()[0] ?? null; },
        async paginate(options: { numItems: number; maximumBytesRead: number }) {
          expect(options.numItems).toBe(128);
          expect(options.maximumBytesRead).toBe(2 * 1024 * 1024);
          const source = selected(), page = source.slice(0, options.numItems);
          return { page, isDone: page.length === source.length, continueCursor: "unused" };
        },
      };
      return query;
    },
    async get(id: string) { return [...tables.values()].flat().find(row => row._id === id) ?? null; },
    async insert(table: string, data: Record<string, unknown>) { const id = `${table}:${serial++}`; tables.set(table, [...rows(table), { ...data, _id: id }]); return id; },
    async delete(id: string) { for (const [name, source] of tables) tables.set(name, source.filter(row => row._id !== id)); },
  } };
  return { ctx, rows };
}
function handler(fn: unknown) { return (fn as { _handler: (ctx: unknown, args: {}) => Promise<unknown> })._handler; }

test("legacy error migration is bounded, keeps details and handles missing identities", async () => {
  const source = Array.from({ length: 129 }, (_, i) => ({ _id: `old:${i}`, _creationTime: i, message: `message${i}`, stack: `stack${i}`, createdAt: i, ...(i === 0 ? { userId: "user:known" } : i === 1 ? { userId: "user:gone" } : {}) }));
  const f = fixture({ clientErrorReports: source, users: [{ _id: "user:known", externalId: "alice" }] });
  const run = handler(migrateLegacyReports);
  expect(await run(f.ctx, {})).toEqual({ migrated: 128, remaining: true });
  expect(f.rows("clientErrorReports")).toHaveLength(1);
  expect(f.rows("jgClientErrors")[0]).toMatchObject({ userId: "alice", message: "message0", createdAt: 0, details: { stack: "stack0", legacyUserId: "user:known", legacyId: "old:0" } });
  expect(f.rows("jgClientErrors")[1]?.userId).toBe("legacy:missing-user:user:gone");
  expect(f.rows("jgClientErrors")[2]?.userId).toBe("legacy:anonymous");
  expect(await run(f.ctx, {})).toEqual({ migrated: 1, remaining: false });
  expect(await run(f.ctx, {})).toEqual({ migrated: 0, remaining: false });
  expect(f.rows("jgClientErrors")).toHaveLength(129);
});
test("legacy chat migration preserves event timestamps, author and body without duplicate retries", async () => {
  const f = fixture({ jgGameServers: [{ _id: "world", gameId: "llmville", status: "running" }], worldChatMessages: [{ _id: "legacy-chat", authorExternalId: "alice", authorName: "Alice", gameId: "lab", text: "hello", createdAt: 123 }] });
  const run = handler(migrateLegacyMessages);
  expect(await run(f.ctx, {})).toEqual({ migrated: 1, remaining: false });
  expect(f.rows("jgChatMessages")[0]).toMatchObject({ serverId: "world", channelId: "global", userId: "alice", authorName: "Alice", body: "hello", at: 123 });
  expect(f.rows("worldChatMessages")).toEqual([]);
  expect(await run(f.ctx, {})).toEqual({ migrated: 0, remaining: false });
  expect(f.rows("jgChatMessages")).toHaveLength(1);
});
