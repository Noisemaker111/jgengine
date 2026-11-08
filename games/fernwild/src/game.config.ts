import { ambientFauna } from "./game/ambientFauna";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { authoredSpawnPosition, authoredSpawnRotation } from "@jgengine/core/world/authoredSpawn";
import { createGameFlowSystem, menuPane } from "@jgengine/core/game/gameFlow";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { fernwildKit } from "./art/look";
import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
// One name per line in the long imports: a lane that adds a name adds a line, which a rebase keeps beside
// another lane's (scripts/generated-rebase.ts); two lanes editing one long line was a hand rebase each time.
import {
  baseGhost,
  basePrompts,
  baseView,
  fuelNear,
  lastPiece,
  piecesBuilt,
  stations,
  storeView,
} from "./game/base";
import { cavePrompts, cavesOf, cavesView } from "./game/caves";
import { eggPrompts, eggsOnGround } from "./game/eggs";
import { EGG_SIZES, eggItem, KIBBLE_TIERS, kibbleItem } from "./game/data/kibble";
import { bodyPrompts, bodyView } from "./game/deathBody";
import { breedingPrompts, breedingView } from "./game/breeding";
import { broodView, obeliskPrompts } from "./game/broodmother";
import { BROOD_PHASES, BROOD_TIERS } from "./game/data/bosses";
import {
  airliftView,
  awakeTamingProgress,
  creatureCard,
  creaturePrompts,
  creaturesView,
  lastTame,
  lineageStrays,
  mountCanFly,
  mountSwim,
  nearestCarcass,
  nearestTame,
  nearestTameStance,
  nearestThreat,
  nearestWild,
  speciesNear,
  wildCountNear,
  wildHurtNear,
  wildLevelNear,
} from "./game/creatures";
import { tameFood } from "./game/tameHunger";
import { STRUCTURES } from "./game/data/structures";
import { content } from "./game/content";
import { itemTraits } from "./game/data/items";
import { SURVIVOR } from "./game/data/survivor";
import { entityModels, objectModels, scatterModels, rockSolids } from "./game/models";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./game/bags";
import { nearestSupplyDrop, supplyDropPrompts } from "./game/supplyDrops";
import { canRun, nearestHarvestable, survivorPrompts, survivorView } from "./game/survivor";
import { CLIMB_SPEED } from "./game/data/flight";
import { SWIM_SLOW } from "./game/data/swim";
import { firstDay, PREY } from "./game/onboarding";
import { dossierView, nearestUnreadNote, notePrompts } from "./game/dossier";
import { openScreen } from "./game/screens";
import { GameUI } from "./game/ui/GameUI";
import { BaseWorld } from "./game/ui/BaseWorld";
import { onNewPlayer, survivorStart, systems } from "./loop";
import { time, world } from "./world";

const SPAWN_YAW = authoredSpawnRotation(editorLayers);
const SPAWN_AT = authoredSpawnPosition(editorLayers);
/** The closest egg to `here` within `within` metres, or null. */
function nearestEgg(eggs: readonly { at: readonly [number, number, number] }[], here: readonly [number, number, number], within: number): readonly [number, number, number] | null {
  let best: readonly [number, number, number] | null = null;
  let bestDistance = within;
  for (const egg of eggs) {
    const distance = Math.hypot(egg.at[0] - here[0], egg.at[2] - here[2]);
    if (distance <= bestDistance) {
      best = egg.at;
      bestDistance = distance;
    }
  }
  return best;
}

const PIECES: ReadonlySet<string> = new Set(STRUCTURES.map((entry) => entry.id));

/** Animals only the northern snow keeps, and only the south-coast beach keeps: what the biome probes count. */
const SNOW_KINDS = new Set(["woolly_rhino", "mammoth", "sabertooth", "ovis", "kairuku", "yutyrannus", "purlovia"]);
const COAST_KINDS = new Set(["dodo", "phiomia", "lystrosaurus", "parasaur", "dilophosaur", "moschops", "compy", "pachy"]);

export const game = defineGame({
  name: "Fernwild",
  simulation: { hz: 60 },
  rendering: {
    look: "cinematic",
    mood: { preset: "day", sun: { elevation: 58, color: "#fff0d0" }, horizonColor: "#b8dcd8", fog: { near: 180, far: 900 } },
    environmentSource: hdriEnvironment("tropical-clouds", { intensity: 0.9 }),
    postProcessing: {
      toneMapping: "aces",
      bloom: { strength: 0.25, radius: 0.6, threshold: 0.9 },
      ao: { radius: 1.1, intensity: 1.2, distanceFalloff: 3, blend: 1 },
      grade: { vignette: 0.12, lut: lutGrade("tropical-lush") },
    },
  },
  assets,
  uiKit: fernwildKit,
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
    // ARK's crouch, which under water swims down; Space swims up.
    crouch: ["KeyC"],
    fire: { hold: ["mouse0"], repeatMs: 250 },
    interact: ["KeyE"],
    // ARK's whistles: T for follow, U for stay.
    whistleFollow: ["KeyT"],
    whistleStay: ["KeyU"],
    // ARK's flyer grab: F lifts the creature below in the talons, and lets it go.
    airlift: ["KeyF"],
    inventory: ["KeyI", "Tab"],
    // ARK's extended HUD: the numbers under the vital icons.
    hudDetail: ["KeyH"],
    // ARK's third/first-person swap.
    view: ["KeyV"],
    // Building: R turns the ghost, G demolishes the piece in front.
    rotateBuild: ["KeyR"],
    demolish: ["KeyG"],
    pause: ["Escape", "KeyP"],
    ...Object.fromEntries(Array.from({ length: HOTBAR_SLOTS }, (_, slot) => [`slot${slot + 1}`, [`Digit${(slot + 1) % 10}`]])),
  },
  controls: {
    // A ridden flyer hovers: Space climbs, C dives, WASD flies at the mount's own speed; out of stamina it drops.
    movement: { canSprint: canRun, swim: { speedMultiplier: SWIM_SLOW, dive: true }, feel: { runMultiplier: SURVIVOR.runMultiplier }, flight: { mode: "hover", verticalSpeed: CLIMB_SPEED, canFly: mountCanFly } },
    // The camera starts behind the survivor on the authored spawn facing, so you wash up looking inland.
    prompts: (ctx) => [...survivorPrompts(ctx), ...creaturePrompts(ctx), ...basePrompts(ctx), ...cavePrompts(ctx), ...bodyPrompts(ctx), ...supplyDropPrompts(ctx), ...eggPrompts(ctx), ...breedingPrompts(ctx), ...obeliskPrompts(ctx), ...notePrompts(ctx)],
  },
  systems: [createGameFlowSystem(), ...systems, firstDay],
  newGame: survivorStart,
  loop: { onNewPlayer },
  GameUI,
  scene: {
    WorldOverlay: BaseWorld,
    editorLayers,
    entityModels,
    objectModels,
    ambientLife: { fauna: ambientFauna },
    // Grass, flowers and plants step down to the levels `games:provision build` wrote, chunk by chunk,
    // once they span 6% and then 2% of the screen.
    visibility: { meshLods: { screenSizes: [0.06, 0.02], hysteresis: 0.15 } },
  },
  sceneScatterModels: scatterModels,
  // The whole Island's forests, rocks and ore plus the dense south beach: about 48k placements, all drawn.
  sceneScatterBudget: 60_000,
  sceneScatterSolids: rockSolids,
  persist: { mode: "manual" },
  camera: {
    perspective: "third",
    orbit: { initialYaw: authoredSpawnRotation(editorLayers) },
    lens: { frustum: { far: 2400 } },
  },
  capture: {
    play: [{ name: "start", input: {} }],
    // Boot and stay on the title, as the page opens.
    states: { title: [] },
    probe: (ctx) => {
      const view = survivorView(ctx);
      const creatures = creaturesView(ctx);
      const base = baseView(ctx);
      const caves = cavesView(ctx);
      const body = bodyView(ctx);
      const crate = nearestSupplyDrop(ctx);
      const breeding = breedingView(ctx);
      const babyAt = breeding.baby === null ? null : (ctx.scene.entity.get(breeding.baby.id)?.position ?? null);
      const brood = broodView(ctx);
      const me = ctx.scene.entity.get(ctx.player.userId);
      const pointing = onboardingOf(ctx)?.pointing() ?? null;
      const dossier = dossierView(ctx);
      const tamesOn = creatures.viewing?.taming?.foods ?? null;
      const here: [number, number, number] = me === null ? [0, 0, 0] : [me.position[0], me.position[1], me.position[2]];
      const ghostPlan = baseGhost(ctx);
      const stationNear =(id: string): [number, number, number] | null => {
        const at = stations(ctx)
          .filter((station) => station.catalogId === id)
          .sort((a, b) => Math.hypot(a.position[0] - here[0], a.position[1] - here[2]) - Math.hypot(b.position[0] - here[0], b.position[1] - here[2]))[0]?.position;
        return at === undefined ? null : [at[0], 0, at[1]];
      };
      const keyOf = (item: string): number => ctx.player.inventory.state(HOTBAR).slots.findIndex((slot) => slot?.itemId === item) + 1;
      const sight = <K extends string>(what: K, at: readonly [number, number, number] | null) =>
        // type-escape: computed template-literal keys widen to string; the two keys are exactly these.
        ({
          [`${what}Yaw`]: at === null ? 0 : Math.round(Math.atan2(at[0] - here[0], at[2] - here[2]) * 100) / 100,
          [`${what}Dist`]: at === null || me === null ? -1 : Math.round(Math.hypot(at[0] - here[0], at[2] - here[2]) * 10) / 10,
        }) as Record<`${K}Yaw` | `${K}Dist`, number>;
      return {
        // The onboarding pointer: its bearing as a camera yaw and metres to it; 0 and -1 when it points nowhere.
        pointYaw: pointing === null || me === null ? 0 : Math.round(Math.atan2(pointing[0] - me.position[0], pointing[2] - me.position[2]) * 100) / 100,
        pointDist: pointing === null || me === null ? -1 : Math.round(Math.hypot(pointing[0] - me.position[0], pointing[2] - me.position[2]) * 10) / 10,
        // Steps of the survivor's path done, and engrams known: what the from-zero proof reads as taught and unlocked.
        taught: onboardingOf(ctx)?.run().snapshot().done.length ?? 0,
        unlocks: view.engrams.filter((engram) => engram.learned).length,
        // The dossier: species met, items held and notes read, each of how many the island has; engrams learned of all.
        // The highest wild level within 120 m: what the danger-by-distance proof reads.
        wildLevelNear: wildLevelNear(ctx, here, 120),
        speciesSeen: dossier.species.seen,
        speciesTotal: dossier.species.total,
        itemsSeen: dossier.items.seen,
        itemsTotal: dossier.items.total,
        notesSeen: dossier.notes.seen,
        notesTotal: dossier.notes.total,
        tamesSeen: dossier.tames.seen,
        tamesTotal: dossier.tames.total,
        engramsSeen: view.engrams.filter((engram) => engram.learned).length,
        engramsTotal: view.engrams.length,
        // Lifetime tallies the systems move: gathers that took something, items crafted, drinks, stat points spent.
        gathered: view.tally.gathered,
        crafted: view.tally.crafted,
        drinks: view.tally.drinks,
        spentPoints: view.spentPoints,
        x: Math.round((me?.position[0] ?? 0) * 10) / 10,
        z: Math.round((me?.position[2] ?? 0) * 10) / 10,
        yaw: Math.round((me?.rotationY ?? 0) * 100) / 100,
        // Whatever the survivor drives (them, or the mount under them): metres above the ground under it, and that ground's height.
        alt: ((body) => (body === null ? 0 : Math.round((body.position[1] - ctx.world.groundHeightAt(body.position[0], body.position[2])) * 10) / 10))(ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId))),
        groundY: ((body) => (body === null ? 0 : Math.round(ctx.world.groundHeightAt(body.position[0], body.position[2]) * 10) / 10))(ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId))),
        level: view.level,
        aimStrike: view.aim.strike === null ? 0 : 1,
        aimPick: view.aim.pick === null ? 0 : 1,
        xp: view.xp,
        health: Math.round(view.health.value),
        healthMax: Math.round(view.health.max),
        food: Math.round(view.food.value),
        water: Math.round(view.water.value),
        stamina: Math.round(view.stamina.value),
        oxygen: Math.round(view.oxygen.value),
        underwater: view.underwater ? 1 : 0,
        weight: view.weight.value,
        weightMax: view.weight.max,
        thatch: ctx.player.inventory.count(BAG, "thatch"),
        wood: ctx.player.inventory.count(BAG, "wood"),
        stone: ctx.player.inventory.count(BAG, "stone"),
        fiber: ctx.player.inventory.count(BAG, "fiber"),
        flint: ctx.player.inventory.count(BAG, "flint"),
        engramPoints: view.engramPoints,
        berries: ["mejoberry", "amarberry", "azulberry", "tintoberry"].reduce((sum, item) => sum + ctx.player.inventory.count(BAG, item), 0),
        rawMeat: ctx.player.inventory.count(BAG, "raw_meat"),
        hide: ctx.player.inventory.count(BAG, "hide"),
        narcoberries: ctx.player.inventory.count(BAG, "narcoberry"),
        spoiledMeat: ctx.player.inventory.count(BAG, "spoiled_meat"),
        narcotics: ctx.player.inventory.count(BAG, "narcotic"),
        clubs: ctx.player.inventory.count(BAG, "wooden_club") + ctx.player.inventory.count(HOTBAR, "wooden_club"),
        // The bag slot holding a saddle, to double-click into a tame's inventory; -1 with none.
        saddleSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && slot.itemId.endsWith("_saddle")),
        cookedMeat: ctx.player.inventory.count(BAG, "cooked_meat"),
        hatchets: ctx.player.inventory.count(HOTBAR, "stone_hatchet") + ctx.player.inventory.count(BAG, "stone_hatchet"),
        // The bag slot of the first building piece, to double-click onto the hotbar (-1 with none), and the
        // hotbar key (1-based) holding one (0 with none). Campfires standing.
        pieceSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && PIECES.has(slot.itemId)),
        pieceKey: ctx.player.inventory.state(HOTBAR).slots.findIndex((slot) => slot !== null && PIECES.has(slot.itemId)) + 1,
        campfires: piecesBuilt(ctx, "campfire"),
        boxes: piecesBuilt(ctx, "storage_box"),
        bins: piecesBuilt(ctx, "preserving_bin"),
        plots: piecesBuilt(ctx, "crop_plot"),
        // The faced crop plot: 1 with a seed in it, its growth in percent, and its water and fertilizer; -1 with no plot faced.
        plotSeeded: base.plot === null ? -1 : base.plot.seed === null ? 0 : 1,
        plotGrowth: base.plot === null ? -1 : Math.floor(base.plot.growth * 100),
        plotWater: base.plot === null ? -1 : Math.ceil(base.plot.water),
        plotFertilizer: base.plot === null ? -1 : Math.ceil(base.plot.fertilizer),
        mejoberries: ctx.player.inventory.count(BAG, "mejoberry") + ctx.player.inventory.count(HOTBAR, "mejoberry"),
        // Sleeping bags placed, and where the last one lies (0, 0 with none).
        bags: piecesBuilt(ctx, "hide_sleeping_bag"),
        ...((at) => ({ bagX: at === undefined ? 0 : Math.round(at[0] * 10) / 10, bagZ: at === undefined ? 0 : Math.round(at[2] * 10) / 10 }))(lastPiece(ctx, "hide_sleeping_bag")),
        // The hotbar key (1-based) holding each tool; 0 when it is not on the hotbar.
        pickKey: keyOf("stone_pick"),
        hatchetKey: keyOf("stone_hatchet"),
        spearKey: keyOf("spear"),
        // What the survivor can see around them: the nearest tree, flint rock and berry bush within 80 m, and
        // the nearest easy prey or the grounds it grazes, as a camera yaw and metres (-1 with none).
        ...sight("tree", nearestHarvestable(ctx, here, 80, "strike", "thatch")),
        ...sight("rock", nearestHarvestable(ctx, here, 80, "strike", "flint")),
        ...sight("bush", nearestHarvestable(ctx, here, 80, "pick", "mejoberry")),
        // Where the nearest berry bush stands, to the decimetre, so a proof can tell it from the next one.
        ...((at) => ({ bushX: at === null ? 0 : Math.round(at[0] * 10) / 10, bushZ: at === null ? 0 : Math.round(at[2] * 10) / 10 }))(nearestHarvestable(ctx, here, 80, "pick", "mejoberry")),
        // (passing over prey grazing within 30 m of a hunter, as a survivor with a spear would).
        ...sight("prey", nearestWild(ctx, PREY, here, 220, (at) => nearestThreat(ctx, at, 30) === null)),
        // The nearest wild Ovis within 30 m, a passive tame to follow and hand-feed.
        ...sight("ovis", nearestWild(ctx, "ovis", here, 30)),
        ...sight("dodo", nearestWild(ctx, "dodo", here, 30)),
        // Live wild creatures within 60 m: what the herd-refill proof counts.
        wildNear: wildCountNear(ctx, here, 60),
        // The nearest wild hunter within 60 m, and how many creatures a bola or trap holds still.
        ...sight("threat", nearestThreat(ctx, here, 60)),
        held: creatures.held,
        // The nearest body left to carve within 10 m.
        ...sight("carcass", nearestCarcass(ctx, here, 10)),
        // The nearest explorer note not yet read.
        ...sight("note", nearestUnreadNote(ctx, here, 4000)),
        // The nearest wild hunter within 40 m, the one to keep clear of.
        ...sight("danger", nearestThreat(ctx, here, 40)),
        // The nearest tamed Phiomia, to walk back to with its saddle.
        ...sight("phiomia", nearestTame(ctx, here, "phiomia")),
        ...sight("raptor", nearestTame(ctx, here, "raptor")),
        ...sight("doedicurus", nearestTame(ctx, here, "doedicurus")),
        // The nearest campfire and mortar the survivor placed, to walk back to and work at.
        ...sight("campfire", stationNear("campfire")),
        ...sight("mortar", stationNear("mortar_and_pestle")),
        // The first foundation's and doorframe's centres, to build the hut around.
        ...sight("floor", base.floor),
        ...sight("doorway", base.doorway),
        crafting: view.queue.length,
        // The first queued craft's progress in percent (-1 with none), and the fuel left in the nearest burning station within 6 m (-1 with none).
        craftProgress: view.queue[0] === undefined ? -1 : Math.round(view.queue[0].progress * 100),
        fuel: Math.round(fuelNear(ctx, here, 6) * 10) / 10,
        screen: openScreen(ctx) === null ? 0 : 1,
        // The run's phase (0 title, 1 playing, 2 paused, 3 ended) and the menu's pane (0 its default, 1 controls, 2 settings, 3 credits).
        phase: ["menu", "playing", "paused", "ended"].indexOf(gamePhase(ctx)),
        menuPane: ["controls", "settings", "credits"].indexOf(menuPane(ctx) ?? "") + 1,
        // Items in the open storage box (-1 with none open).
        stored: ((store) => (store === null ? -1 : store.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0)))(storeView(ctx)),
        // The bag's raw meat slot, and the raw meat in the open container (-1 with none open).
        meatSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat"),
        storedMeat: ((store) => (store === null ? -1 : store.slots.reduce((sum, slot) => sum + (slot?.itemId === "raw_meat" ? slot.count : 0), 0)))(storeView(ctx)),
        picks: ctx.player.inventory.count(HOTBAR, "stone_pick") + ctx.player.inventory.count(BAG, "stone_pick"),
        creatures: creatures.count,
        aimedDown: creatures.aimed?.taming?.unconscious === true ? 1 : 0,
        aimedTorpor: creatures.aimed?.taming?.torpor ?? 0,
        // Metres between the survivor's and the aimed creature's centres, to a decimetre; 0 with nothing aimed.
        aimedGap: creatures.aimed === null || me === null ? 0 : Math.round((ctx.scene.entity.distance(me.id, creatures.aimed.id) ?? 0) * 10) / 10,
        // 1 while the creature in front is wild (alive or a body to carve), 0 for a tame or nothing.
        aimedWild: creatures.aimed !== null && !creatures.aimed.tamed ? 1 : 0,
        // 1 while the creature in front is a live wild hunter (aggressive or territorial) that will fight back.
        aimedThreat: creatures.aimed !== null && !creatures.aimed.tamed && !creatures.aimed.dead && (creatures.aimed.temperament === "aggressive" || creatures.aimed.temperament === "territorial") ? 1 : 0,
        // The aimed creature's health; 0 with nothing aimed or a body.
        aimedHealth: creatures.aimed?.health.value ?? 0,
        // The aimed tame's food in percent of its max; -1 with no tame aimed.
        aimedFood: creatures.aimed === null ? -1 : Math.round(((food) => (food === null ? -0.01 : food.value / food.max))(tameFood(ctx, creatures.aimed.id)) * 100),
        down: creatures.down,
        tamed: creatures.tamed,
        // The bag slot of the first stack the creature whose inventory is open tames on (what you double-click to feed it); -1 with none.
        foodSlot: tamesOn === null ? -1 : ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && tamesOn.includes(slot.itemId)),
        tameProgress: Math.round((creatures.viewing?.taming?.progress ?? creatures.aimed?.taming?.progress ?? 0) * 100),
        // The game clock in seconds, to time a tame or a craft; the last tame's effectiveness in percent (-1 before any).
        clock: Math.round(ctx.time.now() * 10) / 10,
        lastTameEffectiveness: Math.round((lastTame(ctx)?.effectiveness ?? -0.01) * 100),
        lastTameBonus: lastTame(ctx)?.bonus ?? -1,
        // The most taming progress, in percent, an awake wild creature still holds (waking should leave none).
        awakeProgress: Math.round(awakeTamingProgress(ctx) * 100),
        // Wild eggs and kibble carried, any size or tier.
        eggsCarried: EGG_SIZES.reduce((sum, size) => sum + ctx.player.inventory.count(BAG, eggItem(size)), 0),
        kibble: KIBBLE_TIERS.reduce((sum, tier) => sum + ctx.player.inventory.count(BAG, kibbleItem(tier)), 0),
        // Metal ingots carried, and the hotbar key (1-based) a metal pick sits on, 0 with none there.
        ingots: ctx.player.inventory.count(BAG, "metal_ingot"),
        metalPickKey: keyOf("metal_pick"),
        // The nearest egg on the ground within 60 m, and the nearest cooking pot placed.
        ...sight("wildEgg", nearestEgg(eggsOnGround(ctx), here, 60)),
        ...sight("pot", stationNear("cooking_pot")),
        // The bag slot holding kibble (any tier), raw prime meat and raw meat, to double-click into a downed creature; -1 with none.
        kibbleSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot !== null && slot.itemId.startsWith("kibble_")),
        primeSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_prime_meat"),
        rawMeatSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat"),
        riding: creatures.riding === null ? 0 : 1,
        // 1 while the ridden mount is in deep water, and 1 when it is one of the swimmers.
        ...((swim) => ({ mountSwimming: swim.swimming ? 1 : 0, mountSwimmer: swim.swimmer ? 1 : 0 }))(mountSwim(ctx)),
        // Whether the ridden flyer holds a creature, that creature's height above the ground (-1 with none), and how far the
        // last creature lifted now is from where it was lifted (-1 with none).
        ...((lift) => ({ lifting: lift.holding === null ? 0 : 1, liftedAlt: Math.round(lift.heldAlt * 10) / 10, liftMoved: Math.round(lift.liftMoved * 10) / 10 }))(airliftView(ctx)),
        // The weight the open or ridden tame carries, and its stone (-1 with neither); the bag's stone slot.
        tameWeight: (creatures.viewing ?? creatures.riding)?.weight.value ?? -1,
        tameStone: ((card) => (card === null ? -1 : card.inventory.reduce((sum, slot) => sum + (slot?.itemId === "stone" ? slot.count : 0), 0)))(creatures.viewing ?? creatures.riding),
        stoneSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "stone"),
        woodSlot: ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "wood"),
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
        // Whole metres the ghost stands above the ground under it: a wall stacked on a wall shows 3.
        ghostLift: ghostPlan === null ? 0 : Math.round(ghostPlan.position[1] - ctx.world.groundHeightAt(ghostPlan.position[0], ghostPlan.position[2])),
        aimedStructureHealth: base.aimed?.health ?? 0,
        // How many of the snow's own animals, and how many of the south-coast beach's, live within 120 m.
        nearSnowKinds: [...speciesNear(ctx, here, 120)].filter((species) => SNOW_KINDS.has(species)).length,
        nearCoastKinds: [...speciesNear(ctx, here, 120)].filter((species) => COAST_KINDS.has(species)).length,
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
        // How many hostile airs (a cave's gas, heat or cold) the survivor stands in.
        hazards: view.hazards.length,
        // Artifacts carried in the bag and on the hotbar, and pedestals still holding one.
        artifacts: cavesOf(ctx).reduce((sum, cave) => sum + ctx.player.inventory.count(BAG, cave.artifact) + ctx.player.inventory.count(HOTBAR, cave.artifact), 0),
        pedestals: caves.caves.filter((cave) => cave.artifact !== null).length,
        // 1 while an artifact's pedestal is in reach, so E would take it.
        atPedestal: cavePrompts(ctx).length > 0 ? 1 : 0,
        // Uses the tool in hand has left before it breaks, and its most; -1 for fists or what never wears.
        heldDurability: view.held?.left ?? -1,
        heldDurabilityMax: view.held?.max ?? -1,
        // Carried tools that have worn and could be repaired.
        wornTools: view.worn.length,
        // Wild creatures within 40 m that have been hurt or killed, and your nearest tame's stance (0 passive, 1 neutral, 2 aggressive; -1 with none).
        wildHurt: wildHurtNear(ctx, here, 40),
        tameStance: nearestTameStance(ctx, here),
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
        // 1 shut in a room, roof and walls all round, where the air is held toward indoor warmth.
        indoors: view.indoors ? 1 : 0,
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
        // The newest baby's lineage as its card shows it: stats from its mother, from its father, and raised by a mutation, and
        // its stats that match neither parent once mutations are taken off (-1 with no baby).
        babyStrays: breeding.baby === null ? -1 : lineageStrays(ctx, breeding.baby.id),
        ...((lineage) => ({
          babyFromMother: lineage === null ? -1 : lineage.filter((row) => row.from === "mother").length,
          babyFromFather: lineage === null ? -1 : lineage.filter((row) => row.from === "father").length,
          babyMutated: lineage === null ? -1 : lineage.filter((row) => row.mutated).length,
        }))(breeding.baby === null ? null : (creatureCard(ctx, breeding.baby.id)?.lineage ?? null)),
        atBaby: breedingPrompts(ctx).length > 0 ? 1 : 0,
        ...sight("baby", babyAt),
        // The Broodmother: 0 nothing summoned, 1 the portal counting down, 2 the fight, 3 won and waiting to go back;
        // 1 while the survivor is in her lair; her health and phase (1-3) and her Araneo alive; 1 while webbed;
        // the tames in the fight with the survivor; 1 at the obelisk's terminal.
        brood: ["idle", "portal", "fight", "victory"].indexOf(brood.phase),
        inLair: brood.inside ? 1 : 0,
        broodHealth: brood.boss === null ? -1 : Math.round(brood.boss.health * 1000) / 10,
        broodPhase: brood.boss?.phase === null || brood.boss === null ? 0 : BROOD_PHASES.findIndex((phase) => phase.id === brood.boss!.phase) + 1,
        araneo: brood.brood,
        // Where she stands, and 1 while her phase tell is on screen.
        ...sight("brood", brood.boss?.at ?? null),
        broodTell: brood.tell === null ? 0 : 1,
        webbed: view.webbed ? 1 : 0,
        lairTames: brood.companions,
        atObelisk: obeliskPrompts(ctx).length > 0 ? 1 : 0,
        element: ctx.player.inventory.count(BAG, "element"),
        // Broodmother trophies carried, and brood gear (made only around one) carried.
        broodTrophies: BROOD_TIERS.reduce((sum, tier) => sum + ctx.player.inventory.count(BAG, `broodmother_trophy_${tier.id}`), 0),
        broodGear: ["brood_greaves", "brood_gauntlets", "brood_treads"].reduce((sum, item) => sum + [BAG, HOTBAR].reduce((n, id) => n + ctx.player.inventory.count(id, item), 0), 0),
        tranqArrows: ctx.player.inventory.count(BAG, "tranq_arrow") + ctx.player.inventory.count(HOTBAR, "tranq_arrow"),
        stones: ctx.player.inventory.count(BAG, "stone") + ctx.player.inventory.count(HOTBAR, "stone"),
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
