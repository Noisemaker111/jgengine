import { authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { createGameFlowSystem } from "@jgengine/core/game/gameFlow";
import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { itemTraits } from "./game/data/items";
import { SURVIVOR } from "./game/data/survivor";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { BAG, BAG_SLOTS, canRun, HOTBAR, HOTBAR_SLOTS, survivorPrompts, survivorView } from "./game/survivor";
import { openScreen } from "./game/screens";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { time, world } from "./world";

export const game = defineGame({
  name: "Fernwild",
  simulation: { hz: 60 },
  look: "cinematic",
  mood: "day",
  assets,
  world,
  time,
  content,
  inventories: {
    [BAG]: { slots: BAG_SLOTS, traits: itemTraits },
    [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits },
  },
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    fire: { hold: ["mouse0"], repeatMs: 250 },
    interact: ["KeyE"],
    inventory: ["KeyI", "Tab"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(Array.from({ length: HOTBAR_SLOTS }, (_, slot) => [`slot${slot + 1}`, [`Digit${(slot + 1) % 10}`]])),
  },
  movement: { canSprint: canRun, swim: { speedMultiplier: 0.6 }, feel: { runMultiplier: SURVIVOR.runMultiplier } },
  systems: [createGameFlowSystem(), ...systems],
  loop: { onNewPlayer },
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  persist: { mode: "manual" },
  // The camera starts behind the survivor on the authored spawn facing, so you wash up looking inland.
  prompts: survivorPrompts,
  camera: { perspective: "third", initialYaw: authoredSpawnRotation(editorLayers), frustum: { far: 2400 } },
  capture: {
    play: [{ name: "start", input: {} }],
    probe: (ctx) => {
      const view = survivorView(ctx);
      const me = ctx.scene.entity.get(ctx.player.userId);
      return {
        x: Math.round((me?.position[0] ?? 0) * 10) / 10,
        z: Math.round((me?.position[2] ?? 0) * 10) / 10,
        yaw: Math.round((me?.rotationY ?? 0) * 100) / 100,
        level: view.level,
        aimStrike: view.aim.strike === null ? 0 : 1,
        aimPick: view.aim.pick === null ? 0 : 1,
        xp: view.xp,
        health: Math.round(view.health.value),
        food: Math.round(view.food.value),
        water: Math.round(view.water.value),
        stamina: Math.round(view.stamina.value),
        weight: view.weight.value,
        thatch: ctx.player.inventory.count(BAG, "thatch"),
        wood: ctx.player.inventory.count(BAG, "wood"),
        stone: ctx.player.inventory.count(BAG, "stone"),
        fiber: ctx.player.inventory.count(BAG, "fiber"),
        flint: ctx.player.inventory.count(BAG, "flint"),
        engramPoints: view.engramPoints,
        crafting: view.queue.length,
        screen: openScreen(ctx) === null ? 0 : 1,
        picks: ctx.player.inventory.count(HOTBAR, "stone_pick") + ctx.player.inventory.count(BAG, "stone_pick"),
      };
    },
  },
});
