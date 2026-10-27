import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { createGameFlowSystem } from "@jgengine/core/game/gameFlow";
import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { basePrompts, baseView } from "./game/base";
import { cavePrompts, cavesOf, cavesView } from "./game/caves";
import { bodyPrompts, bodyView } from "./game/deathBody";
import { breedingPrompts, breedingView } from "./game/breeding";
import { broodView, obeliskPrompts } from "./game/broodmother";
import { BROOD_PHASES } from "./game/data/bosses";
import { creaturePrompts, creaturesView } from "./game/creatures";
import { content } from "./game/content";
import { itemTraits } from "./game/data/items";
import { SURVIVOR } from "./game/data/survivor";
import { entityModels, objectModels, scatterModels } from "./game/models";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./game/bags";
import { nearestSupplyDrop, supplyDropPrompts } from "./game/supplyDrops";
import { canRun, survivorPrompts, survivorView } from "./game/survivor";
import { firstDay } from "./game/onboarding";
import { openScreen } from "./game/screens";
import { GameUI } from "./game/ui/GameUI";
import { BaseWorld } from "./game/ui/BaseWorld";
import { onNewPlayer, survivorStart, systems } from "./loop";
import { time, world } from "./world";

const SPAWN_YAW = authoredSpawnRotation(editorLayers);
const SPAWN_AT = authoredSpawnPosition(editorLayers);

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
    // The number keys use this inventory's slots.
    [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits, hud: "hotbar" },
  },
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    fire: { hold: ["mouse0"], repeatMs: 250 },
    interact: ["KeyE"],
    // ARK's whistles: T for follow, U for stay.
    whistleFollow: ["KeyT"],
    whistleStay: ["KeyU"],
    inventory: ["KeyI", "Tab"],
    // Building: R turns the ghost, G demolishes the piece in front.
    rotateBuild: ["KeyR"],
    demolish: ["KeyG"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(Array.from({ length: HOTBAR_SLOTS }, (_, slot) => [`slot${slot + 1}`, [`Digit${(slot + 1) % 10}`]])),
  },
  movement: { canSprint: canRun, swim: { speedMultiplier: 0.6 }, feel: { runMultiplier: SURVIVOR.runMultiplier } },
  systems: [createGameFlowSystem(), ...systems, firstDay],
  newGame: survivorStart,
  loop: { onNewPlayer },
  GameUI,
  WorldOverlay: BaseWorld,
  editorLayers,
  entityModels,
  objectModels,
  sceneScatterModels: scatterModels,
  // The whole Island's forests, rocks and ore: about 33k placements, all drawn.
  sceneScatterBudget: 40_000,
  persist: { mode: "manual" },
  // The camera starts behind the survivor on the authored spawn facing, so you wash up looking inland.
  prompts: (ctx) => [...survivorPrompts(ctx), ...creaturePrompts(ctx), ...basePrompts(ctx), ...cavePrompts(ctx), ...bodyPrompts(ctx), ...supplyDropPrompts(ctx), ...breedingPrompts(ctx), ...obeliskPrompts(ctx)],
  camera: { perspective: "third", initialYaw: authoredSpawnRotation(editorLayers), frustum: { far: 2400 } },
  capture: {
    play: [{ name: "start", input: {} }],
    probe: (ctx) => {
      const view = survivorView(ctx);
      const creatures = creaturesView(ctx);
      const base = baseView(ctx);
      const caves = cavesView(ctx);
      const body = bodyView(ctx);
      const crate = nearestSupplyDrop(ctx);
      const breeding = breedingView(ctx);
      const brood = broodView(ctx);
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
        healthMax: Math.round(view.health.max),
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
        creatures: creatures.count,
        aimedDown: creatures.aimed?.taming?.unconscious === true ? 1 : 0,
        aimedTorpor: creatures.aimed?.taming?.torpor ?? 0,
        // Metres between the survivor's and the aimed creature's centres, to a decimetre; 0 with nothing aimed.
        aimedGap: creatures.aimed === null || me === null ? 0 : Math.round((ctx.scene.entity.distance(me.id, creatures.aimed.id) ?? 0) * 10) / 10,
        down: creatures.down,
        tamed: creatures.tamed,
        riding: creatures.riding === null ? 0 : 1,
        saddled: creatures.aimed?.saddled === true ? 1 : 0,
        tameLevel: creatures.viewing?.level ?? creatures.riding?.level ?? 0,
        tamePoints: creatures.viewing?.growth?.unspent ?? 0,
        tameHealthMax: creatures.viewing?.health.max ?? 0,
        mountStamina: creatures.riding?.stamina.value ?? 0,
        mountStaminaMax: creatures.riding?.stamina.max ?? 0,
        structures: base.count,
        // 1 a valid ghost, 0 a blocked one, -1 nothing in hand to build.
        ghost: base.ghost === null ? -1 : base.ghost.valid ? 1 : 0,
        ghostSnapped: base.ghost?.mode === "snap" ? 1 : 0,
        aimedStructureHealth: base.aimed?.health ?? 0,
        doorsOpen: base.open,
        // Metres the survivor stands past the first foundation's centre and past the first doorframe, along the
        // spawn facing: negative is short of it.
        pastFloor: pastAlongSpawn(me?.position, base.floor),
        pastDoor: pastAlongSpawn(me?.position, base.doorway),
        // Metres the survivor stands right of the first doorframe's centre, across the spawn facing.
        acrossDoor: acrossSpawn(me?.position, base.doorway),
        // Metres the survivor stands right of where it woke, across the spawn facing.
        acrossSpawn: acrossSpawn(me?.position, SPAWN_AT),
        // Metres into the cave the survivor stands in, to a decimetre; -1 outside every cave.
        caveDepth: caves.inside === null ? -1 : Math.round(caves.inside.depth * 10) / 10,
        // Artifacts carried in the bag and on the hotbar, and pedestals still holding one.
        artifacts: cavesOf(ctx).reduce((sum, cave) => sum + ctx.player.inventory.count(BAG, cave.artifact) + ctx.player.inventory.count(HOTBAR, cave.artifact), 0),
        pedestals: caves.caves.filter((cave) => cave.artifact !== null).length,
        // 1 while an artifact's pedestal is in reach, so E would take it.
        atPedestal: cavePrompts(ctx).length > 0 ? 1 : 0,
        // Hotbar slot in hand, 1-based; 0 bare-handed.
        holding: view.activeSlot === null ? 0 : view.activeSlot + 1,
        // Metres to the survivor's own body, to a decimetre, and the stacks it holds; -1 and 0 with no body lying.
        bodyDistance: body === null ? -1 : Math.round(body.distance * 10) / 10,
        bodyStacks: body?.stacks ?? 0,
        // 1 while your body is in reach, so E would take your things back.
        atBody: bodyPrompts(ctx).length > 0 ? 1 : 0,
        // Stacks the survivor carries in the bag and on the hotbar.
        carrying: [BAG, HOTBAR].reduce((sum, id) => sum + ctx.player.inventory.state(id).slots.filter((slot) => slot !== null).length, 0),
        // Air temperature where the survivor stands, °C, and how hard rain and snow fall there, in percent.
        temperature: view.temperature,
        rain: Math.round(ctx.environment.sample(me?.position[0] ?? 0, me?.position[2] ?? 0).rain * 100),
        snow: Math.round(ctx.environment.sample(me?.position[0] ?? 0, me?.position[2] ?? 0).snow * 100),
        // 1 while a roof, ceiling or rock is overhead.
        sheltered: view.sheltered ? 1 : 0,
        // The nearest supply crate: metres away, metres still to fall (0 once down), 1 once landed; -1, -1, 0 with none.
        crateDistance: crate === null ? -1 : Math.round(crate.distance),
        crateAltitude: crate === null ? -1 : Math.round(crate.altitude),
        crateLanded: crate?.landed === true ? 1 : 0,
        // 1 while a landed crate is in reach, so E would open it.
        atCrate: supplyDropPrompts(ctx).length > 0 ? 1 : 0,
        // Breeding: 1 while a pair is mating; eggs lying, the nearest's incubation and health in percent and its °C;
        // babies growing, the first one's maturation and imprint in percent, 1 while it asks for care, its size in percent.
        mating: breeding.mating ? 1 : 0,
        eggs: breeding.eggs,
        eggProgress: breeding.egg === null ? -1 : Math.round(breeding.egg.progress * 100),
        eggHealth: breeding.egg === null ? -1 : Math.round(breeding.egg.health * 100),
        eggTemperature: breeding.egg === null ? -99 : Math.round(breeding.egg.temperature),
        babies: breeding.babies,
        babyMatured: breeding.baby === null ? -1 : Math.round(breeding.baby.matured * 100),
        babyImprint: breeding.baby === null ? -1 : Math.round(breeding.baby.imprint * 100),
        babyWants: breeding.baby?.wants === null || breeding.baby === null ? 0 : 1,
        babySize: breeding.baby === null ? -1 : Math.round(breeding.baby.size * 100),
        atBaby: breedingPrompts(ctx).length > 0 ? 1 : 0,
        // The Broodmother: 0 nothing summoned, 1 the portal counting down, 2 the fight, 3 won and waiting to go back;
        // 1 while the survivor is in her lair; her health and phase (1-3) and her Araneo alive; 1 while webbed;
        // the tames in the fight with the survivor; 1 at the obelisk's terminal.
        brood: ["idle", "portal", "fight", "victory"].indexOf(brood.phase),
        inLair: brood.inside ? 1 : 0,
        broodHealth: brood.boss === null ? -1 : Math.round(brood.boss.health * 1000) / 10,
        broodPhase: brood.boss?.phase === null || brood.boss === null ? 0 : BROOD_PHASES.findIndex((phase) => phase.id === brood.boss!.phase) + 1,
        araneo: brood.brood,
        webbed: view.webbed ? 1 : 0,
        lairTames: brood.companions,
        atObelisk: obeliskPrompts(ctx).length > 0 ? 1 : 0,
        element: ctx.player.inventory.count(BAG, "element"),
      };
    },
  },
});

/** Metres `at` lies right of `mark` across the spawn facing, to a centimetre; 0 when either is missing. */
function acrossSpawn(at: readonly number[] | undefined, mark: readonly number[] | null): number {
  if (at === undefined || mark === null) return 0;
  // Looking along the facing (sin, cos), the screen's right is (-cos, sin) in XZ.
  return Math.round(((at[2]! - mark[2]!) * Math.sin(SPAWN_YAW) - (at[0]! - mark[0]!) * Math.cos(SPAWN_YAW)) * 100) / 100;
}

/** Metres `at` lies past `mark` along the spawn facing, to a decimetre; 0 when either is missing. */
function pastAlongSpawn(at: readonly number[] | undefined, mark: readonly number[] | null): number {
  if (at === undefined || mark === null) return 0;
  return Math.round(((at[0]! - mark[0]!) * Math.sin(SPAWN_YAW) + (at[2]! - mark[2]!) * Math.cos(SPAWN_YAW)) * 10) / 10;
}
