import type { OnboardingConfig, OnboardingPoint } from "@jgengine/core/onboarding/onboarding";
import { createOnboardingSystem } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition, markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { piecesBuilt } from "./base";
import { cavesOf } from "./caves";
import { inWater } from "./climate";
import { creaturesView, nearestWild, tames } from "./creatures";
import { dossierView, nearestUnreadNote } from "./dossier";
import { grantXp, knowsEngram, nearestHarvestable, survivorView } from "./survivor";

const SPAWN = authoredSpawnPosition(editorLayers) ?? [0, 0, 0];
const GREEN_OBELISK = markersOfKind(editorLayers, "obelisk").find((marker) => marker.meta?.["color"] === "green");

const held = (ctx: GameContext, userId: string, item: string): number => {
  const bags = ctx.player.inventoryFor(userId);
  return bags.count(BAG, item) + bags.count(HOTBAR, item);
};
const heldAny = (ctx: GameContext, userId: string, items: readonly string[]): number => items.reduce((sum, item) => sum + held(ctx, userId, item), 0);
const tamedA = (ctx: GameContext, species: string): boolean => tames(ctx).some((tame) => tame.species === species);

const BERRIES = ["mejoberry", "amarberry", "azulberry", "tintoberry"] as const;
const ARTIFACTS = ["artifact_clever", "artifact_hunter", "artifact_massive"] as const;
/** The beach's easy meat: creatures that run rather than fight. */
export const PREY = ["dodo", "lystrosaurus", "phiomia"] as const;
const TROPHIES = ["broodmother_trophy_gamma", "broodmother_trophy_beta", "broodmother_trophy_alpha"] as const;

/** The nearest shallows from `from`: rings outward until the ground dips under the sea. */
function nearestWater(ctx: GameContext, from: OnboardingPoint, within: number): OnboardingPoint | null {
  if (inWater(ctx, from)) return from;
  for (let radius = 3; radius <= within; radius += 3) {
    for (let step = 0; step < 32; step += 1) {
      const angle = (step / 32) * Math.PI * 2;
      const x = from[0] + Math.sin(angle) * radius;
      const z = from[2] + Math.cos(angle) * radius;
      const at: OnboardingPoint = [x, ctx.world.groundHeightAt(x, z), z];
      if (inWater(ctx, at)) return at;
    }
  }
  return null;
}

/** The mouth of the nearest cave whose artifact the survivor does not carry yet. */
function nearestCave(ctx: GameContext, from: OnboardingPoint, within: number): OnboardingPoint | null {
  let best: OnboardingPoint | null = null;
  let bestDistance = within;
  for (const cave of cavesOf(ctx)) {
    if (held(ctx, ctx.player.userId, cave.artifact) > 0) continue;
    const mouth = cave.layout.path[0];
    if (mouth === undefined) continue;
    const distance = Math.hypot(mouth[0] - from[0], mouth[1] - from[2]);
    if (distance <= bestDistance) {
      best = [mouth[0], ctx.world.groundHeightAt(mouth[0], mouth[1]), mouth[1]];
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The survivor's path, ARK's first hours as steps. On the beach (the teaching area): punch a tree, gather
 * stone, craft the pick, learn and craft the hatchet, pick berries, drink, tame a dodo. Then out across the
 * island, each step opening the next tier the way ARK's levels do: a stat point, a campfire and cooked
 * meat, a spear, a thatch hut, the Phiomia saddle and a ridden Phiomia, an explorer note, narcotics, a
 * club and a raptor, a cave's artifact, then the three artifacts and the Broodmother. Each step points at
 * the nearest thing to do it with (arrow and minimap star).
 */
export const FIRST_DAY: OnboardingConfig<GameContext> = {
  id: "first-day",
  title: "Survivor's path",
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
      id: "hatchet",
      text: "Learn and craft a Stone Hatchet",
      detail: "Levels give engram points. Press I, open Engrams and learn the Stone Hatchet, then craft it: 1 flint, 1 wood, 10 thatch. The pick gets flint from rocks.",
      target: { kind: "rock", within: 120 },
      done: { when: (ctx, userId) => held(ctx, userId, "stone_hatchet") >= 1 },
      grants: { xp: { amount: 10 } },
    },
    {
      id: "berries",
      text: "Pick berries",
      detail: "Press E on bushes. Berries keep you fed, and plant-eaters tame on them.",
      target: { kind: "bush", within: 120 },
      done: { progress: (ctx, userId) => heldAny(ctx, userId, BERRIES), count: 12 },
    },
    {
      id: "drink",
      text: "Drink at the shore",
      detail: "Walk into the shallows and press E. Water runs out faster than food.",
      target: { kind: "water", within: 240 },
      done: { when: (ctx) => survivorView(ctx).tally.drinks >= 1 },
    },
    {
      id: "tame",
      text: "Tame a dodo",
      detail: "Punch a dodo until it sleeps (torpor), then press E and put berries in its inventory. It eats on its own clock; hitting it again lowers the taming effectiveness.",
      target: { kind: "dodo", within: 250 },
      done: { when: (ctx) => creaturesView(ctx).tamed >= 1 },
      grants: { xp: { amount: 40 } },
    },
    {
      id: "stat",
      text: "Level up a stat",
      detail: "Each level gives a stat point. Press I and put it in Health, Stamina, Weight or Melee.",
      inArea: false,
      done: { when: (ctx) => survivorView(ctx).spentPoints >= 1 },
    },
    {
      id: "campfire",
      text: "Build a Campfire",
      detail: "Learn it in Engrams, craft it (12 thatch, 1 flint, 16 stone, 2 wood), put it on the hotbar, then click to place it. A hatchet gets the most stone from a rock. It warms you at night.",
      inArea: false,
      target: { kind: "rock", within: 120 },
      done: { when: (ctx) => piecesBuilt(ctx, "campfire") >= 1 },
      grants: { xp: { amount: 15 } },
    },
    {
      id: "meat",
      text: "Hunt for meat",
      detail: "Kill a dodo, lystrosaurus or phiomia, then keep hitting the body: the pick takes meat, the hatchet hide.",
      inArea: false,
      target: { kind: "prey", within: 300 },
      done: { when: (ctx, userId) => heldAny(ctx, userId, ["raw_meat", "cooked_meat"]) >= 1 },
    },
    {
      id: "cook",
      text: "Cook meat on the campfire",
      detail: "Stand by your campfire, press I and cook the raw meat. Cooked meat fills you and heals; raw meat makes you sick.",
      inArea: false,
      done: { when: (ctx, userId) => held(ctx, userId, "cooked_meat") >= 1 },
      grants: { xp: { amount: 15 } },
    },
    {
      id: "spear",
      text: "Craft a Spear",
      detail: "Your first weapon: 8 wood, 2 flint, 12 fiber. Raptors and dilophosaurs hunt the open ground.",
      inArea: false,
      done: { when: (ctx, userId) => held(ctx, userId, "spear") >= 1 },
      grants: { xp: { amount: 15 } },
    },
    {
      id: "hut",
      text: "Build a thatch hut",
      detail: "Level 4 opens thatch: a foundation, a doorframe, three walls, a door and a ceiling. A roof keeps the rain off; a door keeps raptors out.",
      inArea: false,
      done: {
        progress: (ctx) =>
          Math.min(piecesBuilt(ctx, "thatch_foundation"), 1) +
          Math.min(piecesBuilt(ctx, "thatch_doorframe"), 1) +
          Math.min(piecesBuilt(ctx, "thatch_wall"), 3) +
          Math.min(piecesBuilt(ctx, "thatch_door"), 1) +
          Math.min(piecesBuilt(ctx, "thatch_ceiling"), 1),
        count: 7,
      },
      grants: { xp: { amount: 40 } },
    },
    {
      id: "saddle",
      text: "Learn the Phiomia Saddle",
      detail: "At level 5 the Phiomia Saddle opens in Engrams. A Phiomia carries more than you and can be ridden.",
      inArea: false,
      done: { when: (ctx) => knowsEngram(ctx, "phiomia_saddle") },
    },
    {
      id: "phiomia",
      text: "Tame a Phiomia",
      detail: "Knock it out and feed it berries. It is skittish: it runs when hit, so stay on it.",
      inArea: false,
      target: { kind: "phiomia", within: 1500 },
      done: { when: (ctx) => tamedA(ctx, "phiomia") },
      grants: { xp: { amount: 60 } },
    },
    {
      id: "ride",
      text: "Saddle and ride your Phiomia",
      detail: "Craft the saddle, put it in your Phiomia's inventory, then press E on it to climb on.",
      inArea: false,
      done: { when: (ctx) => creaturesView(ctx).riding?.species === "phiomia" },
      grants: { xp: { amount: 20 } },
    },
    {
      id: "note",
      text: "Read an explorer note",
      detail: "Survivors before you left notes at the island's landmarks. Each one you read adds to your dossier and gives experience.",
      inArea: false,
      target: { kind: "note", within: 4000 },
      done: { when: (ctx) => dossierView(ctx).notes.seen >= 1 },
    },
    {
      id: "narcotic",
      text: "Make narcotics",
      detail: "At level 6 learn the Mortar and Pestle and Narcotic: 5 narcoberries and 1 spoiled meat. Narcotics keep a big creature asleep while it eats.",
      inArea: false,
      done: { when: (ctx, userId) => held(ctx, userId, "narcotic") >= 1 },
      grants: { xp: { amount: 30 } },
    },
    {
      id: "club",
      text: "Craft a Wooden Club",
      detail: "At level 8 the club opens: it knocks creatures out far faster than fists.",
      inArea: false,
      done: { when: (ctx, userId) => held(ctx, userId, "wooden_club") >= 1 },
    },
    {
      id: "raptor",
      text: "Tame a Raptor",
      detail: "Raptors bite back. Club it down, keep it under with narcotics, and feed it raw meat.",
      inArea: false,
      target: { kind: "raptor", within: 1500 },
      done: { when: (ctx) => tamedA(ctx, "raptor") },
      grants: { xp: { amount: 120 } },
    },
    {
      id: "artifact",
      text: "Take an artifact from a cave",
      detail: "Each cave hides an artifact on a pedestal at its deepest chamber. Caves are dark and full of things that bite.",
      inArea: false,
      target: { kind: "cave", within: 4000 },
      done: { when: (ctx, userId) => cavesOf(ctx).some((cave) => held(ctx, userId, cave.artifact) > 0) },
      grants: { xp: { amount: 200 } },
    },
    {
      id: "tribute",
      text: "Carry the Clever, Hunter and Massive artifacts",
      detail: "The Green Obelisk asks for these three. The Hunter is in the lower south cave, the Clever in the central cave, the Massive in the lava cave.",
      inArea: false,
      target: { kind: "cave", within: 4000 },
      done: { progress: (ctx, userId) => ARTIFACTS.filter((item) => held(ctx, userId, item) > 0).length, count: ARTIFACTS.length },
      grants: { xp: { amount: 300 } },
    },
    {
      id: "broodmother",
      text: "Defeat the Broodmother",
      detail: "Pay the tribute at the Green Obelisk's terminal and bring your strongest tames: everyone within 30 m goes to her lair.",
      inArea: false,
      ...(GREEN_OBELISK === undefined ? {} : { target: { at: [GREEN_OBELISK.position.x, GREEN_OBELISK.position.y, GREEN_OBELISK.position.z] as const } }),
      done: { when: (ctx, userId) => heldAny(ctx, userId, TROPHIES) >= 1 },
    },
  ],
  locate: {
    tree: (ctx, from, within) => nearestHarvestable(ctx, from, within, "strike", "thatch"),
    stones: (ctx, from, within) => nearestHarvestable(ctx, from, within, "pick", "stone"),
    rock: (ctx, from, within) => nearestHarvestable(ctx, from, within, "strike", "flint"),
    bush: (ctx, from, within) => nearestHarvestable(ctx, from, within, "pick", "mejoberry"),
    water: nearestWater,
    dodo: (ctx, from, within) => nearestWild(ctx, "dodo", from, within),
    prey: (ctx, from, within) => nearestWild(ctx, PREY, from, within),
    phiomia: (ctx, from, within) => nearestWild(ctx, "phiomia", from, within),
    raptor: (ctx, from, within) => nearestWild(ctx, "raptor", from, within),
    note: nearestUnreadNote,
    cave: nearestCave,
  },
};

/** The survivor's path, installed with the game's systems. */
export const firstDay = createOnboardingSystem(FIRST_DAY, { grantXp: (ctx, _userId, amount) => grantXp(ctx, amount) });
