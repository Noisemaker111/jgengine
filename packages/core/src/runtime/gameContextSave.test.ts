import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { memorySaveBackend } from "../game/saveStore";
import { createAssetCatalog } from "../scene/assetCatalog";
import { defineStore } from "../store/defineStore";
import { convex } from "./adapter";
import { createGameContext } from "./gameContext";

const progress = defineStore<{ level: number }>("save.progress", { level: 1 });

function offlineGame(persist: boolean | { storage?: "local" | "memory"; mode?: "autosave" | "manual" }) {
  return defineGame({ name: "SaveTest", assets: createAssetCatalog(), multiplayer: "off", persist });
}

function progressionGame() {
  return defineGame({
    name: "ProgressionSave",
    assets: createAssetCatalog(),
    multiplayer: "off",
    persist: true,
    features: { quest: true, unlocks: true, roster: true },
  });
}

const QUESTS = [
  { id: "q_intro", title: "Intro", objectives: [{ id: "o1", kind: "custom", count: 3 }] },
];

describe("ctx.game.save", () => {
  test("whole-world round-trips across a fresh context through a shared backend", async () => {
    const backend = memorySaveBackend();

    const host = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    progress.write(host, { level: 7 });
    host.scene.entity.spawn("hero", { id: "p1", position: [1, 0, 2] });
    expect(host.game.save).toBeDefined();
    await host.game.save!.save();

    const reboot = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    expect(await reboot.game.save!.load()).toBe(true);
    expect(progress.read(reboot)).toEqual({ level: 7 });
    expect(reboot.scene.entity.get("p1")?.position).toEqual([1, 0, 2]);
  });

  test("persist:true auto-wires ctx.game.save for an offline game", () => {
    const ctx = createGameContext({
      definition: offlineGame(true),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeDefined();
  });

  test("persist is ignored for a server-authoritative world", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "Hosted",
        assets: createAssetCatalog(),
        multiplayer: convex({ authority: "server" }),
        persist: true,
      }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeUndefined();
  });

  test("no persist config leaves ctx.game.save undefined", () => {
    const ctx = createGameContext({
      definition: defineGame({ name: "Plain", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeUndefined();
  });

  test("economy, quest, unlocks and roster round-trip through the whole-world save", async () => {
    const backend = memorySaveBackend();

    const host = createGameContext({
      definition: progressionGame(),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    host.game.quest!.register(QUESTS);
    host.game.economy.grant("p1", "gold", 42);
    host.game.quest!.accept("p1", "q_intro");
    host.game.quest!.progress("p1", "q_intro", "o1", 2);
    host.game.unlocks!.grant("p1", "double_jump");
    const captured = host.game.roster!.capture("p1", "slime", { id: "r1", capturedAt: 5 });
    await host.game.save!.save();

    const reboot = createGameContext({
      definition: progressionGame(),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    reboot.game.quest!.register(QUESTS);
    expect(await reboot.game.save!.load()).toBe(true);

    expect(reboot.game.economy.balance("p1", "gold")).toBe(42);
    expect(reboot.game.unlocks!.has("p1", "double_jump")).toBe(true);
    expect(reboot.game.roster!.get("p1", "r1")).toEqual(captured);
    expect(reboot.game.quest!.snapshot("p1")).toEqual([
      { questId: "q_intro", status: "active", progress: { o1: 2 } },
    ]);
  });

  const heroContent = {
    entityById: (name: string) =>
      name === "hero"
        ? { movement: { poses: ["standing", "crouch"] as const, aim: ["hip", "ads"] as const }, stats: { hp: { max: 100 } } }
        : undefined,
  };

  function baselineGame() {
    return defineGame({
      name: "BaselineSave",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { cosmetics: true, cards: true, turn: true },
    });
  }

  const PILE_CONFIG = {
    zones: ["draw", "hand", "discard"],
    drawFrom: "draw",
    handZone: "hand",
    discardTo: "discard",
  };
  const LOOP_CONFIG = {
    order: ["p1", "pawn1"],
    phases: ["move", "act"],
    pools: [{ id: "ap", max: 3, start: 3 }],
  };

  test("time, stats, cosmetics, cards, turn, pose, possession and motion all round-trip through the whole-world save", async () => {
    const backend = memorySaveBackend();

    const host = createGameContext({
      definition: baselineGame(),
      content: heroContent,
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    host.scene.entity.spawn("hero", { id: "p1", position: [0, 0, 0] });
    host.scene.entity.spawn("hero", { id: "pawn1", position: [3, 0, 0] });

    host.time.advance(12.5);
    host.scene.entity.stats.set("p1", "hp", { current: 55 });
    host.player.cosmetics!.equip("p1", "hat", "gold_hat");

    const hostPile = host.game.cards!.pile("deck", PILE_CONFIG);
    hostPile.reset({ zones: { draw: ["c1", "c2", "c3"], hand: [], discard: [] } });
    hostPile.draw(2);

    const hostLoop = host.game.turn!.loop("battle", LOOP_CONFIG);
    hostLoop.advanceTurn();
    hostLoop.spend("p1", "ap", 1);

    host.player.movement.setPose("p1", "crouch");
    host.player.movement.setAim("p1", "ads");

    host.player.possession.own("p1", "pawn1");
    expect(host.player.possession.possess("p1", "pawn1")).toBeNull();

    host.player.motion.impulse(7);
    host.player.motion.pushHorizontal(1, 2);
    host.player.motion.setVerticalVelocity(3);

    const savedTime = host.time.now();
    const savedPile = hostPile.state();
    const savedLoop = hostLoop.capture();
    await host.game.save!.save();

    const reboot = createGameContext({
      definition: baselineGame(),
      content: heroContent,
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    const rebootPile = reboot.game.cards!.pile("deck", PILE_CONFIG);
    const rebootLoop = reboot.game.turn!.loop("battle", LOOP_CONFIG);
    expect(await reboot.game.save!.load()).toBe(true);

    expect(reboot.time.now()).toBe(savedTime);
    expect(reboot.scene.entity.stats.get("p1", "hp")?.current).toBe(55);
    expect(reboot.player.cosmetics!.get("p1")).toEqual({ hat: "gold_hat" });
    expect(rebootPile.state()).toEqual(savedPile);
    expect(rebootLoop.capture()).toEqual(savedLoop);
    expect(reboot.player.movement.getPose("p1")).toBe("crouch");
    expect(reboot.player.movement.getAim("p1")).toBe("ads");
    expect(reboot.player.possession.active("p1")).toBe("pawn1");
    expect(reboot.player.possession.owns("p1", "pawn1")).toBe(true);
    expect(reboot.player.motion.takePending()).toEqual({
      impulses: [7],
      horizontalImpulses: [[1, 2]],
      verticalVelocity: 3,
      y: null,
    });
  });

  test("a game with none of the newly-covered features saves and loads unaffected", async () => {
    const backend = memorySaveBackend();
    const host = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    host.scene.entity.spawn("hero", { id: "p1", position: [4, 0, 5] });
    await host.game.save!.save();

    const reboot = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    expect(await reboot.game.save!.load()).toBe(true);
    expect(reboot.scene.entity.get("p1")?.position).toEqual([4, 0, 5]);
    expect(reboot.game.cards).toBeUndefined();
    expect(reboot.game.turn).toBeUndefined();
    expect(reboot.player.cosmetics).toBeUndefined();
  });

  test("the newly-covered baseline subsystems stay out of the replication payload", () => {
    const ctx = createGameContext({
      definition: baselineGame(),
      content: heroContent,
      player: { userId: "p1", isNew: true },
      save: { backend: memorySaveBackend(), mode: "manual" },
    });
    ctx.scene.entity.spawn("hero", { id: "p1", position: [0, 0, 0] });
    ctx.time.advance(5);
    ctx.player.cosmetics!.equip("p1", "hat", "gold_hat");
    ctx.player.movement.setPose("p1", "crouch");
    ctx.player.motion.impulse(2);

    const replication = ctx.snapshot();
    for (const key of ["time", "pose", "possession", "motion", "cosmetics", "cards", "turn"]) {
      expect(replication).not.toHaveProperty(key);
    }
  });

  test("the replication payload (ctx.snapshot) stays free of the save-only progression modules", () => {
    const ctx = createGameContext({
      definition: progressionGame(),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend: memorySaveBackend(), mode: "manual" },
    });
    ctx.game.economy.grant("p1", "gold", 10);
    ctx.game.quest!.register(QUESTS);
    ctx.game.quest!.accept("p1", "q_intro");
    ctx.game.unlocks!.grant("p1", "double_jump");
    ctx.game.roster!.capture("p1", "slime");

    const replication = ctx.snapshot();
    expect(replication).not.toHaveProperty("economy");
    expect(replication).not.toHaveProperty("quest");
    expect(replication).not.toHaveProperty("unlocks");
    expect(replication).not.toHaveProperty("roster");
  });
});
