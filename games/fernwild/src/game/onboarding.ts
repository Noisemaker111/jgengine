import type { OnboardingConfig } from "@jgengine/core/onboarding/onboarding";
import { createOnboardingSystem } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { creaturesView, nearestWild } from "./creatures";
import { grantXp, nearestHarvestable } from "./survivor";

const SPAWN = authoredSpawnPosition(editorLayers) ?? [0, 0, 0];

const held = (ctx: GameContext, userId: string, item: string): number => {
  const bags = ctx.player.inventoryFor(userId);
  return bags.count(BAG, item) + bags.count(HOTBAR, item);
};

/**
 * Washing up on the beach: ARK's first ten minutes as steps. Punch a tree for thatch and wood, pick up
 * stones, craft the Stone Pick you already know, then knock out and tame a dodo. Each step points at
 * the nearest thing to do it with (arrow and minimap star); engram learning waits for the pick.
 */
export const FIRST_DAY: OnboardingConfig<GameContext> = {
  id: "first-day",
  title: "Washed up",
  style: "teaching-area",
  area: { center: [SPAWN[0], SPAWN[2]], radius: 260, label: "the beach" },
  steps: [
    {
      id: "thatch",
      text: "Punch a tree for thatch",
      detail: "Walk up to a tree and left-click. Fists get mostly thatch, a little wood.",
      target: { kind: "tree", within: 120 },
      done: { progress: (ctx, userId) => Math.min(held(ctx, userId, "thatch"), 10) + Math.min(held(ctx, userId, "wood"), 1), count: 11 },
    },
    {
      id: "stone",
      text: "Gather stone",
      detail: "Loose stones lie on the ground. Look at one and press E.",
      target: { kind: "stones", within: 120 },
      done: { progress: (ctx, userId) => Math.min(held(ctx, userId, "stone"), 1), count: 1 },
    },
    {
      id: "pick",
      text: "Craft a Stone Pick",
      detail: "Press I, open Crafting and make a Stone Pick: 1 stone, 1 wood, 10 thatch.",
      done: { when: (ctx, userId) => held(ctx, userId, "stone_pick") >= 1 },
      locks: ["learn"],
      grants: { xp: { amount: 20 } },
    },
    {
      id: "tame",
      text: "Tame a dodo",
      detail: "Punch a dodo until it sleeps, then press E and put berries in its inventory. Bushes give berries when you press E on them.",
      target: { kind: "dodo", within: 250 },
      done: { when: (ctx) => creaturesView(ctx).tamed >= 1 },
      grants: { xp: { amount: 40 } },
    },
  ],
  locate: {
    tree: (ctx, from, within) => nearestHarvestable(ctx, from, within, "strike", "thatch"),
    stones: (ctx, from, within) => nearestHarvestable(ctx, from, within, "pick", "stone"),
    dodo: (ctx, from, within) => nearestWild(ctx, "dodo", from, within),
  },
};

/** The first-day onboarding, installed with the game's systems. */
export const firstDay = createOnboardingSystem(FIRST_DAY, { grantXp: (ctx, _userId, amount) => grantXp(ctx, amount) });
