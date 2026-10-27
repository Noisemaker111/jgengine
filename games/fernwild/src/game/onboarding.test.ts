import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { ONBOARDING_MARK, onboardingLock, onboardingOf, type OnboardingRuntime } from "@jgengine/core/onboarding/onboardingSystem";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { content } from "./content";
import { itemTraits } from "./data/items";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { creaturesView, forceTame, nearestWild, spawnCreature } from "./creatures";
import { firstDay } from "./onboarding";
import { nearestHarvestable } from "./survivor";

function firstDayRunner(): { runner: HeadlessRunner; onboarding: OnboardingRuntime } {
  const definition = defineGameDefinition({
    name: "Fernwild (test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems: [...systems, firstDay],
    loop: { onNewPlayer },
    newGame: survivorStart,
  });
  const runner = createHeadlessRunner({ definition, content, loop: defined(definition.loop) });
  const onboarding = onboardingOf(runner.ctx);
  if (onboarding === null) throw new Error("the first-day onboarding did not install");
  return { runner, onboarding };
}

function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const tick = (runner: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) runner.step(0.05);
};
const count = (runner: HeadlessRunner, item: string) => runner.ctx.player.inventory.count(BAG, item) + runner.ctx.player.inventory.count(HOTBAR, item);
const survivor = (runner: HeadlessRunner) => defined(runner.ctx.scene.entity.get(runner.userId));
const here = (runner: HeadlessRunner) => survivor(runner).position;
const step = (onboarding: OnboardingRuntime) => onboarding.run().current()?.step.id ?? null;

test("the first day walks a new survivor from a punched tree to a tamed dodo, pointing at each thing", () => {
  const { runner, onboarding } = firstDayRunner();
  tick(runner, 0.3);

  // Step 1 points at the nearest tree, arrow and minimap star both.
  expect(step(onboarding)).toBe("thatch");
  const tree = defined(nearestHarvestable(runner.ctx, here(runner), 120, "strike", "thatch"));
  expect(onboarding.pointing()).toEqual(tree);
  expect(onboarding.waypoints.tracked()?.position).toEqual([tree[0], tree[2]]);
  expect(onboarding.markers.get(ONBOARDING_MARK)?.label).toBe("Punch a tree for thatch");

  // Engram learning waits for the pick.
  expect(onboardingLock(runner.ctx, "learn")).toBe("Craft a Stone Pick");
  expect(runner.ctx.game.commands.run("learn", { engramId: "campfire" }).status).toBe("rejected");

  const facing = survivor(runner).rotationY;
  for (let swing = 0; swing < 30 && step(onboarding) === "thatch"; swing += 1) {
    runner.ui.tryInvoke("fire", { yaw: facing });
    tick(runner, 0.6);
  }
  expect(onboarding.run().isDone("thatch")).toBe(true);

  // Step 2 points at loose stones, not a tree, and stars them on the minimap.
  expect(step(onboarding)).toBe("stone");
  tick(runner, 0.3);
  const stones = nearestHarvestable(runner.ctx, here(runner), 120, "pick", "stone");
  expect(stones).not.toBeNull();
  expect(onboarding.pointing()).toEqual(stones);
  expect(onboarding.markers.get(ONBOARDING_MARK)?.position).toEqual(stones);
  runner.ui.tryInvoke("harvest", {});
  tick(runner, 0.2);
  expect(onboarding.run().isDone("stone")).toBe(true);

  // Step 3: crafting the pick completes it and frees engram learning.
  expect(step(onboarding)).toBe("pick");
  runner.ui.tryInvoke("craft", { recipeId: "stone_pick" });
  tick(runner, 6);
  expect(count(runner, "stone_pick")).toBe(1);
  expect(onboarding.run().isDone("pick")).toBe(true);
  expect(onboardingLock(runner.ctx, "learn")).toBeNull();

  // Step 4 points at a dodo (or the dodo herd's grounds), and a tame finishes the day.
  expect(step(onboarding)).toBe("tame");
  tick(runner, 0.3);
  const dodo = nearestWild(runner.ctx, "dodo", here(runner), 250);
  expect(dodo).not.toBeNull();
  expect(onboarding.pointing()).toEqual(dodo);
  expect(onboarding.run().isFinished()).toBe(false);
  expect(creaturesView(runner.ctx).tamed).toBe(0);

  // A dodo right in front, tamed: the pointer moves onto it, then the day is done.
  const me = here(runner);
  const yaw = survivor(runner).rotationY;
  const id = defined(spawnCreature(runner.ctx, "dodo", [me[0] + Math.sin(yaw) * 2.5, me[2] + Math.cos(yaw) * 2.5]));
  tick(runner, 0.5);
  // The pointer follows the wandering dodo on its 0.25 s look beat.
  const pointing = defined(onboarding.pointing());
  const dodoAt = defined(runner.ctx.scene.entity.get(id)).position;
  expect(Math.hypot(pointing[0] - dodoAt[0], pointing[2] - dodoAt[2])).toBeLessThan(0.5);
  forceTame(runner.ctx);
  tick(runner, 0.3);
  expect(creaturesView(runner.ctx).tamed).toBe(1);
  expect(onboarding.run().isFinished()).toBe(true);
  expect(onboarding.pointing()).toBeNull();
});

test("skipping the first day lifts its locks and clears the pointer", () => {
  const { runner, onboarding } = firstDayRunner();
  tick(runner, 0.3);
  expect(onboarding.pointing()).not.toBeNull();
  expect(runner.ctx.game.commands.run("onboarding.skip", {}).status).toBe("applied");
  tick(runner, 0.3);
  expect(onboarding.run().isSkipped()).toBe(true);
  expect(onboardingLock(runner.ctx, "learn")).toBeNull();
  expect(onboarding.pointing()).toBeNull();
  expect(onboarding.markers.get(ONBOARDING_MARK)).toBeNull();
});
