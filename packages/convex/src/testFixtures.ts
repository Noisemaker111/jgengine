import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";

/** @internal */
export type Doc = Record<string, unknown> & { _id: string; _creationTime: number };
type Constraint = { field: string; op: "eq" | "gt" | "gte" | "lt" | "lte"; value: unknown };

function rank(a: unknown): [number, number | string] {
  if (a === undefined || a === null) return [0, 0];
  if (typeof a === "number") return [1, a];
  return [2, String(a)];
}

function cmp(a: unknown, b: unknown): number {
  const [ka, va] = rank(a);
  const [kb, vb] = rank(b);
  if (ka !== kb) return ka - kb;
  if (va < vb) return -1;
  if (va > vb) return 1;
  return 0;
}

function matches(doc: Doc, constraints: Constraint[]): boolean {
  for (const c of constraints) {
    const d = cmp(doc[c.field], c.value);
    if (c.op === "eq" && d !== 0) return false;
    if (c.op === "gt" && !(d > 0)) return false;
    if (c.op === "gte" && !(d >= 0)) return false;
    if (c.op === "lt" && !(d < 0)) return false;
    if (c.op === "lte" && !(d <= 0)) return false;
  }
  return true;
}

function rangeBuilder(constraints: Constraint[]) {
  const push = (op: Constraint["op"]) => (field: string, value: unknown) => {
    constraints.push({ field, op, value });
    return api;
  };
  const api = {
    eq: push("eq"),
    gt: push("gt"),
    gte: push("gte"),
    lt: push("lt"),
    lte: push("lte"),
  };
  return api;
}

/** In-memory stand-in for a Convex `ctx.db`, recording every doc id a handler actually read.
 * @internal
 */
export function makeDb() {
  const tables = new Map<string, Doc[]>();
  const byId = new Map<string, { table: string; doc: Doc }>();
  const reads = new Set<string>();
  let counter = 0;

  const rowsFor = (table: string): Doc[] => tables.get(table) ?? [];

  function builder(table: string, constraints: Constraint[], desc: boolean) {
    const resolve = (): Doc[] => {
      const out = rowsFor(table).filter((doc) => matches(doc, constraints));
      return desc ? out.slice().reverse() : out;
    };
    const record = (docs: Doc[]) => {
      for (const doc of docs) reads.add(doc._id);
      return docs;
    };
    return {
      withIndex: (_name: string, fn: (q: ReturnType<typeof rangeBuilder>) => unknown) => {
        const next: Constraint[] = [];
        fn(rangeBuilder(next));
        return builder(table, [...constraints, ...next], desc);
      },
      order: (dir: "asc" | "desc") => builder(table, constraints, dir === "desc"),
      filter: () => builder(table, constraints, desc),
      collect: async () => record(resolve()),
      take: async (n: number) => record(resolve().slice(0, n)),
      first: async () => record(resolve().slice(0, 1))[0] ?? null,
      unique: async () => {
        const found = resolve();
        if (found.length > 1) throw new Error(`unique: ${found.length} rows in ${table}`);
        return record(found)[0] ?? null;
      },
    };
  }

  const db = {
    query: (table: string) => builder(table, [], false),
    get: async (table: string, id: string) => {
      const entry = byId.get(id);
      if (!entry || entry.table !== table) return null;
      reads.add(id);
      return entry.doc;
    },
    insert: async (table: string, doc: Record<string, unknown>) => {
      const id = `${table}:${counter++}`;
      const full: Doc = { ...doc, _id: id, _creationTime: Date.now() };
      if (!tables.has(table)) tables.set(table, []);
      rowsFor(table).push(full);
      byId.set(id, { table, doc: full });
      return id;
    },
    patch: async (id: string, partial: Record<string, unknown>) => {
      const entry = byId.get(id);
      if (entry) Object.assign(entry.doc, partial);
    },
    delete: async (id: string) => {
      const entry = byId.get(id);
      if (!entry) return;
      const arr = rowsFor(entry.table);
      const idx = arr.indexOf(entry.doc);
      if (idx >= 0) arr.splice(idx, 1);
      byId.delete(id);
    },
  };

  const seed = (table: string, doc: Doc) => {
    if (!tables.has(table)) tables.set(table, []);
    rowsFor(table).push(doc);
    byId.set(doc._id, { table, doc });
    return doc;
  };

  const rows = (table: string): Doc[] => rowsFor(table);

  return { db, reads, seed, rows };
}

/** A `jgGameServers` row with sane defaults for handler tests.
 * @internal
 */
export function serverDoc(overrides: Partial<Doc> & { _id: string }): Doc {
  const now = Date.now();
  return {
    _creationTime: now,
    gameId: "demo",
    status: "running",
    mode: undefined,
    modeConfig: undefined,
    visibility: "public",
    joinCode: undefined,
    memberUserIds: ["alice"],
    slotsPerServer: 16,
    save: "none",
    serverState: createEmptyServerRow(),
    sessionPlayers: {},
    revision: 0,
    tickAnchorMs: now - 5_000,
    lastSavedAt: undefined,
    dirtyAt: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** @internal */
export type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;

/** Unwrap the raw handler of a registered Convex function so tests can call it with a fake ctx.
 * @internal
 */
export function handlerOf(fn: unknown): Handler {
  return (fn as { _handler: Handler })._handler;
}
