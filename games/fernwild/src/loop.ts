import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { closeCreature, creaturesSave, feedNarcotic, giveToCreature, mountBite, resetCreatures, setTamingSpeed, spawnCreature, takeFromCreature, tickCreatures, unsaddle, useCreature, whistle } from "./game/creatures";
import { LEVEL_STATS, SURVIVOR } from "./game/data/survivor";
import { BAG, HOTBAR_SLOTS } from "./game/bags";
import { cancelCraft, consume, grantXp, learn, levelStat, resetSurvivor, selectSlot, setUpSurvivor, shuttle, startCraft, survivorSave, swing, tickSurvivor, use } from "./game/survivor";
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
          else if (bite !== "riding" && bite.killed) grantXp(state, SURVIVOR.killXp);
          return state;
        },
      });
      commands.define("harvest", { apply: (state) => (use(state), state) });
      commands.define("inventory", { apply: (state) => (toggleScreen(state, "inventory"), state) });
      commands.define<{ screen: SurvivorScreen | null }>("screen", { apply: (state, input) => (setScreen(state, input.screen), state) });
      for (let slot = 0; slot < HOTBAR_SLOTS; slot += 1) {
        commands.define(`slot${slot + 1}`, { apply: (state) => (selectSlot(state, slot), state) });
      }
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
];

interface Cheat {
  give?: Record<string, number>;
  xp?: number;
  /** Spend stat points: stat id → points. */
  spend?: Record<string, number>;
  tamingSpeed?: number;
  /** Spawn a creature this many metres in front of the survivor. */
  summon?: { species: string; level?: number; distance?: number };
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
}

/** Wake on the authored beach with nothing, like a fresh survivor. */
export function onNewPlayer(ctx: GameContext): void {
  const spawn = authoredSpawnPosition(editorLayers) ?? ORIGIN;
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spawn[0], ctx.world.groundHeightAt(spawn[0], spawn[2]), spawn[2]], rotationY: authoredSpawnRotation(editorLayers), role: "player" });
  setUpSurvivor(ctx);
}
