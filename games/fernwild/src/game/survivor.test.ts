import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { nearestHarvestable, shuttle, survivorSave, survivorView, takeOff } from "./survivor";

/** A survivor on the authored beach with the real island under them and the survivor system installed. */
function survivorRunner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop! });
}

const tick = (runner: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) runner.step(0.05);
};
const count = (runner: HeadlessRunner, item: string) => runner.ctx.player.inventory.count(BAG, item) + runner.ctx.player.inventory.count(HOTBAR, item);

test("wake on the beach, punch a tree, pick stones, craft a Stone Pick, level up", () => {
  const runner = survivorRunner();
  tick(runner, 0.1);
  const facing = runner.ctx.scene.entity.get(runner.userId)!.rotationY;
  expect(survivorView(runner.ctx).aim.strike).not.toBeNull();

  // Fists strip thatch fast and wood slowly, like ARK's bare hands.
  for (let swing = 0; swing < 30 && (count(runner, "thatch") < 10 || count(runner, "wood") < 1); swing += 1) {
    runner.ui.tryInvoke("fire", { yaw: facing });
    tick(runner, 0.6);
  }
  expect(count(runner, "thatch")).toBeGreaterThanOrEqual(10);
  expect(count(runner, "wood")).toBeGreaterThanOrEqual(1);
  expect(count(runner, "thatch")).toBeGreaterThan(count(runner, "wood") * 2);

  // E takes only what the survivor looks at: facing the tree it picks nothing; turned to the stones it picks them.
  runner.ui.tryInvoke("harvest", {});
  expect(count(runner, "stone")).toBe(0);
  const me = runner.ctx.scene.entity.get(runner.userId);
  const stones = me === null ? null : nearestHarvestable(runner.ctx, me.position, 4, "pick", "stone");
  if (me === null || stones === null) throw new Error("no stones beside the survivor");
  runner.ctx.scene.entity.setPose(runner.userId, { position: me.position, rotationY: Math.atan2(stones[0] - me.position[0], stones[2] - me.position[2]) });
  runner.ui.tryInvoke("harvest", {});
  expect(count(runner, "stone")).toBeGreaterThanOrEqual(1);

  runner.ui.tryInvoke("craft", { recipeId: "stone_pick" });
  expect(survivorView(runner.ctx).queue).toHaveLength(1);
  tick(runner, 6);
  expect(count(runner, "stone_pick")).toBe(1);
  expect(runner.ctx.player.inventory.count(HOTBAR, "stone_pick")).toBe(1);

  // A few more swings with the pick cross ARK's level-2 threshold: one stat point, eight engram points.
  runner.ctx.item.use.use({ from: runner.userId, itemId: runner.ctx.player.inventory.state(HOTBAR).slots[0]!.itemId, inventoryId: HOTBAR });
  for (let swing = 0; swing < 12 && survivorView(runner.ctx).level < 2; swing += 1) {
    runner.ui.tryInvoke("fire", { yaw: facing });
    tick(runner, 0.6);
  }
  const view = survivorView(runner.ctx);
  expect(view.level).toBe(2);
  expect(view.statPoints).toBe(1);
  expect(view.engramPoints).toBe(8);
  runner.ui.tryInvoke("levelStat", { stat: "health" });
  expect(survivorView(runner.ctx).health.max).toBe(110);
  runner.ui.tryInvoke("learn", { engramId: "campfire" });
  expect(survivorView(runner.ctx).engramPoints).toBe(5);
});

test("a dry throat stops healing and costs about one health every five seconds", () => {
  const runner = survivorRunner();
  // ARK's water lasts about 40 minutes untouched; food outlasts it.
  // Coarse steps: each step runs the whole island, so forty minutes at 50 ms (48,000 steps), or even at 1 s, outlasts CI's 5 s test timeout.
  for (let second = 0; second < 2420; second += 2) runner.step(2);
  const view = survivorView(runner.ctx);
  expect(view.flags).toContain("dehydrated");
  expect(view.flags).not.toContain("starving");
  const before = view.health.value;
  for (let second = 0; second < 25; second += 1) runner.step(1);
  const lost = before - survivorView(runner.ctx).health.value;
  expect(lost).toBeGreaterThan(4);
  expect(lost).toBeLessThan(6.5);
});

test("the HUD's health is the pool hits land on, the moment they land", () => {
  const runner = survivorRunner();
  tick(runner, 0.1);
  runner.ui.tryInvoke("cheat", { xp: 100000, spend: { health: 10 } });
  tick(runner, 0.1);
  const shows = () => {
    const health = survivorView(runner.ctx).health;
    expect(health.max).toBe(pool().max);
    expect(health.value).toBeCloseTo(pool().current, 1);
  };
  const pool = () => runner.ctx.scene.entity.stats.get(runner.userId, "health")!;
  shows();
  expect(pool().max).toBeGreaterThan(100);
  const before = pool().current;
  runner.ctx.scene.entity.effect({ from: "raptor", to: runner.userId, effect: "damage", via: { amount: 15 } });
  shows();
  expect(pool().current).toBeCloseTo(before - 15, 5);
});

test("raw meat goes off in the bag: a unit every 10 minutes turns to spoiled meat, the narcotic's base", () => {
  const runner = survivorRunner();
  tick(runner, 0.1);
  runner.ctx.player.inventory.put(BAG, "raw_meat", 2);
  for (let second = 0; second < 590; second += 1) runner.step(1);
  expect(count(runner, "raw_meat")).toBe(2);
  expect(count(runner, "spoiled_meat")).toBe(0);
  for (let second = 0; second < 20; second += 1) runner.step(1);
  expect(count(runner, "raw_meat")).toBe(1);
  expect(count(runner, "spoiled_meat")).toBe(1);
});

test("a save keeps how far the meat has gone off", () => {
  const before = survivorRunner();
  tick(before, 0.1);
  before.ctx.player.inventory.put(BAG, "raw_meat", 2);
  for (let second = 0; second < 590; second += 1) before.step(1);
  const saved = survivorSave(before.ctx).snapshot();

  const after = survivorRunner();
  tick(after, 0.1);
  after.ctx.player.inventory.put(BAG, "raw_meat", 2);
  survivorSave(after.ctx).hydrate(saved);
  for (let second = 0; second < 20; second += 1) after.step(1);
  expect(count(after, "raw_meat")).toBe(1);
  expect(count(after, "spoiled_meat")).toBe(1);
});

test("double-clicked cloth is worn in its slot, insulates and weighs, swaps, comes off and survives a save", () => {
  const runner = survivorRunner();
  tick(runner, 0.1);
  const { ctx } = runner;
  ctx.player.inventory.put(BAG, "cloth_shirt", 2);
  ctx.player.inventory.put(BAG, "cloth_hat", 1);
  const slotOf = (item: string) => ctx.player.inventory.state(BAG).slots.findIndex((stack) => stack?.itemId === item);
  const weightBefore = survivorView(ctx).weight.value;

  shuttle(ctx, BAG, slotOf("cloth_shirt"));
  shuttle(ctx, BAG, slotOf("cloth_hat"));
  const worn = survivorView(ctx);
  expect(worn.gear.find((slot) => slot.id === "torso")?.item).toBe("cloth_shirt");
  expect(worn.gear.find((slot) => slot.id === "head")?.item).toBe("cloth_hat");
  expect(ctx.player.inventory.count(BAG, "cloth_shirt")).toBe(1);
  expect(ctx.player.inventory.count(HOTBAR, "cloth_hat")).toBe(0);
  expect(worn.insulation).toEqual({ heat: 4, cold: 3 });
  expect(worn.weight.value).toBe(weightBefore);

  // The second shirt replaces the first, which goes back into the bag.
  shuttle(ctx, BAG, slotOf("cloth_shirt"));
  expect(ctx.player.inventory.count(BAG, "cloth_shirt")).toBe(1);
  expect(survivorView(ctx).gear.find((slot) => slot.id === "torso")?.item).toBe("cloth_shirt");

  const saved = survivorSave(ctx).snapshot();
  takeOff(ctx, "head");
  expect(ctx.player.inventory.count(BAG, "cloth_hat")).toBe(1);
  expect(survivorView(ctx).insulation).toEqual({ heat: 2, cold: 1.5 });

  const after = survivorRunner();
  tick(after, 0.1);
  survivorSave(after.ctx).hydrate(saved);
  expect(survivorView(after.ctx).gear.filter((slot) => slot.item !== null).map((slot) => slot.id)).toEqual(["head", "torso"]);
});
