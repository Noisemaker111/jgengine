import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent } from "./gameContext";
import { createHostedWorldSession } from "./hostedWorldSession";
import { createWorldClientLink, createWorldHost, type WorldClientLink } from "./worldChannel";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function definition() {
  return defineGame({
    name: "Shared",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    loop: {
      onInit(ctx: GameContext) {
        ctx.game.commands.define<Record<string, never>>("wave", {
          apply(state) {
            state.game.store.set(`waved:${state.game.commands.actor() ?? "none"}`, true);
          },
        });
      },
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
      },
      onTick(ctx: GameContext, dt) {
        for (const player of ctx.game.players?.list() ?? []) {
          const hero = ctx.scene.entity.get(player.userId);
          if (hero) ctx.scene.entity.setPose(player.userId, { position: [hero.position[0] + dt, 0, 0] });
        }
      },
    },
  });
}

function clientContext(userId: string): GameContext {
  return createGameContext({ definition: definition(), content: CONTENT, player: { userId, isNew: true } });
}

describe("world channel (multi-client host↔client over an in-process loopback)", () => {
  test("two clients share one authoritative world; each sees everyone, ticks and commands replicate", () => {
    const host = createWorldHost(createHostedWorldSession({ definition: definition(), content: CONTENT }));

    const ctxA = clientContext("alice");
    const ctxB = clientContext("bob");
    let linkA!: WorldClientLink;
    let linkB!: WorldClientLink;
    const connA = host.connect("alice", (frame) => linkA.receive(frame));
    const connB = host.connect("bob", (frame) => linkB.receive(frame));
    linkA = createWorldClientLink(ctxA, (frame) => connA.receive(frame));
    linkB = createWorldClientLink(ctxB, (frame) => connB.receive(frame));

    // Both join the shared world.
    linkA.join(true);
    linkB.join(true);
    host.session().tick(1);
    host.broadcast();

    // Alice's client mirrors the whole world — her hero AND bob's, both advanced by the host tick.
    expect(ctxA.scene.entity.get("alice")?.position[0]).toBeCloseTo(1);
    expect(ctxA.scene.entity.get("bob")).not.toBeNull();
    expect(ctxB.scene.entity.get("alice")).not.toBeNull();
    expect(ctxA.scene.entity.stats.get("bob", "health")).toEqual({ current: 10, max: 10, min: 0 });

    // Alice acts; her command is attributed to her host-side and the result replicates to bob's client.
    linkA.command("wave", {});
    host.session().tick(0);
    host.broadcast();
    expect(ctxB.game.store.get("waved:alice")).toBe(true);
    expect(ctxA.game.store.get("waved:bob")).toBeUndefined();
  });

  test("a late joiner gets a full baseline, not an empty diff", () => {
    const host = createWorldHost(createHostedWorldSession({ definition: definition(), content: CONTENT }));
    // Alice plays for a while first.
    const connA = host.connect("alice", () => {});
    connA.receive({ t: "join", isNew: true });
    host.session().tick(1);
    host.broadcast();

    // Bob connects late.
    const ctxB = clientContext("bob");
    let linkB!: WorldClientLink;
    const connB = host.connect("bob", (frame) => linkB.receive(frame));
    linkB = createWorldClientLink(ctxB, (frame) => connB.receive(frame));
    linkB.join(true);
    host.session().tick(0);
    host.broadcast();

    // Bob's first frame is a baseline carrying alice, already present before he joined.
    expect(ctxB.scene.entity.get("alice")).not.toBeNull();
    expect(ctxB.scene.entity.get("bob")).not.toBeNull();
    expect(linkB.revision()).toBe(host.session().revision());
  });

  test("a client's input frame routes upstream and lands on the host's ctx.game.players", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);
    const ctxA = clientContext("alice");
    let linkA!: WorldClientLink;
    const connA = host.connect("alice", (frame) => linkA.receive(frame));
    linkA = createWorldClientLink(ctxA, (frame) => connA.receive(frame));

    linkA.join(true);
    const frame = { held: ["moveForward", "sprint"], pointer: { x: 0.5, y: -0.25, active: true } };
    linkA.input(frame);

    expect(session.runner().context().game.players?.input("alice")).toEqual(frame);
    expect(session.runner().heldInput("alice")).toEqual(frame);
  });

  test("two connections for one user: closing one keeps the player joined while the other is still connected", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);

    const tabA = host.connect("alice", () => {});
    const tabB = host.connect("alice", () => {});
    tabA.receive({ t: "join", isNew: true });
    tabB.receive({ t: "join", isNew: true });
    host.session().tick(1);

    expect(host.session().members()).toEqual(["alice"]);

    tabA.close();
    expect(host.session().members()).toEqual(["alice"]);
    expect(host.session().runner().context().game.players?.ids()).toEqual(["alice"]);

    tabB.close();
    expect(host.session().members()).toEqual([]);
    expect(host.session().runner().context().game.players?.ids()).toEqual([]);
  });

  test("an explicit leave frame from one of two connections also only leaves once the last one is gone", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);

    const tabA = host.connect("alice", () => {});
    const tabB = host.connect("alice", () => {});
    tabA.receive({ t: "join", isNew: true });
    tabB.receive({ t: "join", isNew: true });

    tabA.receive({ t: "leave" });
    expect(host.session().members()).toEqual(["alice"]);

    tabB.receive({ t: "leave" });
    expect(host.session().members()).toEqual([]);
  });

  test("re-joining an already-connected user over a second connection does not re-fire onNewPlayer", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);

    const tabA = host.connect("alice", () => {});
    tabA.receive({ t: "join", isNew: true });
    host.session().tick(1);
    const revisionAfterFirstJoin = host.session().revision();

    const tabB = host.connect("alice", () => {});
    tabB.receive({ t: "join", isNew: false });
    host.session().tick(1);

    expect(host.session().members()).toEqual(["alice"]);
    expect(host.session().revision()).toBeGreaterThan(revisionAfterFirstJoin);
  });

  test("closing a connection releases it: further pushes (broadcast or direct) are no-ops", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);
    const frames: unknown[] = [];
    const conn = host.connect("alice", (frame) => frames.push(frame));
    conn.receive({ t: "join", isNew: true });
    host.session().tick(1);
    host.broadcast();
    expect(frames.length).toBeGreaterThan(0);

    conn.close();
    const before = frames.length;
    host.session().tick(1);
    host.broadcast();
    conn.push();
    expect(frames.length).toBe(before);
  });

  test("closing the same connection twice only leaves once", () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldHost(session);
    const conn = host.connect("alice", () => {});
    conn.receive({ t: "join", isNew: true });
    expect(host.session().members()).toEqual(["alice"]);

    conn.close();
    conn.close();
    expect(host.session().members()).toEqual([]);
  });
});

function privateDefinition() {
  return defineGame({
    name: "PrivateShared",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    inventories: { backpack: { slots: 9 } },
    replication: { privatePerUser: true },
    loop: {
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
        ctx.player.inventoryFor(player!.userId).put("backpack", `secret-${player!.userId}`, 1);
      },
    },
  });
}

describe("per-viewer projection over the host↔client channel", () => {
  test("a viewer's client never receives another player's private inventory, while shared entities still replicate", () => {
    const host = createWorldHost(createHostedWorldSession({ definition: privateDefinition(), content: CONTENT }));

    const ctxA = createGameContext({ definition: privateDefinition(), content: CONTENT, player: { userId: "alice", isNew: true } });
    const ctxB = createGameContext({ definition: privateDefinition(), content: CONTENT, player: { userId: "bob", isNew: true } });
    let linkA!: WorldClientLink;
    let linkB!: WorldClientLink;
    const connA = host.connect("alice", (frame) => linkA.receive(frame));
    const connB = host.connect("bob", (frame) => linkB.receive(frame));
    linkA = createWorldClientLink(ctxA, (frame) => connA.receive(frame));
    linkB = createWorldClientLink(ctxB, (frame) => connB.receive(frame));

    linkA.join(true);
    linkB.join(true);
    host.session().tick(1);
    host.broadcast();

    const hostCtx = host.session().runner().context();
    expect(hostCtx.player.inventoryFor("alice").count("backpack", "secret-alice")).toBe(1);
    expect(hostCtx.player.inventoryFor("bob").count("backpack", "secret-bob")).toBe(1);

    expect(ctxA.scene.entity.get("alice")).not.toBeNull();
    expect(ctxA.scene.entity.get("bob")).not.toBeNull();
    expect(ctxA.player.inventoryFor("alice").count("backpack", "secret-alice")).toBe(1);
    expect(ctxA.player.inventoryFor("bob").count("backpack", "secret-bob")).toBe(0);

    expect(ctxB.player.inventoryFor("bob").count("backpack", "secret-bob")).toBe(1);
    expect(ctxB.player.inventoryFor("alice").count("backpack", "secret-alice")).toBe(0);
  });
});
