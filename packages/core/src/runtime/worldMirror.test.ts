import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent } from "./gameContext";
import { createHostedWorldSession } from "./hostedWorldSession";
import { createWorldMirror, pullWorld } from "./worldMirror";
import type { WorldDiff } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => {
    if (catalogId === "hero") return { stats: { health: { max: 10 } } };
    if (catalogId === "mover") return {};
    return null;
  },
};

function definition() {
  return defineGameDefinition({
    name: "Mirrored",
    assets: createAssetCatalog(),
    multiplayer: "off",
    loop: {
      onInit(ctx: GameContext) {
        ctx.scene.entity.spawn("mover", { id: "mover", position: [0, 0, 0] });
        ctx.game.commands.define<{ text: string }>("say", {
          apply(state, input) {
            state.game.store.set("motd", input.text);
          },
        });
      },
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
      },
      onTick(ctx: GameContext, dt) {
        const mover = ctx.scene.entity.get("mover");
        if (mover) ctx.scene.entity.setPose("mover", { position: [mover.position[0] + dt, 0, 0] });
      },
      onPlayerLeave(ctx: GameContext, player) {
        ctx.scene.entity.despawn(player.userId);
      },
    },
  });
}

function clientContext(): GameContext {
  return createGameContext({
    definition: definition(),
    content: CONTENT,
    player: { userId: "viewer", isNew: true },
  });
}

describe("world mirror (end-to-end host → client replication, no backend)", () => {
  test("a client ctx mirrors the host world across baseline, diffs, and a despawn", () => {
    const host = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const client = clientContext();
    const mirror = createWorldMirror(client);

    host.join("alice", true);
    host.command("host", "say", { text: "welcome" });
    host.tick(1);

    // First pull → baseline: the client sees the whole world it had no part in building.
    pullWorld(host, mirror);
    expect(client.scene.entity.get("alice")).not.toBeNull();
    expect(client.scene.entity.get("mover")?.position[0]).toBeCloseTo(1);
    expect(client.scene.entity.stats.get("alice", "health")).toEqual({ current: 10, max: 10, min: 0 });
    expect(client.game.store.get("motd")).toBe("welcome");

    // Host advances; a returning client pulls only a diff.
    host.tick(1);
    host.command("host", "say", { text: "go" });
    host.tick(0);
    pullWorld(host, mirror);
    expect(client.scene.entity.get("mover")?.position[0]).toBeCloseTo(2);
    expect(client.game.store.get("motd")).toBe("go");

    // A leave despawns the player host-side; the removal replicates to the client.
    host.leave("alice");
    host.tick(0);
    pullWorld(host, mirror);
    expect(client.scene.entity.get("alice")).toBeNull();
    expect(mirror.revision()).toBe(host.revision());
  });

  test("a fresh mirror always starts from a baseline, then advances by revision", () => {
    const host = createHostedWorldSession({ definition: definition(), content: CONTENT });
    host.join("alice", true);
    host.tick(1);

    const mirror = createWorldMirror(clientContext());
    expect(mirror.revision()).toBe(0);
    pullWorld(host, mirror);
    expect(mirror.revision()).toBe(host.revision());
    expect(mirror.revision()).toBeGreaterThan(0);
  });
});

function stubDiff(overrides: Partial<WorldDiff>): WorldDiff {
  return {
    revision: 1,
    entities: [],
    removedEntities: [],
    stats: {},
    removedStats: [],
    store: [],
    removedStore: [],
    modules: {},
    removedModules: [],
    ...overrides,
  };
}

describe("world mirror (revision continuity)", () => {
  test("diffs apply in order and advance the mirror's revision", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { store: [["phase", "lobby"]] });

    mirror.applyDiff(stubDiff({ revision: 2, baseRevision: 1, store: [["phase", "combat"]] }));
    expect(mirror.revision()).toBe(2);
    expect(mirror.needsResync()).toBe(false);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "combat"]]);

    mirror.applyDiff(stubDiff({ revision: 3, baseRevision: 2, store: [["phase", "combat"], ["turn", 1]] }));
    expect(mirror.revision()).toBe(3);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "combat"], ["turn", 1]]);
  });

  test("a stale or duplicate diff is ignored, never regressing the mirror", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { store: [["phase", "lobby"]] });
    mirror.applyDiff(stubDiff({ revision: 2, baseRevision: 1, store: [["phase", "combat"]] }));

    const hydrateCallsBefore = hydrated.length;
    mirror.applyDiff(stubDiff({ revision: 2, baseRevision: 1, store: [["phase", "combat"]] }));
    mirror.applyDiff(stubDiff({ revision: 1, baseRevision: 0, store: [["phase", "lobby"]] }));

    expect(mirror.revision()).toBe(2);
    expect(hydrated.length).toBe(hydrateCallsBefore);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "combat"]]);
  });

  test("a gap (skipped revision) is not applied and flips needsResync until a fresh baseline", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { store: [["phase", "lobby"]] });
    expect(mirror.needsResync()).toBe(false);

    // revision 2 never arrives; revision 3 assumes a baseRevision the mirror never reached.
    mirror.applyDiff(stubDiff({ revision: 3, baseRevision: 2, store: [["phase", "endgame"]] }));

    expect(mirror.needsResync()).toBe(true);
    expect(mirror.revision()).toBe(1);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "lobby"]]);

    mirror.applyBaseline(3, { store: [["phase", "endgame"]] });
    expect(mirror.needsResync()).toBe(false);
    expect(mirror.revision()).toBe(3);
  });

  test("a diff without baseRevision (legacy producer) always applies", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { store: [] });

    mirror.applyDiff(stubDiff({ revision: 5, store: [["phase", "combat"]] }));

    expect(mirror.needsResync()).toBe(false);
    expect(mirror.revision()).toBe(5);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "combat"]]);
  });

  test("a diff that arrives out of order is dropped for good; only a diff matching the current revision recovers the mirror", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { store: [["phase", "lobby"]] });

    // Network reorders: revision 3 (built on 2) arrives before revision 2.
    mirror.applyDiff(stubDiff({ revision: 3, baseRevision: 2, store: [["phase", "endgame"]] }));
    expect(mirror.needsResync()).toBe(true);
    expect(mirror.revision()).toBe(1);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "lobby"]]);

    // The missing revision 2 finally arrives, matching the mirror's current revision — it recovers.
    mirror.applyDiff(stubDiff({ revision: 2, baseRevision: 1, store: [["phase", "combat"]] }));
    expect(mirror.needsResync()).toBe(false);
    expect(mirror.revision()).toBe(2);
    expect(hydrated.at(-1)?.["store"]).toEqual([["phase", "combat"]]);

    // The reordered revision-3 diff is gone for good: its "endgame" payload never lands.
    expect(hydrated.some((snapshot) => JSON.stringify(snapshot["store"]).includes("endgame"))).toBe(false);

    // A diff built on the dropped revision (baseRevision 3) re-triggers resync until a fresh baseline.
    mirror.applyDiff(stubDiff({ revision: 4, baseRevision: 3, store: [["phase", "overtime"]] }));
    expect(mirror.needsResync()).toBe(true);
    expect(mirror.revision()).toBe(2);
  });

  test("a removed module is dropped client-side on apply", () => {
    const hydrated: WorldSnapshot[] = [];
    const mirror = createWorldMirror({ hydrate: (s) => hydrated.push(s) });
    mirror.applyBaseline(1, { feed: { chat: ["hi"] } });

    mirror.applyDiff(stubDiff({ revision: 2, baseRevision: 1, removedModules: ["feed"] }));

    expect(hydrated.at(-1)?.["feed"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(hydrated.at(-1), "feed")).toBe(false);
  });
});
