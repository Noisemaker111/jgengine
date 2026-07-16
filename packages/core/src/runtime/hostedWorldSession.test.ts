import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { applyWorldDiff } from "./worldReplication";
import {
  createHostedWorldSession,
  memoryWorldStore,
  type HostedWorldSession,
  type HostedWorldStore,
} from "./hostedWorldSession";
import type { GameContext, GameContextContent } from "./gameContext";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "mover" ? {} : null),
};

function session(opts: { store?: HostedWorldStore; now?: () => number; saveIntervalMs?: number } = {}): HostedWorldSession {
  return createHostedWorldSession({
    ...(opts.store === undefined ? {} : { store: opts.store }),
    ...(opts.now === undefined ? {} : { now: opts.now }),
    ...(opts.saveIntervalMs === undefined ? {} : { saveIntervalMs: opts.saveIntervalMs }),
    definition: defineGame({
      name: "World",
      assets: createAssetCatalog(),
      multiplayer: "off",
      loop: {
        onInit(ctx: GameContext) {
          ctx.scene.entity.spawn("mover", { id: "mover", position: [0, 0, 0] });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.game.store.set("lastJoin", player!.userId);
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
