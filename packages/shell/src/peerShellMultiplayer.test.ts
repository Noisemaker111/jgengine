import { describe, expect, test } from "bun:test";
import { p2p } from "@jgengine/core/runtime/adapter";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { HostedWorldRecord } from "@jgengine/core/runtime/hostedWorldStore";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
import { loopbackPipe, type HostRouter } from "@jgengine/ws/hostRouter";
import { createPeerHost, type PeerSignaling } from "@jgengine/ws/peer";
import { defineGame } from "./defineGame";
import { resolvePeerShellMultiplayer, type PeerShellFactories } from "./multiplayer";
import { attachWorldSync } from "./worldSync";

interface Puzzle { weight: boolean; light: boolean; stage: number; ticks: number }
function puzzle(ctx: GameContext): Puzzle { return ctx.game.store.get("puzzle") as Puzzle; }
function playable() {
  return defineGame({
    name: "paired-fixture", multiplayer: p2p({ authority: "server" }), features: { players: true },
    content: { entityById: id => id === "hero" ? { stats: { health: { max: 10 } } } : null },
    loop: {
      onInit(ctx) {
        ctx.game.store.set("puzzle", { weight: false, light: false, stage: 0, ticks: 0 });
        ctx.game.commands.define("weight", {
          validate(state) { return state.game.commands.actor() === "host" ? null : { reason: "weight-role" }; },
          apply(state) { state.game.store.set("puzzle", { ...puzzle(state), weight: true }); },
        });
        ctx.game.commands.define("light", {
          validate(state) { return state.game.commands.actor() === "guest" ? null : { reason: "light-role" }; },
          apply(state) { const before = puzzle(state); if (before.weight) state.game.store.set("puzzle", { ...before, light: true, stage: before.stage + 1 }); },
        });
      },
      onNewPlayer(ctx, player) { if (ctx.scene.entity.get(player!.userId) === null) ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] }); },
      onTick(ctx) { ctx.game.store.set("puzzle", { ...puzzle(ctx), ticks: puzzle(ctx).ticks + 1 }); },
    },
  });
}

function transportFixture() {
  let answer: ((offer: string) => Promise<string>) | null = null;
  let router: HostRouter;
  let ticks: (() => void) | null = null;
  let canceled = 0;
  let closedSignals = 0;
  const signaling = (): PeerSignaling => {
    let ownAnswer: typeof answer = null;
    return {
      publishOffer: async offer => { if (answer === null) throw new Error("no host"); return answer(offer); },
      onOffer(callback) { ownAnswer = callback; answer = callback; return () => { if (answer === callback) answer = null; }; },
      close() { closedSignals += 1; if (ownAnswer !== null && answer === ownAnswer) answer = null; },
    };
  };
  const peers: PeerShellFactories = {
    host(options) {
      const host = createPeerHost(options);
      router = host.router;
      return { ...host, accept: async () => "fixture-answer" };
    },
    guest(options) {
      const backend = createWsBackend({ userId: options.userId, pipe: loopbackPipe(router) });
      return { backend, offer: async () => "fixture-offer", connect: async answer => { expect(answer).toBe("fixture-answer"); }, close: () => backend.close() };
    },
  };
  return { signaling, peers, tick: () => ticks?.(), canceled: () => canceled, closedSignals: () => closedSignals,
    scheduleTicks(callback: () => void) { ticks = callback; return () => { canceled += 1; }; } };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error("replica did not converge");
}

describe("playable peer worlds through injected pipes", () => {
  test("two independent contexts share complementary commands, reject a third seat, and recover a guest", async () => {
    const game = playable();
    const transport = transportFixture();
    const host = await resolvePeerShellMultiplayer({ gameId: "paired", role: "host", userId: "host", playable: game,
      slotsPerServer: 2, signaling: transport.signaling(), peers: transport.peers, scheduleTicks: transport.scheduleTicks });
    const guest = await resolvePeerShellMultiplayer({ gameId: "paired", role: "join", userId: "guest", playable: game,
      signaling: transport.signaling(), peers: transport.peers });
    const a = createGameContext({ definition: game.game, content: game.content, player: { userId: "host", isNew: true } });
    const b = createGameContext({ definition: game.game, content: game.content, player: { userId: "guest", isNew: true } });
    const cleanups: (() => void)[] = [];
    let rejoined: Awaited<ReturnType<typeof resolvePeerShellMultiplayer>> | null = null;
    let third: Awaited<ReturnType<typeof resolvePeerShellMultiplayer>> | null = null;
    try {
      const joinedA = await host.backend.transport.joinServer({ gameId: "paired" });
      const joinedB = await guest.backend.transport.joinServer({ gameId: "paired" });
      if (!joinedA.ok || !joinedB.ok) throw new Error("fixture admission failed");
      expect(joinedB.serverId).toBe(joinedA.serverId);
      await expect(host.backend.transport.joinServer({ gameId: "paired", serverId: "other-world" })).rejects.toThrow("no hosted world");
      cleanups.push(attachWorldSync(host.backend.feeds!, joinedA.serverId, a), attachWorldSync(guest.backend.feeds!, joinedB.serverId, b));
      await until(() => a.scene.entity.get("guest") !== null && b.scene.entity.get("host") !== null);
      expect(a.scene.entity.list().map(e => e.id).sort()).toEqual(["guest", "host"]);
      expect(await guest.backend.transport.runCommand({ serverId: joinedB.serverId, command: "weight", input: { userId: "host" } })).toEqual({ ok: false, reason: "weight-role" });
      await host.backend.transport.runCommand({ serverId: joinedA.serverId, command: "weight", input: {} });
      await guest.backend.transport.runCommand({ serverId: joinedB.serverId, command: "light", input: {} });
      await until(() => puzzle(a)?.stage === 1 && puzzle(b)?.stage === 1);
      expect(puzzle(a)).toEqual(puzzle(b));
      transport.tick();
      await until(() => puzzle(a).ticks === 1 && puzzle(b).ticks === 1);
      third = await resolvePeerShellMultiplayer({ gameId: "paired", role: "join", userId: "third", playable: game, signaling: transport.signaling(), peers: transport.peers });
      expect(await third.backend.transport.joinServer({ gameId: "paired" })).toEqual({ ok: false, reason: "full" });
      await guest.backend.transport.leaveServer({ serverId: joinedB.serverId });
      await guest.close();
      rejoined = await resolvePeerShellMultiplayer({ gameId: "paired", role: "join", userId: "guest", playable: game, signaling: transport.signaling(), peers: transport.peers });
      const joinedAgain = await rejoined.backend.transport.joinServer({ gameId: "paired" });
      expect(joinedAgain.ok).toBe(true);
      if (!joinedAgain.ok) throw new Error("rejoin failed");
      expect(joinedAgain.isNew).toBe(false);
      const c = createGameContext({ definition: game.game, content: game.content, player: { userId: "guest", isNew: false } });
      cleanups.push(attachWorldSync(rejoined.backend.feeds!, joinedAgain.serverId, c));
      await until(() => puzzle(c)?.stage === 1);
      expect(puzzle(c)).toEqual(puzzle(a));
    } finally {
      for (const cleanup of cleanups) cleanup();
      await third?.close(); await rejoined?.close(); await guest.close(); await host.close();
    }
    expect(transport.canceled()).toBe(1);
    expect(transport.closedSignals()).toBe(4);
    transport.tick();
    expect(puzzle(a).ticks).toBe(1);
  });

  test("host close awaits persistence, and a restarted host restores progression", async () => {
    const game = playable();
    let saved: HostedWorldRecord | null = null;
    let writes = 0;
    let blockWrites = false;
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { began = resolve; });
    const store = { load: async () => saved, save: async (record: HostedWorldRecord) => {
      if (blockWrites) { began(); await gate; }
      saved = structuredClone(record); writes += 1;
    } };
    const transport = transportFixture();
    const host = await resolvePeerShellMultiplayer({ gameId: "paired", role: "host", userId: "host", playable: game, store,
      signaling: transport.signaling(), peers: transport.peers, scheduleTicks: transport.scheduleTicks });
    const joined = await host.backend.transport.joinServer({ gameId: "paired" });
    if (!joined.ok) throw new Error("join failed");
    await host.backend.transport.runCommand({ serverId: joined.serverId, command: "weight", input: {} });
    blockWrites = true;
    let settled = false;
    const closing = host.close().then(() => { settled = true; });
    await started;
    expect(settled).toBe(false);
    release(); await closing;
    blockWrites = false;
    await host.close();
    expect(writes).toBeGreaterThan(0);
    const restarted = await resolvePeerShellMultiplayer({ gameId: "paired", role: "host", userId: "host", playable: game, store,
      signaling: transport.signaling(), peers: transport.peers, scheduleTicks: transport.scheduleTicks });
    const replica = createGameContext({ definition: game.game, content: game.content, player: { userId: "host", isNew: false } });
    let unsub = () => {};
    try {
      const again = await restarted.backend.transport.joinServer({ gameId: "paired" });
      if (!again.ok) throw new Error("join failed");
      expect(again.isNew).toBe(false);
      unsub = attachWorldSync(restarted.backend.feeds!, again.serverId, replica);
      await until(() => puzzle(replica)?.weight === true);
    } finally { unsub(); await restarted.close(); }
  });

  test("memberless worlds do not tick and failed signaling disposes guest resources", async () => {
    const game = playable();
    const transport = transportFixture();
    const host = await resolvePeerShellMultiplayer({ gameId: "paired", role: "host", userId: "host", playable: game,
      signaling: transport.signaling(), peers: transport.peers, scheduleTicks: transport.scheduleTicks });
    const joined = await host.backend.transport.joinServer({ gameId: "paired" });
    if (!joined.ok) throw new Error("join failed");
    await host.backend.transport.leaveServer({ serverId: joined.serverId });
    transport.tick();
    const again = await host.backend.transport.joinServer({ gameId: "paired" });
    if (!again.ok) throw new Error("join failed");
    const replica = createGameContext({ definition: game.game, content: game.content, player: { userId: "host", isNew: false } });
    const unsub = attachWorldSync(host.backend.feeds!, again.serverId, replica);
    await until(() => puzzle(replica) !== undefined);
    expect(puzzle(replica).ticks).toBe(0);
    unsub(); await host.close();
    let disposed = 0;
    const signaling: PeerSignaling = { publishOffer: async () => { throw new Error("host unavailable"); }, onOffer: () => () => {}, close: () => { disposed += 1; } };
    const peers: PeerShellFactories = { ...transport.peers, guest(options) {
      const guest = transport.peers.guest(options);
      return { ...guest, close() { disposed += 1; guest.close(); } };
    } };
    await expect(resolvePeerShellMultiplayer({ gameId: "paired", role: "join", signaling, peers })).rejects.toThrow("host unavailable");
    expect(disposed).toBe(2);
  });

  test("a playable with client authority rejects before opening signaling", async () => {
    const game = playable();
    game.game.multiplayer = p2p();
    await expect(resolvePeerShellMultiplayer({ gameId: "paired", role: "host", playable: game })).rejects.toThrow("authority");
  });
});
