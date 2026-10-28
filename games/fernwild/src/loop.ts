import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { baseSave, demolish, resetBase, rotateBuild, tickBase, useStructure } from "./game/base";
import { cavesOf, cavesSave, resetCaves, takeArtifact } from "./game/caves";
import { bodiesSave, recoverBody, resetBodies, tickBodies } from "./game/deathBody";
import { breedingSave, careForBaby, resetBreeding, setBreedingSpeed, tickBreeding } from "./game/breeding";
import { broodSave, resetBroodmother, setBroodHealth, summonBroodmother, tickBroodmother, useObelisk } from "./game/broodmother";
import { closeCreature, creaturesSave, destroyWild, feedNarcotic, forceTame, giveTameXp, giveToCreature, levelTame, mountBite, resetCreatures, setTamingSpeed, spawnCreature, takeFromCreature, tameSummoned, tickCreatures, toggleMating, unsaddle, useCreature, whistle } from "./game/creatures";
import { TAME_STATS } from "./game/data/species";
import { LEVEL_STATS, SURVIVOR } from "./game/data/survivor";
import { BAG, HOTBAR } from "./game/bags";
import { closeNote, dossierSave, readNote, resetDossier, tickDossier } from "./game/dossier";
import { callSupplyDrop, openCrate, resetSupplyDrops, supplyDropsSave, tickSupplyDrops } from "./game/supplyDrops";
import type { NewGameConfig } from "@jgengine/core/game/newGame";
import { START } from "./game/data/start";
import { cancelCraft, consume, grantXp, heldItem, learn, learnFree, levelStat, resetSurvivor, selectSlot, setUpSurvivor, shuttle, startCraft, survivorSave, swing, takeOff, tickSurvivor, use, wearArmour } from "./game/survivor";
import { setScreen, toggleExtendedHud, toggleScreen, type SurvivorScreen } from "./game/screens";

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
      commands.define("hudDetail", { apply: (state) => (toggleExtendedHud(state), state) });
      // First person looks out of the survivor's own body, so the arms and the tool in hand stay in view.
      commands.define("view", {
        apply(state) {
          state.camera.setRig(state.camera.rig()?.kind === "first" ? null : "first", { firstPerson: { body: true, viewmodel: false } });
          return state;
        },
      });
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
      commands.define<{ slot: string }>("takeOff", { apply: (state, input) => (takeOff(state, input.slot), state) });
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
  defineSystem({
    id: "caves",
    create(ctx) {
      // The rock is laid out and made solid as the world starts, not on the first step inside.
      cavesOf(ctx);
      ctx.game.commands.define("takeArtifact", { apply: (state) => (takeArtifact(state), state) });
    },
    save: cavesSave,
    reset: resetCaves,
  }),
  defineSystem({
    id: "bodies",
    tick: { type: "fixed", rate: 2 },
    create(ctx) {
      ctx.game.commands.define("recoverBody", { apply: (state) => (recoverBody(state), state) });
    },
    update: tickBodies,
    save: bodiesSave,
    reset: resetBodies,
  }),
  defineSystem({
    id: "supplyDrops",
    tick: { type: "fixed", rate: 2 },
    create(ctx) {
      ctx.game.commands.define("openCrate", { apply: (state) => (openCrate(state), state) });
    },
    update: tickSupplyDrops,
    save: supplyDropsSave,
    reset: resetSupplyDrops,
  }),
  defineSystem({
    id: "broodmother",
    tick: { type: "fixed", rate: 10 },
    create(ctx) {
      ctx.game.commands.define("obeliskUse", { apply: (state) => (useObelisk(state), state) });
      ctx.game.commands.define<{ tier: string }>("summonBoss", { apply: (state, input) => (summonBroodmother(state, input.tier), state) });
    },
    update: tickBroodmother,
    save: broodSave,
    reset: resetBroodmother,
  }),
  defineSystem({
    id: "dossier",
    tick: { type: "fixed", rate: 4 },
    create(ctx) {
      ctx.game.commands.define("readNote", { apply: (state) => (readNote(state), state) });
      ctx.game.commands.define("closeNote", { apply: (state) => (closeNote(state), state) });
    },
    update: tickDossier,
    save: dossierSave,
    reset: resetDossier,
  }),
  defineSystem({
    id: "breeding",
    tick: { type: "fixed", rate: 2 },
    create(ctx) {
      ctx.game.commands.define("toggleMating", { apply: (state) => (toggleMating(state), state) });
      ctx.game.commands.define("careForBaby", { apply: (state) => (careForBaby(state), state) });
    },
    update: tickBreeding,
    save: breedingSave,
    reset: resetBreeding,
  }),
];

interface Cheat {
  give?: Record<string, number>;
  xp?: number;
  /** Spend stat points: stat id → points. */
  spend?: Record<string, number>;
  tamingSpeed?: number;
  /** Spawn a creature this many metres in front of the survivor, and `side` metres to their right. */
  summon?: { species: string; level?: number; distance?: number; side?: number; sex?: "female" | "male"; tamed?: boolean; mating?: boolean };
  /** ARK's breeding multipliers (hatch, maturation, mating interval, imprint interval) all at once. */
  breedingSpeed?: number;
  /** Tame the wild creature in front at once. */
  forceTame?: boolean;
  /** XP for the mount under you, or the tame whose inventory is open. */
  tameXp?: number;
  /** Move these items' stacks from the bag to the hotbar, in order (the double-click, for proofs). */
  toHotbar?: string[];
  /** Stand `back` metres outside a cave's mouth (negative: that far inside), facing in, the camera behind. */
  goto?: { cave: string; back?: number };
  /** ARK's admin kill: the survivor dies where they stand. */
  kill?: boolean;
  /** ARK's admin DestroyWildDinos: every wild creature gone; their zones refill later. */
  destroyWild?: boolean;
  /** ARK's admin settimeofday, as a whole world clock: jump to this many seconds, weather schedule and all. */
  clock?: number;
  /** ARK's admin SetPlayerPos: stand on the ground at this x, z, facing this yaw (radians) when given, the camera behind. */
  teleport?: readonly [number, number] | readonly [number, number, number];
  /** Send a supply crate from the drop site nearest the survivor, of this tier (true: the site's own odds). */
  drop?: string | true;
  /** ARK's admin SetHealth on the Broodmother in her lair: her health to this share of its max. */
  broodHealth?: number;
  /** Wear these armour items from the bag, as a double-click would. */
  wear?: readonly string[];
}

function cheat(ctx: GameContext, input: Cheat): void {
  for (const [itemId, count] of Object.entries(input.give ?? {})) ctx.player.inventory.put(BAG, itemId, count);
  if (input.xp !== undefined) grantXp(ctx, input.xp);
  for (const [stat, points] of Object.entries(input.spend ?? {})) {
    const known = LEVEL_STATS.find((entry) => entry.id === stat);
    for (let point = 0; known !== undefined && point < points; point += 1) levelStat(ctx, known.id);
  }
  if (input.tamingSpeed !== undefined) setTamingSpeed(ctx, input.tamingSpeed);
  if (input.breedingSpeed !== undefined) setBreedingSpeed(ctx, input.breedingSpeed);
  if (input.kill === true) ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: 0 });
  if (input.destroyWild === true) destroyWild(ctx);
  if (input.clock !== undefined) ctx.time.hydrate({ ...ctx.time.snapshot(), now: input.clock });
  if (input.teleport !== undefined) {
    const [x, z, facing] = input.teleport;
    ctx.scene.entity.setPose(ctx.player.userId, { position: [x, ctx.world.groundHeightAt(x, z) + 0.5, z], ...(facing === undefined ? {} : { rotationY: facing }) });
    if (facing !== undefined) ctx.camera.turnTo(facing);
  }
  if (input.drop !== undefined) callSupplyDrop(ctx, input.drop === true ? undefined : input.drop);
  if (input.broodHealth !== undefined) setBroodHealth(ctx, input.broodHealth);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (input.summon !== undefined && me !== null) {
    const distance = input.summon.distance ?? 4;
    const side = input.summon.side ?? 0;
    const sin = Math.sin(me.rotationY);
    const cos = Math.cos(me.rotationY);
    const at = [me.position[0] + sin * distance - cos * side, me.position[2] + cos * distance + sin * side] as const;
    const id = spawnCreature(ctx, input.summon.species, at, {
      ...(input.summon.level === undefined ? {} : { level: input.summon.level }),
      ...(input.summon.sex === undefined ? {} : { sex: input.summon.sex }),
    });
    if (id !== null && input.summon.tamed === true) tameSummoned(ctx, id, input.summon.mating === true);
  }
  const cave = input.goto === undefined ? undefined : cavesOf(ctx).find((entry) => entry.id === input.goto!.cave);
  if (cave !== undefined && me !== null) {
    // Facing from the mouth towards the chamber, the way someone walking in looks.
    const mouth = cave.layout.path[0]!;
    const deep = cave.layout.chamber.center;
    const length = Math.hypot(deep[0] - mouth[0], deep[1] - mouth[1]) || 1;
    const along = [(deep[0] - mouth[0]) / length, (deep[1] - mouth[1]) / length] as const;
    const back = input.goto!.back ?? 4;
    const x = mouth![0] - along[0] * back;
    const z = mouth![1] - along[1] * back;
    const facing = Math.atan2(along[0], along[1]);
    ctx.scene.entity.setPose(me.id, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: facing });
    ctx.camera.turnTo(facing);
  }
  if (input.forceTame === true) forceTame(ctx);
  if (input.tameXp !== undefined) giveTameXp(ctx, input.tameXp);
  for (const itemId of input.wear ?? []) {
    const slot = ctx.player.inventory.state(BAG).slots.findIndex((stack) => stack?.itemId === itemId);
    if (slot >= 0) wearArmour(ctx, BAG, slot);
  }
  for (const itemId of input.toHotbar ?? []) {
    const slot = ctx.player.inventory.state(BAG).slots.findIndex((stack) => stack?.itemId === itemId);
    if (slot >= 0) shuttle(ctx, BAG, slot);
  }
}

/** The fresh survivor's start, built by the engine from `data/start.ts`. */
export const survivorStart: NewGameConfig ={ state: START, unlock: (ctx, engramId) => learnFree(ctx, engramId) };

/** Wake on the authored beach with nothing, like a fresh survivor. */
export function onNewPlayer(ctx: GameContext): void {
  const spawn = authoredSpawnPosition(editorLayers) ?? ORIGIN;
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spawn[0], ctx.world.groundHeightAt(spawn[0], spawn[2]), spawn[2]], rotationY: authoredSpawnRotation(editorLayers), role: "player" });
  setUpSurvivor(ctx);
}
