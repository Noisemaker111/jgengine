import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { baseSave, demolish, resetBase, rotateBuild, tickBase, useStructure } from "./game/base";
import { closeCreature, creaturesSave, feedNarcotic, forceTame, giveTameXp, giveToCreature, levelTame, mountBite, resetCreatures, setTamingSpeed, spawnCreature, takeFromCreature, tickCreatures, unsaddle, useCreature, whistle } from "./game/creatures";
import { TAME_STATS } from "./game/data/species";
import { LEVEL_STATS, SURVIVOR } from "./game/data/survivor";
import { BAG, HOTBAR } from "./game/bags";
import { cancelCraft, consume, grantXp, heldItem, learn, levelStat, resetSurvivor, selectSlot, setUpSurvivor, shuttle, startCraft, survivorSave, swing, tickSurvivor, use } from "./game/survivor";
import { setScreen, toggleScreen, type SurvivorScreen } from "./game/screens";

const ORIGIN: [number, number, number] = [0, 0, 0];

type Aim = { yaw?: number };

/** The survivor: vitals, gathering, crafting, engrams and levels, ticked ten times a second of game time. */
export const systems = [
  defineSystem({
    id: "survivor",
    tick: { type: "fixed", rate: 10 },
    create(ctx) {
      const commands = ctx.game.commands;
      commands.define<{ aim?: Aim; yaw?: number }>("fire", {
        apply(state, input) {
          // Riding, the click is the mount's bite; on foot, the survivor's swing.
          const bite = mountBite(state);
          if (bite === null) swing(state, input.aim?.yaw ?? input.yaw);
          else if (bite !== "riding" && bite.killed) grantXp(state, bite.xp);
          return state;
        },
      });
      commands.define("harvest", { apply: (state) => (use(state), state) });
      commands.define("inventory", { apply: (state) => (toggleScreen(state, "inventory"), state) });
      commands.define<{ screen: SurvivorScreen | null }>("screen", { apply: (state, input) => (setScreen(state, input.screen), state) });
      // The number keys reach a game through item use: equip the tool or structure in that slot, or eat what is there.
      ctx.item.use.register({
        hotbar: {
          apply(state, input) {
            const slot = state.player.inventory.state(HOTBAR).slots.findIndex((stack) => stack?.itemId === input.itemId);
            if (slot >= 0) selectSlot(state, slot);
            return { state };
          },
        },
      });
      commands.define<{ recipeId: string; count?: number }>("craft", { apply: (state, input) => (startCraft(state, input.recipeId, input.count ?? 1), state) });
      commands.define<{ jobId: string }>("cancelCraft", { apply: (state, input) => (cancelCraft(state, input.jobId), state) });
      commands.define<{ engramId: string }>("learn", { apply: (state, input) => (learn(state, input.engramId), state) });
      commands.define<{ stat: string }>("levelStat", {
        apply(state, input) {
          const stat = LEVEL_STATS.find((entry) => entry.id === input.stat);
          if (stat !== undefined) levelStat(state, stat.id);
          return state;
        },
      });
      commands.define<{ inventoryId?: string; slot: number }>("consume", { apply: (state, input) => (consume(state, input.inventoryId ?? BAG, input.slot), state) });
      commands.define<{ inventoryId: string; slot: number }>("shuttle", { apply: (state, input) => (shuttle(state, input.inventoryId, input.slot), state) });
    },
    update: tickSurvivor,
    save: survivorSave,
    reset: resetSurvivor,
  }),
  defineSystem({
    id: "creatures",
    tick: { type: "fixed", rate: 30 },
    create(ctx) {
      const commands = ctx.game.commands;
      commands.define("creatureUse", { apply: (state) => (useCreature(state), state) });
      commands.define("closeCreature", { apply: (state) => (closeCreature(state), state) });
      commands.define("whistleFollow", { apply: (state) => (whistle(state, "follow"), state) });
      commands.define("whistleStay", { apply: (state) => (whistle(state, "stay"), state) });
      commands.define<{ inventoryId: string; slot: number }>("giveCreature", { apply: (state, input) => (giveToCreature(state, input.inventoryId, input.slot), state) });
      commands.define<{ slot: number }>("takeCreature", { apply: (state, input) => (takeFromCreature(state, input.slot), state) });
      commands.define<{ stat: string }>("levelTame", {
        apply(state, input) {
          const stat = TAME_STATS.find((entry) => entry.id === input.stat);
          if (stat !== undefined) levelTame(state, stat.id);
          return state;
        },
      });
      commands.define("unsaddle", { apply: (state) => (unsaddle(state), state) });
      commands.define<{ itemId: string }>("feedNarcotic", { apply: (state, input) => (feedNarcotic(state, input.itemId), state) });
      // ARK's admin console, for proofs: give items, levels, a taming speed, a creature in front of you.
      commands.define<Cheat>("cheat", { apply: (state, input) => (cheat(state, input), state) });
    },
    update(ctx, dt) {
      for (const event of tickCreatures(ctx, dt)) if (event.type === "tamed") grantXp(ctx, SURVIVOR.tameXp);
    },
    save: creaturesSave,
    reset: resetCreatures,
  }),
  defineSystem({
    id: "base",
    tick: { type: "fixed", rate: 30 },
    create(ctx) {
      const commands = ctx.game.commands;
      commands.define("structureUse", { apply: (state) => (useStructure(state), state) });
      commands.define("rotateBuild", { apply: (state) => (rotateBuild(state), state) });
      commands.define("demolish", { apply: (state) => (demolish(state), state) });
    },
    update: (ctx) => tickBase(ctx, heldItem(ctx)),
    save: baseSave,
    reset: resetBase,
  }),
];

interface Cheat {
  give?: Record<string, number>;
  xp?: number;
  /** Spend stat points: stat id → points. */
  spend?: Record<string, number>;
  tamingSpeed?: number;
  /** Spawn a creature this many metres in front of the survivor. */
  summon?: { species: string; level?: number; distance?: number };
  /** Tame the wild creature in front at once. */
  forceTame?: boolean;
  /** XP for the mount under you, or the tame whose inventory is open. */
  tameXp?: number;
  /** Move these items' stacks from the bag to the hotbar, in order (the double-click, for proofs). */
  toHotbar?: string[];
}

function cheat(ctx: GameContext, input: Cheat): void {
  for (const [itemId, count] of Object.entries(input.give ?? {})) ctx.player.inventory.put(BAG, itemId, count);
  if (input.xp !== undefined) grantXp(ctx, input.xp);
  for (const [stat, points] of Object.entries(input.spend ?? {})) {
    const known = LEVEL_STATS.find((entry) => entry.id === stat);
    for (let point = 0; known !== undefined && point < points; point += 1) levelStat(ctx, known.id);
  }
  if (input.tamingSpeed !== undefined) setTamingSpeed(ctx, input.tamingSpeed);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (input.summon !== undefined && me !== null) {
    const distance = input.summon.distance ?? 4;
    const at = [me.position[0] + Math.sin(me.rotationY) * distance, me.position[2] + Math.cos(me.rotationY) * distance] as const;
    spawnCreature(ctx, input.summon.species, at, input.summon.level === undefined ? {} : { level: input.summon.level });
  }
  if (input.forceTame === true) forceTame(ctx);
  if (input.tameXp !== undefined) giveTameXp(ctx, input.tameXp);
  for (const itemId of input.toHotbar ?? []) {
    const slot = ctx.player.inventory.state(BAG).slots.findIndex((stack) => stack?.itemId === itemId);
    if (slot >= 0) shuttle(ctx, BAG, slot);
  }
}

/** Wake on the authored beach with nothing, like a fresh survivor. */
export function onNewPlayer(ctx: GameContext): void {
  const spawn = authoredSpawnPosition(editorLayers) ?? ORIGIN;
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spawn[0], ctx.world.groundHeightAt(spawn[0], spawn[2]), spawn[2]], rotationY: authoredSpawnRotation(editorLayers), role: "player" });
  setUpSurvivor(ctx);
}
