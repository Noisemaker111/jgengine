import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { pickCharacter, resetCharacterState } from "./characters";
import { content } from "./content";
import { lootTables } from "./entities/enemies/loot-tables";
import {
  MAST_WATCH_ID,
  mastRuntime,
  noteMastKill,
  registerMastWatch,
  restoreMastWatch,
  tickMastWatch,
} from "./mast";
import { authoredScene } from "./world/level";
import { findEditorMarker } from "@jgengine/core/editor/document";

afterEach(resetCharacterState);

const site = findEditorMarker(authoredScene, "signal_mast_rustflat")!.position;
const board = findEditorMarker(authoredScene, "signal_mast_board")!.position;

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "mast-watch-test", assets: createAssetCatalog(), multiplayer: "off", persist: true }),
    content,
    player: { userId: "reclaimer", isNew: true },
    save: { backend, key: "mast-watch-test", mode: "manual" },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [board.x, 0, board.z] });
  for (const table of lootTables) ctx.game.loot.register(table);
  registerMastWatch(ctx);
  pickCharacter("gunk");
  setGamePhase(ctx, "playing");
  return ctx;
}

function atMast(ctx: ReturnType<typeof boot>): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [site.x, ctx.world.groundHeightAt(site.x, site.z), site.z] });
}

test("a marker on high ground is still reachable", () => {
  const ctx = boot();
  const plateau = 34;
  ctx.world.groundHeightAt = () => plateau;
  mastRuntime(ctx).start(MAST_WATCH_ID);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [site.x, plateau, site.z] });
  tickMastWatch(ctx, 0.1);
  expect(mastRuntime(ctx).view()?.objectiveId).toBe("clear_guard");
});

test("the kill window expiring fails the contract without paying it", () => {
  const ctx = boot();
  mastRuntime(ctx).start(MAST_WATCH_ID);
  atMast(ctx);
  tickMastWatch(ctx, 0.1);
  expect(mastRuntime(ctx).view()?.objectiveId).toBe("clear_guard");
  const cash = ctx.game.economy.balance(ctx.player.userId, "cash");

  tickMastWatch(ctx, 46);
  const state = mastRuntime(ctx).state()!;
  expect(state.status).toBe("failed");
  expect(state.outcome).toBe("mast_cold");
  expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash);
});

test("only a sidearm kill counts, and progress survives save and load", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.game.commands.run("mast.start", {});
  atMast(ctx);
  tickMastWatch(ctx, 0.1);
  expect(mastRuntime(ctx).view()?.objectiveId).toBe("clear_guard");

  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "rifle");
  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "rifle");
  tickMastWatch(ctx, 0.1);
  expect(mastRuntime(ctx).view()?.objectiveId).toBe("clear_guard");
  expect(mastRuntime(ctx).view()?.counted).toBe(0);

  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "pistol");
  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "pistol");
  tickMastWatch(ctx, 0.1);
  expect(mastRuntime(ctx).view()?.objectiveId).toBe("hold_mast");
  tickMastWatch(ctx, 5);
  const before = mastRuntime(ctx).view()!;
  expect(before.status).toBe("active");
  await ctx.game.save!.save();

  const reboot = boot(backend);
  await reboot.game.save!.load();
  restoreMastWatch(reboot);
  const restored = mastRuntime(reboot).view()!;
  expect(restored.objectiveId).toBe("hold_mast");
  expect(restored.remaining).toBeCloseTo(before.remaining!, 5);
});

test("holding the mast pays the contract exactly once", () => {
  const ctx = boot();
  mastRuntime(ctx).start(MAST_WATCH_ID);
  atMast(ctx);
  tickMastWatch(ctx, 0.1);
  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "pistol");
  noteMastKill(ctx, "ripper_pup", ctx.player.userId, "pistol");
  tickMastWatch(ctx, 0.1);
  atMast(ctx);
  tickMastWatch(ctx, 60);
  const state = mastRuntime(ctx).state()!;
  expect(state.status).toBe("completed");
  const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
  const cores = ctx.game.economy.balance(ctx.player.userId, "cores");
  tickMastWatch(ctx, 10);
  expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash);
  expect(ctx.game.economy.balance(ctx.player.userId, "cores")).toBe(cores);
  expect(cash).toBeGreaterThanOrEqual(450);
});
