import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { gamePhase } from "../game/gamePhase";
import { defineStore } from "../store/defineStore";
import { createAssetCatalog } from "../scene/assetCatalog";
import { applyWorldDiff } from "./worldReplication";
import { createHostedGameRunner, type HostedGameRunner, type InputFrame } from "./hostedGameRunner";
import type { GameContext, GameContextContent } from "./gameContext";
import type { WorldSnapshot } from "./worldSnapshot";

const CONTENT: GameContextContent = {
  entityById(catalogId) {
    if (catalogId === "hero") return { stats: { health: { max: 10 } } };
    if (catalogId === "mover") return {};
    return null;
  },
};

function runner(restore?: WorldSnapshot): HostedGameRunner {
  return createHostedGameRunner({
    ...(restore === undefined ? {} : { restore }),
    definition: defineGameDefinition({
      name: "Hosted",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      loop: {
        onInit(ctx: GameContext) {
          ctx.scene.entity.spawn("mover", { id: "mover", position: [0, 0, 0] });
          ctx.game.store.set("started", true);
          ctx.game.commands.define<{ by: number }>("bump", {
            apply(state, input) {
              const prev = (state.game.store.get("bumped") as number | undefined) ?? 0;
              state.game.store.set("bumped", prev + input.by);
            },
          });
          ctx.game.commands.define<Record<string, never>>("claim", {
            apply(state) {
              state.game.store.set(`owner:${state.game.commands.actor() ?? "none"}`, true);
            },
          });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
          ctx.game.store.set("lastJoin", player!.userId);
        },
        onTick(ctx: GameContext, dt) {
          const mover = ctx.scene.entity.get("mover");
          if (mover) ctx.scene.entity.setPose("mover", { position: [mover.position[0] + dt, 0, 0] });
        },
        onPlayerLeave(ctx: GameContext, player) {
          ctx.scene.entity.despawn(player.userId);
        },
      },
    }),
    content: CONTENT,
  });
}

describe("hosted game runner", () => {
  test("authority freezes player motion at pause and zero timescale and retains pending impulses", () => {
    const host = runner();
    host.join("alice", true);
    host.input("alice", { held: ["moveForward"], pointer: null });
    const ctx = host.context();
    const pose = structuredClone(ctx.scene.entity.get("alice")!.position);
    ctx.player.motionFor("alice").impulse(8);
    ctx.time.pause();
    host.tick(0.1);
    expect(ctx.scene.entity.get("alice")!.position).toEqual(pose);
    expect(ctx.player.motionFor("alice").snapshot().impulses).toEqual([8]);
    ctx.time.play();
    ctx.time.setTimescale(0);
    host.tick(0.1);
    expect(ctx.scene.entity.get("alice")!.position).toEqual(pose);
    ctx.time.setTimescale(1);
    host.tick(0.05);
    expect(ctx.scene.entity.get("alice")!.position[2]).toBeGreaterThan(pose[2]);
    expect(ctx.player.motionFor("alice").snapshot().impulses).toEqual([]);
  });

  test("host player movement uses scaled seconds matching its game clock", () => {
    const move = (speed: number, dt: number) => {
      const host = runner();
      host.join("alice", true);
      host.input("alice", { held: ["moveForward"], pointer: null });
      host.context().time.setSpeed(speed);
      host.tick(dt);
      return { pose: host.context().scene.entity.get("alice")!.position, time: host.context().time.now() };
    };
    expect(move(2, 0.05)).toEqual(move(1, 0.1));
  });

  test("10k departed identities retain only the configured recent admission window in memory", () => {
    const game = defineGameDefinition({ name: "input churn" });
    const host = createHostedGameRunner({ definition: game, content: {}, inputRetention: { nowMs: () => 0 } });
    for (let index = 0; index < 10_000; index += 1) {
      const id = `player-${index}`;
      host.join(id, true);
      host.input(id, { held: [], pointer: null, seq: 1, presses: [{ action: "fire", seq: 1 }] } as InputFrame);
      host.leave(id);
      host.input(id, { held: ["fire"], pointer: null, seq: 999 } as InputFrame);
    }
    expect(host.inputStats()).toEqual({ members: 0, recorders: 0, recordedFrames: 0, latestInputs: 0, wireSequences: 256, pressSequences: 256, departedUsers: 256 });
    host.join("player-9999", false);
    host.input("player-9999", { held: ["fire"], pointer: null, seq: 1 } as InputFrame);
    expect(host.heldInput("player-9999")).toBeNull();
    host.join("player-0", false);
    host.input("player-0", { held: ["fire"], pointer: null, seq: 1 } as InputFrame);
    expect(host.heldInput("player-0")?.held).toEqual(["fire"]);
  });

  test("ordered reconnect TTL and count eviction survive a reversed clock, while live admission never expires", () => {
    let nowMs = 1000;
    const host = createHostedGameRunner({ definition: defineGameDefinition({ name: "retention clock" }), content: {}, inputRetention: { maxDepartedUsers: 2, departedTtlMs: 100, nowMs: () => nowMs } });
    for (const id of ["oldest", "recent", "newest"]) {
      host.join(id, true);
      host.input(id, { held: [], pointer: null, seq: 10, presses: [{ action: "fire", seq: 10 }] } as InputFrame);
      host.leave(id);
      nowMs -= 10;
    }
    expect(host.inputStats().departedUsers).toBe(2);
    expect(host.inputStats().wireSequences).toBe(2);
    host.join("recent", false);
    host.input("recent", { held: ["fire"], pointer: null, seq: 9 } as InputFrame);
    expect(host.heldInput("recent")).toBeNull();
    nowMs = 1101;
    expect(host.inputStats()).toMatchObject({ departedUsers: 0, wireSequences: 1, pressSequences: 1 });
    host.input("recent", { held: [], pointer: null, seq: 11, presses: [{ action: "fire", seq: 10 }] } as InputFrame);
    expect(host.heldInput("recent")?.presses).toEqual([]);
    host.leave("recent");
    nowMs = 1202;
    host.join("recent", false);
    host.input("recent", { held: [], pointer: null, seq: 1, presses: [{ action: "fire", seq: 1 }] } as InputFrame);
    expect(host.heldInput("recent")?.presses).toEqual([{ action: "fire", seq: 1 }]);
  });

  test("20k normal live ticks compact actual recorder memory and consume each released press once", () => {
    let fires = 0;
    const game = defineGameDefinition({ name: "long live input", features: { players: true }, simulation: { hz: 60 }, loop: { onTick(ctx) { fires += ctx.game.players?.input("alice")?.presses?.length ?? 0; } } });
    const host = createHostedGameRunner({ definition: game, content: {} });
    host.join("alice", true);
    let peakFrames = 0;
    for (let index = 1; index <= 20_000; index += 1) {
      host.input("alice", { held: [], pointer: null, seq: index, ...(index % 100 === 0 ? { presses: [{ action: "fire", seq: index }] } : {}) } as InputFrame);
      peakFrames = Math.max(peakFrames, host.inputStats().recordedFrames);
      host.tick(1 / 60);
    }
    expect(fires).toBe(200);
    expect(peakFrames).toBeLessThanOrEqual(2);
    expect(host.inputStats()).toEqual({ members: 1, recorders: 1, recordedFrames: 1, latestInputs: 1, wireSequences: 1, pressSequences: 1, departedUsers: 0 });
  });

  test("host compaction retains every staged future replay edge across save and resume", () => {
    const seen: string[] = [];
    const game = defineGameDefinition({ name: "future replay", features: { players: true }, simulation: { hz: 60 }, loop: { onTick(ctx) { for (const press of ctx.game.players?.input("alice")?.presses ?? []) seen.push(press.action); } } });
    let host = createHostedGameRunner({ definition: game, content: {} });
    host.join("alice", true);
    for (let tick = 1; tick <= 100; tick += 1) host.input("alice", { held: [], pointer: null, tick, presses: [{ action: `edge-${tick}`, seq: tick }] });
    expect(host.inputStats().recordedFrames).toBe(100);
    for (let tick = 1; tick <= 50; tick += 1) host.tick(1 / 60);
    expect(host.inputStats().recordedFrames).toBe(51);
    host = createHostedGameRunner({ definition: game, content: {}, restore: host.state() });
    host.resume("alice");
    for (let tick = 51; tick <= 100; tick += 1) host.tick(1 / 60);
    expect(seen).toEqual(Array.from({ length: 100 }, (_, index) => `edge-${index + 1}`));
    expect(host.inputStats().recordedFrames).toBe(1);
  });

  test("nonmember input never allocates host admission or replay storage", () => {
    const host = createHostedGameRunner({ definition: defineGameDefinition({ name: "member ingress" }), content: {} });
    for (let index = 0; index < 10_000; index += 1) host.input(`unknown-${index}`, { held: ["fire"], pointer: null, presses: [{ action: "fire", seq: index }], tick: 1000, seq: index } as InputFrame);
    expect(host.inputStats()).toEqual({ members: 0, recorders: 0, recordedFrames: 0, latestInputs: 0, wireSequences: 0, pressSequences: 0, departedUsers: 0 });
  });

  test("host input save codec accepts absent optional edges and skips malformed pointer state", () => {
    const game = defineGameDefinition({ name: "input save codec", features: { players: true } });
    const host = createHostedGameRunner({ definition: game, content: {} });
    host.join("alice", true);
    host.input("alice", { held: ["moveForward"], pointer: { x: 0, y: 0, active: true }, presses: undefined, analog: { moveForward: 0.5 }, seq: 9 } as InputFrame);
    const saved = host.state();
    const restored = createHostedGameRunner({ definition: game, content: {}, restore: saved });
    restored.resume("alice");
    restored.input("alice", { held: [], pointer: null, seq: 8 } as InputFrame);
    expect(restored.heldInput("alice")?.held).toEqual(["moveForward"]);
    expect(restored.heldInput("alice")?.analog).toEqual({ moveForward: 0.5 });
    const malformed = saved.hostInput as Array<{ latest: { pointer: { x: number } } }>;
    malformed[0]!.latest.pointer.x = NaN;
    const safe = createHostedGameRunner({ definition: game, content: {}, restore: saved });
    safe.resume("alice");
    expect(safe.heldInput("alice")).toBeNull();
  });

  test("host-only admission and pending edges survive stateless reconstruction without replaying consumed presses", () => {
    const game = defineGameDefinition({ name: "stateless edges", features: { players: true }, simulation: { hz: 60 }, loop: {
      onTick(ctx) {
        const presses = ctx.game.players?.input("alice")?.presses?.length ?? 0;
        ctx.game.store.set("fires", (ctx.game.store.get("fires") as number ?? 0) + presses);
      },
    } });
    const boot = (restore?: WorldSnapshot) => {
      const host = createHostedGameRunner({ definition: game, content: {}, ...(restore === undefined ? {} : { restore }) });
      if (restore === undefined) host.join("alice", true); else host.resume("alice");
      return host;
    };
    const tap = { held: [], pointer: null, presses: [{ action: "fire", seq: 100 }], seq: 2 };
    let host = boot();
    host.input("alice", tap);
    expect(host.snapshot()).not.toHaveProperty("hostInput");
    // A command-only invocation saves the admitted edge before any simulation tick.
    host = boot(host.state());
    host.input("alice", tap);
    host.tick(1 / 60);
    expect(host.context().game.store.get("fires")).toBe(1);
    for (let index = 0; index < 20; index += 1) {
      host = boot(host.state());
      host.input("alice", tap);
      host.tick(1 / 60);
      expect(host.context().game.store.get("fires")).toBe(1);
      expect(host.context().game.players?.input("alice")?.presses).toBeUndefined();
    }
    host.input("alice", { ...tap, presses: [{ action: "fire", seq: 101 }], seq: 3 });
    host.tick(1 / 60);
    expect(host.context().game.store.get("fires")).toBe(2);
    // Newer neutral ownership reaches the host before a delayed retained press.
    host.input("alice", { held: [], pointer: null, seq: 5 } as InputFrame);
    host = boot(host.state());
    host.input("alice", { ...tap, presses: [{ action: "fire", seq: 102 }], seq: 4 });
    host.tick(1 / 60);
    expect(host.context().game.store.get("fires")).toBe(2);
    const saved = host.state().hostInput as Array<{ recorder: { frames: unknown[] } }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.recorder.frames).toHaveLength(1);
    host.leave("alice");
    expect(host.state().hostInput).toEqual([]);
  });

  test("neutral-before-down admits one press, keeps movement neutral and rejects repeated or older press identities", () => {
    const seen: InputFrame[] = [];
    const game = defineGameDefinition({ name: "hosted-tap", assets: createAssetCatalog(), features: { players: true }, simulation: { hz: 60 }, loop: { onTick(ctx) { const input = ctx.game.players?.input("alice"); if (input) seen.push(input); } } });
    const host = createHostedGameRunner({ definition: game, content: {} });
    host.join("alice", true);
    const press = { action: "fire", seq: 100 };
    host.input("alice", { held: [], pointer: null, presses: [press], seq: 2 } as never);
    host.input("alice", { held: ["fire"], pointer: null, presses: [press], seq: 1 } as never);
    host.tick(1 / 60);
    expect(seen.at(-1)).toMatchObject({ held: [], presses: [press] });
    host.input("alice", { held: [], pointer: null, presses: [press], seq: 3 } as never);
    host.tick(1 / 60);
    expect(seen.at(-1)?.presses ?? []).toEqual([]);
    host.leave("alice"); host.join("alice", false);
    host.input("alice", { held: ["fire"], pointer: null, presses: [press], seq: 1 } as never);
    expect(host.heldInput("alice")).toBeNull();
    host.input("alice", { held: [], pointer: null, presses: [press], seq: 4 } as never);
    host.tick(1 / 60);
    expect(seen.at(-1)?.presses ?? []).toEqual([]);
    host.input("alice", { held: [], pointer: null, presses: [{ action: "fire", seq: 101 }], seq: 5 } as never);
    host.tick(1 / 60);
    expect(seen.at(-1)?.presses).toEqual([{ action: "fire", seq: 101 }]);
    host.tick(1 / 60);
    expect(seen.at(-1)?.presses).toBeUndefined();
  });
  test("scaled game time, pause and simulation cursor survive authoritative restore", () => {
    const host = runner();
    host.context().time.setSpeed(2);
    host.tick(1);
    expect(host.context().time.now()).toBe(2);
    expect(host.context().scene.entity.get("mover")?.position[0]).toBe(2);
    host.context().time.pause();
    host.tick(1);
    const saved = host.state();
    const restored = runner(saved);
    expect(restored.context().time.isPaused()).toBe(true);
    expect(restored.context().sim.tick()).toBe(host.context().sim.tick());
    restored.tick(1);
    expect(restored.context().time.now()).toBe(2);
    expect(restored.context().scene.entity.get("mover")?.position[0]).toBe(2);
  });

  test("onInit runs once at construction", () => {
    const host = runner();
    expect(host.context().game.store.get("started")).toBe(true);
    expect(host.context().scene.entity.get("mover")).not.toBeNull();
  });

  test("join spawns the player's entity, passes identity to onNewPlayer, and tracks membership", () => {
    const host = runner();
    host.join("alice", true);
    expect(host.members()).toEqual(["alice"]);
    expect(host.context().scene.entity.get("alice")).not.toBeNull();
    expect(host.context().game.store.get("lastJoin")).toBe("alice");
  });

  test("tick advances onTick and commits a rising revision", () => {
    const host = runner();
    expect(host.tick(1)).toBe(1);
    expect(host.context().scene.entity.get("mover")?.position[0]).toBeCloseTo(1);
    expect(host.tick(1)).toBe(2);
  });

  test("commands mutate the shared context and surface in the next diff", () => {
    const host = runner();
    host.tick(1);
    const rev = host.revision();
    host.command("alice", "bump", { by: 3 });
    host.tick(0);
    const diff = host.diff(rev);
    expect(diff.store).toContainEqual(["bumped", 3]);
  });

  test("a new joiner takes the full snapshot; a returning client folds diffs back to the same world", () => {
    const host = runner();
    host.join("alice", true);
    host.tick(1);
    const baseline = host.snapshot();
    const baselineRevision = host.revision();

    host.join("bob", true);
    host.command("bob", "bump", { by: 1 });
    host.tick(1);

    const rebuilt = applyWorldDiff(baseline, host.diff(baselineRevision));
    const live = host.snapshot();
    const ids = (snap: typeof rebuilt) =>
      new Set((snap["entities"] as { id: string }[]).map((e) => e.id));
    expect(ids(rebuilt)).toEqual(ids(live));
    expect(new Map(rebuilt["store"] as [string, unknown][])).toEqual(
      new Map(live["store"] as [string, unknown][]),
    );
    expect(rebuilt["stats"]).toEqual(live["stats"]);
  });

  test("leave fires onPlayerLeave, despawns the entity, and the removal reaches diffs", () => {
    const host = runner();
    host.join("alice", true);
    host.tick(1);
    const rev = host.revision();
    host.leave("alice");
    host.tick(0);
    expect(host.members()).toEqual([]);
    expect(host.context().scene.entity.get("alice")).toBeNull();
    expect(host.diff(rev).removedEntities).toContain("alice");
  });

  test("input frames are stored and retrievable per user", () => {
    const host = runner();
    host.join("alice", true);
    host.input("alice", { held: ["moveForward"], pointer: null });
    expect(host.heldInput("alice")).toEqual({ held: ["moveForward"], pointer: null });
    expect(host.heldInput("bob")).toBeNull();
  });

  test("a stale, out-of-order (lower-seq) input frame does not resurrect a released state", () => {
    const host = runner();
    host.join("alice", true);
    host.input("alice", { held: ["moveForward"], pointer: null, seq: 1 } as never);
    host.input("alice", { held: [], pointer: null, seq: 2 } as never);
    expect(host.heldInput("alice")).toEqual({ held: [], pointer: null, seq: 2 } as never);

    host.input("alice", { held: ["moveForward"], pointer: null, seq: 1 } as never);
    expect(host.heldInput("alice")).toEqual({ held: [], pointer: null, seq: 2 } as never);
  });

  test("input frames without a seq always apply, unaffected by seq ordering", () => {
    const host = runner();
    host.join("alice", true);
    host.input("alice", { held: ["a"], pointer: null });
    host.input("alice", { held: ["b"], pointer: null });
    expect(host.heldInput("alice")).toEqual({ held: ["b"], pointer: null });
  });

  test("re-joining an existing member is idempotent: onNewPlayer fires once, membership stays single-entry", () => {
    const host = runner();
    host.join("alice", true);
    expect(host.context().game.store.get("lastJoin")).toBe("alice");

    host.context().game.store.set("lastJoin", "nobody");
    host.join("alice", true);
    host.join("alice", false);

    expect(host.members()).toEqual(["alice"]);
    expect(host.context().game.store.get("lastJoin")).toBe("nobody");
    expect(host.context().scene.entity.get("alice")).not.toBeNull();
  });

  test("join/leave drive the connected-players registry the loop can read", () => {
    const host = runner();
    host.join("alice", true);
    host.join("bob", false);
    expect(host.context().game.players?.ids()).toEqual(["alice", "bob"]);
    expect(host.context().game.players?.get("bob")).toEqual({ userId: "bob", isNew: false, input: null });
    host.leave("alice");
    expect(host.context().game.players?.ids()).toEqual(["bob"]);
  });

  test("command routes actor identity to the handler", () => {
    const host = runner();
    host.join("alice", true);
    host.command("alice", "claim", {});
    expect(host.context().game.store.get("owner:alice")).toBe(true);
    expect(host.context().game.commands.actor()).toBeNull();
  });

  test("resume re-attaches a persisted member without re-firing onNewPlayer", () => {
    const origin = runner();
    origin.join("alice", true);
    origin.tick(1);
    origin.command("alice", "bump", { by: 1 });
    const saved = origin.snapshot();

    const restored = runner(saved);
    restored.resume("alice");
    expect(restored.members()).toEqual(["alice"]);
    expect(restored.context().game.players?.ids()).toEqual(["alice"]);
    expect(restored.context().game.store.get("lastJoin")).toBe("alice");
    restored.leave("alice");
    expect(restored.members()).toEqual([]);
    expect(restored.context().scene.entity.get("alice")).toBeNull();
  });

  test("restore rehydrates a persisted world without re-seeding, and onInit-registered commands still work", () => {
    const origin = runner();
    origin.join("alice", true);
    origin.command("alice", "bump", { by: 2 });
    origin.tick(1);
    const saved = origin.snapshot();

    const restored = runner(saved);
    expect(restored.context().scene.entity.get("alice")).not.toBeNull();
    expect(restored.context().game.store.get("started")).toBe(true);
    expect(restored.context().game.store.get("bumped")).toBe(2);
    expect(restored.context().scene.entity.get("mover")?.position[0]).toBeCloseTo(1);

    restored.command("alice", "bump", { by: 5 });
    expect(restored.context().game.store.get("bumped")).toBe(7);
  });
});

describe("hosted runner lifecycle phase sync", () => {
  interface RunState {
    phase: "menu" | "playing" | "ended";
    elapsed: number;
  }
  const runStore = defineStore<RunState>("run", () => ({ phase: "menu", elapsed: 0 }));

  function phaseRunner(): HostedGameRunner {
    return createHostedGameRunner({
      definition: defineGameDefinition({
        name: "PhaseHosted",
        multiplayer: "off",
        lifecycle: {
          store: runStore,
          start: (state) => ({ ...state, phase: "playing" }),
          restart: (state) => ({ ...state, phase: "playing", elapsed: 0 }),
          phaseOf: (state) => state.phase,
        },
        loop: {
          onInit(ctx: GameContext) {
            runStore.write(ctx, { phase: "menu", elapsed: 0 });
          },
          onTick(ctx: GameContext, dt) {
            const next = runStore.update(ctx, (s) => ({ ...s, elapsed: s.elapsed + dt }));
            if (next.elapsed >= 2 && next.phase === "playing") {
              runStore.write(ctx, { ...next, phase: "ended" });
            }
          },
        },
      }),
      content: {},
    });
  }

  test("onInit derives the initial phase from lifecycle.phaseOf", () => {
    const host = phaseRunner();
    expect(gamePhase(host.context())).toBe("menu");
  });

  test("start command flips phase to playing", () => {
    const host = phaseRunner();
    host.command("host", "start", {});
    expect(gamePhase(host.context())).toBe("playing");
  });

  test("a mid-tick phase transition is published without a per-game setGamePhase call", () => {
    const host = phaseRunner();
    host.command("host", "start", {});
    expect(gamePhase(host.context())).toBe("playing");

    host.tick(1);
    expect(gamePhase(host.context())).toBe("playing");

    host.tick(1.5);
    expect(runStore.read(host.context()).phase).toBe("ended");
    expect(gamePhase(host.context())).toBe("ended");
  });
});
