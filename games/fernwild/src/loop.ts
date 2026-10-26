import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { LEVEL_STATS } from "./game/data/survivor";
import { BAG, cancelCraft, consume, HOTBAR_SLOTS, learn, levelStat, resetSurvivor, selectSlot, setUpSurvivor, shuttle, startCraft, survivorSave, swing, tickSurvivor, use } from "./game/survivor";
import { setScreen, toggleScreen, type Screen } from "./game/screens";

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
          swing(state, input.aim?.yaw ?? input.yaw);
          return state;
        },
      });
      commands.define("harvest", { apply: (state) => (use(state), state) });
      commands.define("inventory", { apply: (state) => (toggleScreen(state, "inventory"), state) });
      commands.define<{ screen: Screen | null }>("screen", { apply: (state, input) => (setScreen(state, input.screen), state) });
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
];

/** Wake on the authored beach with nothing, like a fresh survivor. */
export function onNewPlayer(ctx: GameContext): void {
  const spawn = authoredSpawnPosition(editorLayers) ?? ORIGIN;
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spawn[0], ctx.world.groundHeightAt(spawn[0], spawn[2]), spawn[2]], rotationY: authoredSpawnRotation(editorLayers), role: "player" });
  setUpSurvivor(ctx);
}
