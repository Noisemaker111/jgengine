import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { survivorView } from "./survivor";

/** A survivor on the authored beach with the real island under them and the survivor system installed. */
function survivorRunner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
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
  for (let swing = 0; swing < 12 && count(runner, "thatch") < 10; swing += 1) {
    runner.ui.tryInvoke("fire", { yaw: facing });
    tick(runner, 0.6);
  }
  expect(count(runner, "thatch")).toBeGreaterThanOrEqual(10);
  expect(count(runner, "wood")).toBeGreaterThanOrEqual(1);

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
  tick(runner, 2420);
  const view = survivorView(runner.ctx);
  expect(view.flags).toContain("dehydrated");
  expect(view.flags).not.toContain("starving");
  const before = view.health.value;
  tick(runner, 25);
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
