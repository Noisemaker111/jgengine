import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { applyWorldDiff } from "./worldReplication";
import {
  createHostedWorldSession,
  memoryWorldStore,
  type HostedWorldSession,
  type SyncHostedWorldStore,
} from "./hostedWorldSession";
import type { GameContext, GameContextContent } from "./gameContext";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "mover" ? {} : null),
};

function session(opts: { store?: SyncHostedWorldStore; now?: () => number; saveIntervalMs?: number } = {}): HostedWorldSession {
  return createHostedWorldSession({
    ...(opts.store === undefined ? {} : { store: opts.store }),
    ...(opts.now === undefined ? {} : { now: opts.now }),
    ...(opts.saveIntervalMs === undefined ? {} : { saveIntervalMs: opts.saveIntervalMs }),
    definition: defineGameDefinition({
      name: "World",
      assets: createAssetCatalog(),
      multiplayer: "off",
      loop: {
        onInit(ctx: GameContext) {
          ctx.scene.entity.spawn("mover", { id: "mover", position: [0, 0, 0] });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.game.store.set("lastJoin", player!.userId);
          ctx.game.store.set("lastNew", player!.isNew);
        },
        onTick(ctx: GameContext, dt) {
          const mover = ctx.scene.entity.get("mover");
          if (mover) ctx.scene.entity.setPose("mover", { position: [mover.position[0] + dt, 0, 0] });
        },
      },
    }),
    content: CONTENT,
  });
}

describe("hosted world session", () => {
  test("malformed persisted receipts cannot silently reset deduplication", () => {
    const store = memoryWorldStore({ revision: 1, snapshot: { hostSession: { players: ["alice"], operations: [["alice", [{ id: 1 }]]] } } });
    expect(() => session({ store })).toThrow("Invalid hosted player/retry state");
    expect(store.load()?.snapshot["hostSession"]).toEqual({ players: ["alice"], operations: [["alice", [{ id: 1 }]]] });
  });

  test("authoritative saves retain detached private state and identity without exposing it to clients", () => {
    const store = memoryWorldStore();
    const origin = session({ store });
    origin.join("alice", true);
    const ctx = origin.runner().context();
    ctx.game.economy.grant("alice", "copper", 42);
    ctx.time.advance(7);
    origin.save();
    ctx.game.economy.grant("alice", "copper", 10);
    const saved = store.load()!;
    const resumed = session({ store });
    expect(resumed.runner().context().game.economy.balance("alice", "copper")).toBe(42);
    expect(resumed.runner().context().time.now()).toBe(7);
    expect(resumed.hasPlayer("alice")).toBe(true);
    expect(resumed.snapshotFor({ userId: "bob" })).not.toHaveProperty("economy");
    expect(resumed.snapshotFor({ userId: "bob" })).not.toHaveProperty("hostSession");
    saved.snapshot["economy"] = {};
    expect(session({ store }).runner().context().game.economy.balance("alice", "copper")).toBe(42);
    resumed.join("alice", true);
    expect(resumed.runner().context().game.store.get("lastNew")).toBe(false);
    expect(resumed.revision()).toBeGreaterThan(origin.revision());
  });

  test("private clock changes auto-save even when replication does not change", () => {
    const store = memoryWorldStore();
    const s = createHostedWorldSession({
      definition: defineGameDefinition({ name: "Clock", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {}, store,
    });
    s.tick(1);
    s.tick(1);
    expect(createHostedWorldSession({
      definition: defineGameDefinition({ name: "Clock", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {}, store,
    }).runner().context().time.now()).toBe(2);
  });

  test("restart sends a baseline to stale cursors because removal history is not persisted", () => {
    const store = memoryWorldStore();
    const first = session({ store });
    first.tick(1);
    const cursor = first.revision();
    first.runner().context().scene.entity.despawn("mover");
    first.tick(1);
    const resumed = session({ store });
    const sync = resumed.pull(cursor);
    expect(sync.kind).toBe("baseline");
    if (sync.kind !== "baseline") throw new Error("expected restart baseline");
    expect(sync.snapshot["entities"]).toEqual([]);
  });

  test("purchase receipts survive restart and partial failing commands roll back registered state", () => {
    const store = memoryWorldStore();
    const build = () => {
      const s = session({ store });
      s.runner().context().game.commands.define<{ amount: number }>("buy", {
        apply(ctx, input) {
          ctx.game.economy.charge("alice", "copper", input.amount);
          ctx.game.store.set("purchases", Number(ctx.game.store.get("purchases") ?? 0) + 1);
        },
      });
      s.runner().context().game.commands.define("broken", {
        apply(ctx) {
          ctx.game.economy.charge("alice", "copper", 10);
          ctx.game.store.set("partial", true);
          throw new Error("failed delivery");
        },
      });
      return s;
    };
    const first = build();
    first.runner().context().game.economy.grant("alice", "copper", 100);
    expect(first.command("alice", "buy", { amount: 10 }, "purchase-1").status).toBe("applied");
    first.save();
    const resumed = build();
    expect(resumed.command("alice", "buy", { amount: 10 }, "purchase-1").status).toBe("applied");
    expect(resumed.command("alice", "buy", { amount: 20 }, "purchase-1")).toEqual({ status: "rejected", reason: "operation-conflict" });
    expect(() => resumed.command("alice", "broken", {})).toThrow("failed delivery");
    expect(resumed.runner().context().game.economy.balance("alice", "copper")).toBe(90);
    expect(resumed.runner().context().game.store.get("purchases")).toBe(1);
    expect(resumed.runner().context().game.store.get("partial")).toBeUndefined();
  });

  test("async saves serialize detached captures, report failures and can retry", async () => {
    const records: number[] = [];
    let finish!: () => void;
    let writes = 0;
    const s = session({ store: {
      load: () => null,
      async save(record) {
        writes += 1;
        if (writes === 1) await new Promise<void>((resolve) => { finish = resolve; });
        if (writes === 3) throw new Error("disk unavailable");
        records.push((record.snapshot["store"] as [string, number][]).find(([key]) => key === "amount")![1]);
      },
    } });
    const ctx = s.runner().context();
    ctx.game.store.set("amount", 1);
    const first = s.save();
    ctx.game.store.set("amount", 2);
    const second = s.save();
    expect(writes).toBe(1);
    finish();
    await Promise.all([first, second]);
    expect(records).toEqual([1, 2]);
    await expect(s.save()).rejects.toThrow("disk unavailable");
    expect(s.persistenceError()).toBeInstanceOf(Error);
    await s.save();
    expect(s.persistenceError()).toBeNull();
  });

  test("sync serves a baseline for a fresh client and a diff for a returning one", () => {
    const s = session();
    s.join("alice", true);
    s.tick(1);

    const first = s.sync(null);
    expect(first.kind).toBe("baseline");
    if (first.kind !== "baseline") throw new Error("expected baseline");
    expect((first.snapshot["entities"] as { id: string }[]).some((e) => e.id === "mover")).toBe(true);

    const before = first.revision;
    s.tick(1);
    const second = s.sync(before);
    expect(second.kind).toBe("diff");
    if (second.kind !== "diff") throw new Error("expected diff");
    const rebuilt = applyWorldDiff(first.snapshot, second.diff);
    const mover = (rebuilt["entities"] as { id: string; position: number[] }[]).find((e) => e.id === "mover");
    expect(mover?.position[0]).toBeCloseTo(2);
  });

  test("a changing tick auto-persists the world to the store", () => {
    const store = memoryWorldStore();
    const s = session({ store });
    s.join("alice", true);
    s.tick(1);

    const saved = store.load();
    expect(saved?.revision).toBe(s.revision());
    expect(saved?.snapshot["store"]).toContainEqual(["lastJoin", "alice"]);
  });

  test("a new session restores the persisted world from the shared store", () => {
    const store = memoryWorldStore();
    const origin = session({ store });
    origin.join("alice", true);
    origin.tick(3);

    const resumed = session({ store });
    const mover = resumed.runner().context().scene.entity.get("mover");
    expect(mover?.position[0]).toBeCloseTo(3);
    expect(resumed.runner().context().game.store.get("lastJoin")).toBe("alice");
  });

  test("saveIntervalMs throttles auto-saves against the clock", () => {
    let clock = 0;
    const store = memoryWorldStore();
    const s = session({ store, now: () => clock, saveIntervalMs: 1000 });
    s.join("alice", true);

    clock = 100;
    s.tick(1);
    expect(store.load()).toBeNull();

    clock = 1200;
    s.tick(1);
    expect(store.load()?.revision).toBe(s.revision());
  });

  test("omitting now still gates saveIntervalMs against a real clock instead of freezing at 0", () => {
    const originalNow = Date.now;
    let wallClock = 1_000_000;
    Date.now = () => wallClock;
    try {
      const store = memoryWorldStore();
      const s = session({ store, saveIntervalMs: 1000 });
      s.join("alice", true);
      s.tick(1);
      expect(store.load()).toBeNull();

      wallClock += 1200;
      s.tick(1);
      expect(store.load()?.revision).toBe(s.revision());
    } finally {
      Date.now = originalNow;
    }
  });
});
