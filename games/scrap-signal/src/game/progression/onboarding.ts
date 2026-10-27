import type { OnboardingConfig } from "@jgengine/core/onboarding/onboarding";
import { createOnboardingSystem } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CRASH_CHEST, QUEST_IDS } from "../quests/catalog";
import { discoveredStationsStore, talentRanksStore } from "../stores";
import { discoveryStore } from "./discovery";

function questEntry(ctx: GameContext, userId: string, questId: string) {
  return ctx.game.quest?.list(userId).find((entry) => entry.questId === questId);
}

function objectiveDone(ctx: GameContext, userId: string, questId: string, objectiveId: string): boolean {
  const entry = questEntry(ctx, userId, questId);
  if (entry === undefined) return false;
  if (entry.status !== "active") return true;
  const objective = entry.objectives.find((candidate) => candidate.id === objectiveId);
  return objective !== undefined && objective.progress >= objective.count;
}

function questFinished(ctx: GameContext, userId: string, questId: string): boolean {
  const entry = questEntry(ctx, userId, questId);
  return entry !== undefined && entry.status !== "active";
}

/**
 * Borderlands' crash site as hints: each says what one new thing is the first time it matters, in the
 * mission log beside Bolt's quests. Blended, so nothing is locked and nothing pops over the view; the
 * quest marker does the pointing.
 */
export const CRASH_SITE: OnboardingConfig<GameContext> = {
  id: "crash-site",
  title: "Field notes",
  style: "blended",
  steps: [
    {
      id: "talk",
      text: "Talk to B0-LT",
      detail: "Walk up to the little robot and press E. E again takes the job.",
      done: { when: (ctx, userId) => questEntry(ctx, userId, QUEST_IDS.firstGun) !== undefined },
    },
    {
      id: "chest",
      text: "Open the crash chest",
      detail: "Follow the marker to the red chest by the bus and press E.",
      done: { when: (ctx, userId) => objectiveDone(ctx, userId, QUEST_IDS.firstGun, "chest") || ctx.scene.object.get(CRASH_CHEST) === null },
    },
    {
      id: "pistol",
      text: "Pick up the pistol",
      detail: "Guns glow in their rarity colour. Stand over one and press E.",
      done: { when: (ctx) => discoveryStore.read(ctx).gunsLooted >= 1 },
    },
    {
      id: "shoot",
      text: "Shoot a whelp",
      detail: "Left mouse fires, right mouse aims. Press R to reload before the magazine runs dry.",
      done: { when: (ctx) => discoveryStore.read(ctx).kills >= 1 },
    },
    {
      id: "skill",
      text: "Spend your skill point",
      detail: "Each level gives a point. Press K and pick a skill.",
      done: { when: (ctx) => Object.values(talentRanksStore.read(ctx)).some((rank) => rank > 0) },
    },
    {
      id: "compare",
      text: "Swap in a better gun",
      detail: "Walk up to a drop and read its card before you press E. Fire beats flesh, shock beats shields, corrosive beats armour.",
      done: { when: (ctx) => discoveryStore.read(ctx).gunsLooted >= 2 },
    },
    {
      id: "second-wind",
      text: "Beat Old Tusk",
      detail: "Knocked down? Kill something before your reserve runs out to get a second wind.",
      done: { when: (ctx, userId) => questFinished(ctx, userId, QUEST_IDS.oldTusk) },
    },
    {
      id: "travel",
      text: "Find the Shelf's travel station",
      detail: "Touch a travel station to warp back to any station you have found.",
      done: { when: (ctx) => discoveredStationsStore.read(ctx).includes("breakwater_shelf") },
    },
  ],
};

/** The crash-site hints, installed with the game's systems. */
export const crashSite = createOnboardingSystem(CRASH_SITE);
