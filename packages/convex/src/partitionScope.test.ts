import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";
import { memoryWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createGameServerFunctions } from "./server";
import {
  createHostedGameServerFunctions,
  invokeHostedWorld,
  type HostedGameConfig,
} from "./hostedServer";

type Doc = Record<string, unknown> & { _id: string; _creationTime: number };
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

function makeDb() {
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

  return { db, reads, seed };
}

function serverDoc(overrides: Partial<Doc> & { _id: string }): Doc {
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

function runtime() {
  return createGameRuntime({ gameId: "demo", save: "none", commands: {} });
}

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
function handlerOf(fn: unknown): Handler {
  return (fn as { _handler: Handler })._handler;
}

describe("tickActiveServers scopes to the running partition", () => {
  test("ticks only running servers and never reads open/closed rows", async () => {
    const { db, reads, seed } = makeDb();
    const running = seed("jgGameServers", serverDoc({ _id: "srv:running", status: "running" }));
    const open = seed("jgGameServers", serverDoc({ _id: "srv:open", status: "open" }));
    const closed = seed("jgGameServers", serverDoc({ _id: "srv:closed", status: "closed" }));

    const fns = createGameServerFunctions({ runtimes: [runtime()], auth: "anonymous" });
    const result = (await handlerOf(fns.tickActiveServers)({ db }, {})) as {
      ticked: number;
      saved: number;
    };

    expect(result.ticked).toBe(1);
    expect(result.saved).toBe(0);
    expect(reads.has(running._id)).toBe(true);
    expect(reads.has(open._id)).toBe(false);
    expect(reads.has(closed._id)).toBe(false);
    expect((running.tickAnchorMs as number) > (open.tickAnchorMs as number)).toBe(true);
  });
});

describe("flushDirtyServers scopes to the dirty partition", () => {
  test("flushes only dirty servers and never reads clean rows", async () => {
    const { db, reads, seed } = makeDb();
    const dirty = seed(
      "jgGameServers",
      serverDoc({ _id: "srv:dirty", dirtyAt: Date.now(), revision: 3 }),
    );
    const clean = seed("jgGameServers", serverDoc({ _id: "srv:clean", dirtyAt: undefined }));

    const fns = createGameServerFunctions({ runtimes: [runtime()], auth: "anonymous" });
    const result = (await handlerOf(fns.flushDirtyServers)({ db }, {})) as { saved: number };

    expect(result.saved).toBe(1);
    expect(reads.has(dirty._id)).toBe(true);
    expect(reads.has(clean._id)).toBe(false);
  });
});

const HOSTED_CONTENT = {
  entityById: (catalogId: string) =>
    catalogId === "hero" ? { stats: { health: { max: 10 } } } : null,
};

function hostedGame(): HostedGameConfig {
  return {
    definition: defineGameDefinition({
      name: "Hosted Scope",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      loop: {
        onNewPlayer(ctx: GameContext, player) {
          ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
        },
        onTick(ctx: GameContext, dt) {
          for (const player of ctx.game.players?.list() ?? []) {
            const hero = ctx.scene.entity.get(player.userId);
            if (!hero) continue;
            ctx.scene.entity.setPose(player.userId, { position: [hero.position[0] + dt, 0, 0] });
          }
        },
      },
    }),
    content: HOSTED_CONTENT,
  };
}

function hostedWorldDoc(overrides: Partial<Doc> & { _id: string }): Doc {
  const g = hostedGame();
  const store = memoryWorldStore();
  invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
  const rec = store.load();
  const now = Date.now();
  return {
    _creationTime: now,
    gameId: "demo",
    serverId: overrides._id,
    snapshot: rec?.snapshot ?? {},
    revision: rec?.revision ?? 1,
    memberUserIds: ["alice"],
    inputs: {},
    tickAnchorMs: now - 5_000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("tickHostedWorlds scopes to the due partition", () => {
  test("ticks only due worlds and never reads recently-ticked rows", async () => {
    const { db, reads, seed } = makeDb();
    const due = seed(
      "jgHostedWorlds",
      hostedWorldDoc({ _id: "srv:due", tickAnchorMs: Date.now() - 5_000 }),
    );
    const fresh = seed(
      "jgHostedWorlds",
      hostedWorldDoc({ _id: "srv:fresh", tickAnchorMs: Date.now() - 100 }),
    );

    const fns = createHostedGameServerFunctions({
      games: { demo: hostedGame() },
      auth: "anonymous",
      tickMs: 1_000,
    });
    const result = (await handlerOf(fns.tickHostedWorlds)({ db }, {})) as {
      ticked: number;
      saved: number;
    };

    expect(result.ticked).toBe(1);
    expect(reads.has(due._id)).toBe(true);
    expect(reads.has(fresh._id)).toBe(false);
    expect((due.revision as number) > 1).toBe(true);
    expect(fresh.revision).toBe(1);
  });
});
