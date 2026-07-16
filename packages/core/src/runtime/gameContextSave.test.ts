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
