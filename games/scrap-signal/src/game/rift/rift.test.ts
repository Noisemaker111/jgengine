import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { pickCharacter, resetCharacterState, talentTree } from "../characters";
import { earn } from "../cash";
import { registerCommands, respecCost } from "../commands";
import { content } from "../content";
import { FRONT_SITE, tickFront } from "../encounters/front";
import { FRONT_LEAVE_RADIUS } from "../encounters/waves";
import { RIFT_LEAVE_GRACE_SECONDS, RIFT_REROLL_CORES, registerRift, riftBoard, riftMutatorsFor, riftStore, startRift, tickRift } from "./rift";
import { medalTargets, mutatorCountFor, riftEventId, riftScaling } from "./tiers";

afterEach(resetCharacterState);

function boot(options: { unlocked?: boolean; best?: Record<number, number> } = {}): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "overdrive-test", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "reclaimer", isNew: true },
  });
  pickCharacter("gunk");
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [FRONT_SITE.x - 6, 0, FRONT_SITE.z - 6], role: "player" });
  ctx.scene.entity.stats.set("reclaimer", "level", { current: 10 });
  registerCommands(ctx);
  registerRift(ctx);
  setGamePhase(ctx, "playing");
  const best: Record<string, number> = {};
  for (const [tier, seconds] of Object.entries(options.best ?? {})) best[riftEventId(Number(tier))] = seconds;
  riftStore.write(ctx, { ...riftStore.read(ctx), unlocked: options.unlocked ?? true, board: { best } });
  return ctx;
}

function step(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) {
    ctx.time.advance(0.1);
    tickFront(ctx, 0.1);
    tickRift(ctx, 0.1);
  }
}

describe("the Overdrive ladder", () => {
  test("stays shut until the plain front has been fought to the end", () => {
    const ctx = boot({ unlocked: false });
    expect(startRift(ctx, 1)).toEqual({ ok: false, reason: "Clear the Rustflat Front first." });
  });

  test("opens tiers by medal points: a bronze opens the next, a gold opens three ahead", () => {
    const bronze = riftBoard(boot({ best: { 1: medalTargets(1).bronze } }));
    expect(bronze.isOpen(riftEventId(2))).toBe(true);
    expect(bronze.isOpen(riftEventId(3))).toBe(false);
    resetCharacterState();
    const gold = riftBoard(boot({ best: { 1: medalTargets(1).gold } }));
    expect(gold.points()).toBe(3);
    expect(gold.isOpen(riftEventId(4))).toBe(true);
    expect(gold.isOpen(riftEventId(5))).toBe(false);
  });

  test("refuses a locked tier", () => {
    const ctx = boot();
    expect(startRift(ctx, 2).ok).toBe(false);
    expect(startRift(ctx, 1).ok).toBe(true);
  });

  test("scales crews past the reclaimer and pays more the higher it goes", () => {
    const low = riftScaling(1, 10);
    const high = riftScaling(12, 10);
    expect(low.enemyLevel).toBe(10);
    expect(high.enemyLevel).toBe(15);
    expect(high.health).toBeGreaterThan(low.health * 2);
    expect(high.cash).toBeGreaterThan(low.cash * 10);
    expect(mutatorCountFor(1)).toBe(0);
    expect(mutatorCountFor(8)).toBe(3);
  });

  test("re-tuning a tier's mutators costs cores and changes the roll", () => {
    const ctx = boot({ best: { 1: 600, 2: 600, 3: 600, 4: 600, 5: 600, 6: 600, 7: 600 } });
    const before = riftMutatorsFor(ctx, 8);
    expect(before).toHaveLength(3);
    ctx.game.commands.run("rift.reroll", { tier: 8 });
    expect(riftMutatorsFor(ctx, 8)).toEqual(before);
    earn(ctx, "cores", RIFT_REROLL_CORES, "kill-cores");
    ctx.game.commands.run("rift.reroll", { tier: 8 });
    expect(ctx.game.economy.balance("reclaimer", "cores")).toBe(0);
    expect(riftStore.read(ctx).rerolls["8"]).toBe(1);
    expect(riftMutatorsFor(ctx, 8)).not.toEqual(before);
  });

  test("walking out of the ring forfeits the run after the grace window", () => {
    const ctx = boot();
    expect(startRift(ctx, 1).ok).toBe(true);
    ctx.scene.entity.update("reclaimer", { position: [FRONT_SITE.x + FRONT_LEAVE_RADIUS + 20, 0, FRONT_SITE.z] });
    step(ctx, RIFT_LEAVE_GRACE_SECONDS - 1);
    expect(riftStore.read(ctx).run?.phase).not.toBe("lost");
    step(ctx, 2);
    expect(riftStore.read(ctx).run).toMatchObject({ phase: "lost", reason: "you left the wreck" });
  });

  test("abandoning ends the run as lost", () => {
    const ctx = boot();
    startRift(ctx, 1);
    ctx.game.commands.run("rift.abandon", {});
    expect(riftStore.read(ctx).run).toMatchObject({ phase: "lost", reason: "the run was abandoned" });
  });
});

describe("recalibrating the talent tree", () => {
  test("refunds every point for cash that grows with level", () => {
    const ctx = boot();
    const tree = talentTree()!;
    tree.grantPoints(4);
    ctx.game.commands.run("talent.spend", { nodeId: "gunk_hot_chamber" });
    ctx.game.commands.run("talent.spend", { nodeId: "gunk_hot_chamber" });
    expect(tree.pointsSpent()).toBe(2);
    ctx.game.commands.run("talent.respec", {});
    expect(tree.pointsSpent()).toBe(2);
    earn(ctx, "cash", respecCost(10), "salvage");
    ctx.game.commands.run("talent.respec", {});
    expect(tree.pointsSpent()).toBe(0);
    expect(tree.pointsAvailable()).toBe(4);
    expect(ctx.scene.entity.stats.get("reclaimer", "skillPoints")?.current).toBe(4);
    expect(ctx.game.economy.balance("reclaimer", "cash")).toBe(0);
    expect(respecCost(30)).toBeGreaterThan(respecCost(10));
  });
});

describe("a lethal hit on the reclaimer", () => {
  test("leaves the chassis on the field with its level, for the Emergency Reserve to take", () => {
    const ctx = boot();
    ctx.scene.entity.spawn("husk", { id: "husk_1", position: [FRONT_SITE.x - 4, 0, FRONT_SITE.z - 6] });
    const [hit] = ctx.scene.entity.effect({ from: "husk_1", to: "reclaimer", effect: "damage", via: { amount: 99_999 } });
    expect(hit?.lethal).toBe(true);
    expect(ctx.scene.entity.get("reclaimer")).not.toBeNull();
    expect(ctx.scene.entity.stats.get("reclaimer", "level")?.current).toBe(10);
    expect(ctx.scene.entity.stats.get("reclaimer", "health")?.current).toBe(1);
  });
});
