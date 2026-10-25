import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "./content";
import { pickCharacter, resetCharacterState } from "./characters";
import { lootTables } from "./entities/enemies/loot-tables";
import { RELAY, registerRelay, relayEnemyDied, relayStore, tickRelay } from "./relay";

afterEach(resetCharacterState);
function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "dead-air-test", assets: createAssetCatalog(), multiplayer: "off", persist: true }),
    content, player: { userId: "reclaimer", isNew: true },
    save: { backend, key: "dead-air-test", mode: "manual" },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [RELAY.x, 0, RELAY.z] });
  for (const table of lootTables) ctx.game.loot.register(table);
  registerRelay(ctx, () => {});
  ctx.game.events.on("entity.died", (event) => relayEnemyDied(ctx, event));
  pickCharacter("gunk");
  setGamePhase(ctx, "playing");
  return ctx;
}
function clearWave(ctx: ReturnType<typeof boot>) {
  for (const id of relayStore.read(ctx).enemies) {
    ctx.scene.entity.effect({ from: ctx.player.userId, to: id, effect: "damage", via: { amount: 10000 } });
  }
}

test("overclock spends shield to bank time, cannot skip hostiles, and restores its choice", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.game.commands.run("relay.start", {});
  ctx.game.commands.run("relay.overclock", {});
  const shield = ctx.scene.entity.stats.get("reclaimer", "shield")!.current;
  tickRelay(ctx, 6);
  expect(relayStore.read(ctx).upload).toBe(6);
  expect(relayStore.read(ctx).phase).toBe("defend");
  expect(relayStore.read(ctx).wave).toBe(1);
  expect(ctx.scene.entity.stats.get("reclaimer", "shield")!.current).toBe(shield - 36);
  await ctx.game.save!.save();
  const restored = boot(backend);
  await restored.game.save!.load();
  expect(relayStore.read(restored).overclock).toBe(true);
  expect(relayStore.read(restored).upload).toBe(6);
  clearWave(restored);
  tickRelay(restored, 0.1);
  expect(relayStore.read(restored).wave).toBe(2);
  expect(relayStore.read(restored).upload).toBe(0);
});
test("low shield and retreat limit overclock; clear-first keeps protective resource", () => {
  const ctx = boot();
  ctx.game.commands.run("relay.start", {});
  const shield = ctx.scene.entity.stats.get("reclaimer", "shield")!.current;
  tickRelay(ctx, 2);
  expect(ctx.scene.entity.stats.get("reclaimer", "shield")!.current).toBe(shield);
  ctx.scene.entity.stats.delta("reclaimer", "shield", 16 - shield);
  ctx.game.commands.run("relay.overclock", {});
  tickRelay(ctx, 3);
  expect(relayStore.read(ctx).upload).toBe(1);
  expect(ctx.scene.entity.stats.get("reclaimer", "shield")!.current).toBe(10);
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x + 30, 0, RELAY.z] });
  ctx.scene.entity.stats.delta("reclaimer", "shield", 50);
  tickRelay(ctx, 3);
  expect(relayStore.read(ctx).upload).toBe(1);
  expect(ctx.scene.entity.stats.get("reclaimer", "shield")!.current).toBe(60);
});
test("contract requires console proximity and live controls; enemies block uploads and pause preserves its window", () => {
  const ctx = boot();
  ctx.scene.entity.update("reclaimer", { position: [0, 0, 0] });
  ctx.game.commands.run("relay.start", {});
  expect(relayStore.read(ctx).phase).toBe("idle");
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x, 0, RELAY.z] });
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 10);
  expect(relayStore.read(ctx).upload).toBe(0);
  expect(relayStore.read(ctx).enemies.length).toBe(2);
  setGamePhase(ctx, "paused");
  tickRelay(ctx, 20);
  expect(relayStore.read(ctx).remaining).toBe(140);
  setGamePhase(ctx, "playing");
  clearWave(ctx);
  expect(relayStore.read(ctx).phase).toBe("upload");
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x + 30, 0, RELAY.z] });
  tickRelay(ctx, 7);
  expect(relayStore.read(ctx).upload).toBe(0);
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x, 0, RELAY.z] });
  tickRelay(ctx, 6);
  expect(relayStore.read(ctx).wave).toBe(2);
});

test("three real combat ambushes pay once; whole-world reload retains earned reward and live encounter membership", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.game.commands.run("relay.start", {});
  await ctx.game.save!.checkpoint();
  const restored = boot(backend);
  expect(await restored.game.save!.load()).toBe(true);
  expect(relayStore.read(restored).enemies).toEqual(relayStore.read(ctx).enemies);
  for (let wave = 1; wave <= 2; wave++) { clearWave(restored); tickRelay(restored, 6); }
  clearWave(restored);
  const beforeReward = restored.game.economy.balance("reclaimer", "cash");
  tickRelay(restored, 6);
  expect(relayStore.read(restored).phase).toBe("won");
  expect(gamePhase(restored)).toBe("ended");
  expect(restored.time.isPaused()).toBe(true);
  expect(restored.game.economy.balance("reclaimer", "cash")).toBe(beforeReward + 120);
  expect(restored.game.economy.balance("reclaimer", "cores")).toBe(3);
  await restored.game.save!.checkpoint();
  const reboot = boot(backend);
  await reboot.game.save!.load();
  reboot.game.commands.run("relay.continue", {});
  reboot.game.commands.run("relay.start", {});
  for (let wave = 1; wave <= 2; wave++) { clearWave(reboot); tickRelay(reboot, 6); }
  clearWave(reboot);
  const beforeReplayFinish = reboot.game.economy.balance("reclaimer", "cash");
  tickRelay(reboot, 6);
  expect(reboot.game.economy.balance("reclaimer", "cash")).toBe(beforeReplayFinish);
  expect(reboot.game.economy.balance("reclaimer", "cores")).toBe(3);
});

test("expired carrier clears only encounter enemies and offers another attempt", () => {
  const ctx = boot();
  ctx.scene.entity.spawn("husk", { id: "campaign-enemy", position: [0, 0, 0] });
  ctx.game.commands.run("relay.start", {});
  const ids = relayStore.read(ctx).enemies;
  tickRelay(ctx, 150);
  expect(relayStore.read(ctx).phase).toBe("lost");
  for (const id of ids) expect(ctx.scene.entity.get(id)).toBeNull();
  expect(ctx.scene.entity.get("campaign-enemy")).not.toBeNull();
  expect(ctx.game.economy.balance("reclaimer", "cash")).toBe(0);
  ctx.game.commands.run("relay.continue", {});
  ctx.game.commands.run("relay.start", {});
  expect(relayStore.read(ctx).wave).toBe(1);
  expect(relayStore.read(ctx).remaining).toBe(150);
});
