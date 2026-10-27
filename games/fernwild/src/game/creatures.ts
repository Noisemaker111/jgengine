import { createCreatureDriver, type CreatureBody, type CreatureDriverState, type CreatureStep } from "@jgengine/core/ai/creatureDriver";
import { createPopulationDirector, type PopulationDirector, type PopulationDirectorState } from "@jgengine/core/ai/populationDirector";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { countItem, createEmptyInventory, putItem, takeItem, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { solidObstaclesNear } from "@jgengine/core/movement/solidObstacles";
import type { NavPoint } from "@jgengine/core/nav/navGrid";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { leveling } from "@jgengine/core/progression/leveling";
import { createStatPoints, type StatPointSheet } from "@jgengine/core/progression/statPoints";
import { createCompanionRoster, type CompanionCommand, type CompanionRecord } from "@jgengine/core/scene/companion";
import { ridingOf, type SeatOffset } from "@jgengine/core/scene/riding";
import type { MountedRider } from "@jgengine/core/scene/mount";
import { scatterLevels } from "@jgengine/core/breeding/inheritance";
import { createKnockoutTaming, type TamingFeeder, type TamingState } from "@jgengine/core/taming/knockoutTaming";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { createResourceNodeField, type ResourceGrant, type ResourceNodeState, type ToolProfile } from "@jgengine/core/world/resourceNode";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { itemDef, itemLabel, itemTraits } from "./data/items";
import { IMPRINT_BONUS, IMPRINTED_STATS } from "./data/breeding";
import { TROPHY_DROPS } from "./data/bosses";
import { killXp, SPECIES, speciesDef, statAt, TAME_LEVELS, TAME_STATS, temperamentOf, TORPOR_TAKEN, WILD_LEVELS, WILD_STATS, type SpeciesDef, type TameStat, type WildStat } from "./data/species";
import { setScreen } from "./screens";

/** Slots in a creature's own inventory (ARK caps it by weight; slots are the simple stand-in). */
const CREATURE_SLOTS = 30;
/** Seconds a body lies before it rots away. */
const CARCASS_SECONDS = 300;
/** Seconds before a killed or tamed creature's slot in its herd refills. */
const RESPAWN_SECONDS = 240;
/** How far a whistle carries to your tames. */
const WHISTLE_RANGE = 30;
/** How far E and a swing reach a creature, past its body. */
const USE_REACH = 3;
/** Sea and shallows creatures will not walk into. */
const SHORE = 0.4;

/** A creature as the world remembers it. */
interface Creature {
  id: string;
  species: string;
  level: number;
  region: string;
  inventory: InventoryState;
  tamed: boolean;
  saddled: boolean;
  dead: boolean;
  /** Seconds until a body rots away. */
  rot: number;
  /** Who last hurt it, for the kill's XP. */
  lastHitBy: string | null;
  /** Stamina left; a ridden sprint spends it. */
  stamina: number;
  /** A tame's own levels; null while wild. */
  growth: TameGrowth | null;
  sex: "female" | "male";
  /** Its levels past the first, stat by stat, as ARK hands them out wild and passes them to babies. */
  wild: Record<WildStat, number>;
  /** Mutations in its line. */
  mutations: number;
  /** A tame left to mate with tames of its kind nearby (ARK's Enable Mating). */
  mating: boolean;
  /** How much of its imprint it had as a baby, 0 to 1: every stat but stamina, oxygen and speed up to 20% more. */
  imprint: number;
}

/** ARK's tamed levelling: the level it was tamed at, levels gained since, XP into the next, points spent. */
interface TameGrowth {
  tamedAt: number;
  gained: number;
  xp: number;
  points: StatPointSheet<TameStat>;
}

/** A tame's points scale each stat from its value when tamed; melee and speed from 100%. */
const TAME_POINTS = createStatPoints<TameStat>({
  stats: Object.fromEntries(TAME_STATS.map((stat) => [stat.id, { base: 1, perPoint: stat.perPoint, mode: "scale" as const }])) as Record<TameStat, { base: number; perPoint: number; mode: "scale" }>,
});
/** Levels gained after taming: the n-th costs 10 x n XP. */
const TAME_TRACK = leveling({ xpForLevel: { kind: "linear", base: 0, per: TAME_LEVELS.xpStep }, maxLevel: TAME_LEVELS.max + 1 });
/** Stamina a creature gets back each second, as a share of its max (approx). */
const STAMINA_REGEN = 0.05;

/** Things that happened this tick that the survivor's side reacts to (XP, notices). */
export type CreatureEvent =
  | { type: "tamed"; id: string; label: string; level: number; effectiveness: number }
  | { type: "knockedOut"; id: string; label: string }
  | { type: "woke"; id: string; label: string }
  | { type: "killed"; id: string; label: string; level: number; byPlayer: boolean };

interface World {
  creatures: Map<string, Creature>;
  driver: ReturnType<typeof createCreatureDriver>;
  taming: ReturnType<typeof createKnockoutTaming>;
  roster: ReturnType<typeof createCompanionRoster>;
  carcasses: ReturnType<typeof createResourceNodeField>;
  director: PopulationDirector;
  regions: Map<string, { center: [number, number, number]; radius: number }>;
  steps: Map<string, CreatureStep>;
  /** Seconds a distant wild creature has waited for its next, coarser step. */
  idle: Map<string, number>;
  seq: number;
  populated: boolean;
  /** Seconds since herds were last put to sleep or refilled; they are checked every {@link HERD_CHECK}. */
  sinceHerdCheck: number;
  /** Where the survivor stood at that check: moving far from it (a teleport, a fast mount) checks at once. */
  herdCheckedAt: readonly [number, number, number] | null;
  /** The creature in front of the survivor (or their mount), within reach. */
  aimed: string | null;
  /** The creature whose inventory screen is open. */
  viewing: string | null;
  /** What the survivor last hit, so a following tame joins the fight. */
  lastTarget: { id: string; until: number } | null;
  /** ARK's TamingSpeedMultiplier: meals come this much sooner. */
  tamingSpeed: number;
  mountReady: number;
}

const TAMING = Object.fromEntries(Object.values(SPECIES).map((def) => [def.id, def.taming]));

/** Wild creatures farther than this from the survivor think in coarse steps of {@link FAR_STEP} seconds. */
const NEAR_RANGE = 60;
const FAR_STEP = 0.25;
/** Herds wake when the survivor comes this close to their zone and sleep (wild ones vanish) past it. */
const AWAKE_RANGE = 220;
/** Herds wake, sleep and refill on this beat (seconds), not every frame: a big island queues hundreds of refills. */
const HERD_CHECK = 0.5;
/** ...or as soon as the survivor is this far (m) from where herds were last checked. */
const HERD_CHECK_MOVE = 10;

/** One species in a spawn zone: ARK's relative weight there. */
interface ZoneSpecies {
  species: string;
  weight: number;
}

/** A zone's `count` split across its species by weight (largest remainder), so a rare one may get none. */
function shareOut(count: number, listed: readonly ZoneSpecies[]): { species: string; weight: number; cap: number }[] {
  const total = listed.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return [];
  const exact = listed.map((entry) => (count * entry.weight) / total);
  const caps = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, rest: value - caps[i]! })).sort((a, b) => b.rest - a.rest);
  const left = count - caps.reduce((sum, cap) => sum + cap, 0);
  for (let k = 0; k < left; k += 1) caps[order[k]!.i]! += 1;
  return listed.map((entry, i) => ({ species: entry.species, weight: entry.weight, cap: caps[i]! }));
}

/**
 * Each creature_spawn marker in editor.scene.json is one of ARK's spawn zones: the species that live
 * there with their weights, how many at once, how far they roam. A zone holds what ARK puts there and
 * no more; a species with no stats would be left out (creatures.test checks none is).
 */
function herds() {
  return markersOfKind(editorLayers, "creature_spawn").flatMap((marker) => {
    const meta = (marker.meta ?? {}) as { species?: readonly ZoneSpecies[]; count?: number; radius?: number };
    const listed = meta.species ?? [];
    const species = shareOut(meta.count ?? 2, listed).filter((entry) => entry.cap > 0 && speciesDef(entry.species) !== null);
    if (species.length === 0) return [];
    const radius = meta.radius ?? 14;
    const center: [number, number, number] = [marker.position.x, marker.position.y, marker.position.z];
    const ring: NavPoint[] = Array.from({ length: 8 }, (_, i) => [center[0] + Math.cos((i / 8) * Math.PI * 2) * radius * 0.6, center[2] + Math.sin((i / 8) * Math.PI * 2) * radius * 0.6] as const);
    return [{ region: marker.id, species, radius, center, ring }];
  });
}

const worldOf = perContext((ctx: GameContext): World => {
  const authored = herds();
  return {
    creatures: new Map(),
    driver: createCreatureDriver({ sight: 24, memorySeconds: 10, blocked: (context, x, z) => context.world.groundHeightAt(x, z) < SHORE }),
    taming: createKnockoutTaming(TAMING),
    roster: createCompanionRoster(),
    carcasses: createResourceNodeField({ nodes: [], resolve: (id) => carcassNode(worldOf(ctx), id), rng: () => ctx.rng() }),
    director: createPopulationDirector({
      regions: authored.map((herd) => ({ region: herd.region, species: herd.species, spawnPoints: herd.ring })),
      respawnDelay: RESPAWN_SECONDS,
      seed: 7,
    }),
    regions: new Map(authored.map((herd) => [herd.region, { center: herd.center, radius: herd.radius }])),
    steps: new Map(),
    idle: new Map(),
    seq: 0,
    populated: false,
    sinceHerdCheck: 0,
    herdCheckedAt: null,
    aimed: null,
    viewing: null,
    lastTarget: null,
    tamingSpeed: 1,
    mountReady: 0,
  };
});

function carcassNode(world: World, id: string) {
  const creature = world.creatures.get(id);
  const def = creature === undefined ? null : speciesDef(creature.species);
  if (creature === undefined || def === null || !creature.dead) return null;
  return { id, budget: def.carcass.hits, resources: [{ kind: "raw_meat", amount: def.carcass.meat }, { kind: "hide", amount: def.carcass.hide }] };
}

function defOf(creature: Creature): SpeciesDef {
  return speciesDef(creature.species)!;
}

/**
 * A stat a creature has: from its wild levels in that stat, then a tame's points on top, then a bred tame's imprint.
 */
function statOf(creature: Creature, stat: TameStat): number {
  const def = defOf(creature);
  const level = stat === "speed" ? 1 : 1 + creature.wild[stat];
  const wild = stat === "speed" ? 1 : stat === "melee" ? statAt(def.melee, level) / def.melee.base : statAt(def[stat], level);
  const tamed = creature.growth === null ? wild : TAME_POINTS.value(creature.growth.points, stat, wild);
  return IMPRINTED_STATS.includes(stat) ? tamed * (1 + IMPRINT_BONUS * creature.imprint) : tamed;
}

function maxHealth(creature: Creature): number {
  return Math.round(statOf(creature, "health"));
}

function body(world: World, creature: Creature): CreatureBody {
  const def = defOf(creature);
  return {
    walk: def.walk * statOf(creature, "speed"),
    sprint: def.sprint * statOf(creature, "speed"),
    attack: def.attack === null ? null : { effect: "damage", amount: def.attack.damage * statOf(creature, "melee"), interval: def.attack.interval, reach: def.attack.reach + def.radius },
    wander: { radius: world.regions.get(creature.region)?.radius ?? 16 },
  };
}

// --- spawning -----------------------------------------------------------------------------

function rollLevel(ctx: GameContext): number {
  // Low levels are common and high ones rare, as on ARK's Island.
  return WILD_LEVELS.min + Math.floor(Math.pow(ctx.rng(), 1.6) * (WILD_LEVELS.max - WILD_LEVELS.min + 1));
}

/** The nearest open ground to `at` a body of `radius` fits on: never inside a trunk or a boulder, never in the sea. */
function openGround(ctx: GameContext, at: readonly [number, number], radius: number): [number, number, number] | null {
  for (let ring = 0; ring <= 4; ring += 1) {
    for (let step = 0; step < (ring === 0 ? 1 : 8); step += 1) {
      const angle = (step / 8) * Math.PI * 2;
      const x = at[0] + Math.sin(angle) * ring;
      const z = at[1] + Math.cos(angle) * ring;
      const y = ctx.world.groundHeightAt(x, z);
      if (y >= SHORE && solidObstaclesNear(ctx, [x, y, z], radius, radius).length === 0) return [x, y, z];
    }
  }
  return null;
}

/** What a creature is born with: a wild one rolls it, a bred one inherits it. */
export interface CreatureGenes {
  sex: "female" | "male";
  wild: Record<WildStat, number>;
  mutations: number;
}

export function spawnCreature(
  ctx: GameContext,
  species: string,
  at: readonly [number, number],
  options: { region?: string; level?: number; sex?: "female" | "male"; genes?: CreatureGenes; size?: number } = {},
): string | null {
  const def = speciesDef(species);
  const position = def === null ? null : openGround(ctx, at, def.radius);
  if (def === null || position === null) return null;
  const world = worldOf(ctx);
  const id = `${species}_${(world.seq += 1)}`;
  const sex = ctx.rng() < 0.5 ? "female" : "male";
  const genes = options.genes ?? { sex: options.sex ?? sex, wild: scatterLevels((options.level ?? rollLevel(ctx)) - 1, WILD_STATS, ctx.rng), mutations: 0 };
  const level = 1 + WILD_STATS.reduce((sum, stat) => sum + genes.wild[stat], 0);
  ctx.scene.entity.spawn(species, { id, position, rotationY: ctx.rng() * Math.PI * 2, role: "npc", ...(options.size === undefined ? {} : { size: options.size }) });
  const creature: Creature = {
    id,
    species,
    level,
    region: options.region ?? "",
    inventory: createEmptyInventory({ slots: CREATURE_SLOTS }),
    tamed: false,
    saddled: false,
    dead: false,
    rot: 0,
    lastHitBy: null,
    stamina: 0,
    growth: null,
    sex: genes.sex,
    wild: { ...genes.wild },
    mutations: genes.mutations,
    mating: false,
    imprint: 0,
  };
  const health = maxHealth(creature);
  creature.stamina = statOf(creature, "stamina");
  ctx.scene.entity.stats.set(id, "health", { max: health, current: health });
  world.creatures.set(id, creature);
  world.driver.add(id, position);
  world.taming.track(id, species, level);
  return id;
}

/** Whether a herd's zone is near enough to the survivor to be awake. */
function awake(world: World, region: string, at: readonly [number, number, number] | null): boolean {
  const zone = world.regions.get(region);
  if (zone === undefined || at === null) return false;
  return Math.hypot(zone.center[0] - at[0], zone.center[2] - at[2]) < AWAKE_RANGE + zone.radius;
}

/** Put far herds to sleep and refill the awake ones. */
function tickHerds(ctx: GameContext, world: World, here: readonly [number, number, number] | null): void {
  const dt = world.sinceHerdCheck;
  world.sinceHerdCheck = 0;
  world.herdCheckedAt = here === null ? null : [here[0], here[1], here[2]];
  sleepFarHerds(ctx, world, here);
  for (const request of world.director.tick(dt, { isActive: (region) => awake(world, region, here) })) {
    const region = world.regions.get(request.region);
    const point = request.point ?? (region === undefined ? null : ([region.center[0], region.center[2]] as const));
    if (point === null) continue;
    // A herd never refills in plain view (the very first fill aside): wait until the survivor has wandered off.
    const near = world.populated && here !== null && Math.hypot(here[0] - point[0], here[2] - point[1]) < 60;
    if (near || spawnCreature(ctx, request.species, point, { region: request.region }) === null) world.director.notifyRemoved(request.region, request.species);
  }
  world.populated = true;
}

/** Wild creatures nobody has touched leave when their zone falls asleep; the zone refills when it wakes. */
function sleepFarHerds(ctx: GameContext, world: World, at: readonly [number, number, number] | null): void {
  for (const creature of [...world.creatures.values()]) {
    if (creature.tamed || creature.dead || creature.region === "" || awake(world, creature.region, at)) continue;
    const taming = world.taming.state(creature.id);
    if (taming !== null && (taming.torpor > 0 || taming.progress > 0)) continue;
    removeCreature(ctx, world, creature, 0);
  }
}

function removeCreature(ctx: GameContext, world: World, creature: Creature, delay: number): void {
  world.creatures.delete(creature.id);
  world.steps.delete(creature.id);
  world.idle.delete(creature.id);
  world.taming.forget(creature.id);
  world.driver.forget(creature.id);
  ctx.scene.entity.despawn(creature.id);
  if (creature.region !== "") world.director.notifyRemoved(creature.region, creature.species, creature.id, { delay });
}

/** ARK's admin DestroyWildDinos: every living wild creature is gone; their zones refill as usual later. */
export function destroyWild(ctx: GameContext): void {
  const world = worldOf(ctx);
  for (const creature of [...world.creatures.values()]) if (!creature.tamed && !creature.dead) removeCreature(ctx, world, creature, RESPAWN_SECONDS);
}

// --- aiming, striking -----------------------------------------------------------------------

/** The live entity that acts for the survivor: their mount when riding, else themselves. */
function actor(ctx: GameContext): string {
  return ridingOf(ctx).mountOf(ctx.player.userId) ?? ctx.player.userId;
}

/** The creature in front of `fromId`, within `reach` of its body, nearest first. */
function creatureInFront(ctx: GameContext, fromId: string, yaw: number, reach: number, accept: (creature: Creature) => boolean): Creature | null {
  const from = ctx.scene.entity.get(fromId);
  if (from === null) return null;
  const world = worldOf(ctx);
  let best: Creature | null = null;
  let bestDistance = Infinity;
  for (const creature of world.creatures.values()) {
    if (creature.id === fromId || !accept(creature)) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity === null) continue;
    const dx = entity.position[0] - from.position[0];
    const dz = entity.position[2] - from.position[2];
    const distance = Math.hypot(dx, dz);
    const radius = defOf(creature).radius;
    if (distance > reach + radius) continue;
    // In front: within 60° of the facing, or so close the body fills the view.
    const facing = distance < radius + 0.5 || (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(distance, 1e-6) > 0.5;
    if (facing && distance < bestDistance) {
      best = creature;
      bestDistance = distance;
    }
  }
  return best;
}

/** What a swing at a creature did. */
export interface CreatureStrike {
  label: string;
  /** Meat and hide cut from a body. */
  granted: readonly ResourceGrant[];
  killed: boolean;
  /** ARK's kill XP when this strike killed it, else 0. */
  xp: number;
  knockedOut: boolean;
}

/**
 * Swing `tool` at the creature in front of `attackerId`: live ones take damage and torpor, bodies
 * give meat and hide by the tool's bias. Null when nothing is there.
 */
export function strikeCreature(ctx: GameContext, attackerId: string, yaw: number, tool: { gather: ToolProfile; damage: number; torpor?: number; reach: number }, melee: number): CreatureStrike | null {
  const world = worldOf(ctx);
  const target = creatureInFront(ctx, attackerId, yaw, tool.reach, (creature) => !(creature.tamed && !creature.dead) && ridingOf(ctx).riderOf(creature.id) === null);
  if (target === null) return null;
  const def = defOf(target);
  if (target.dead) {
    const cut = world.carcasses.harvest(target.id, tool.gather, { multiplier: melee });
    if (cut.depleted) target.rot = Math.min(target.rot, 2);
    return { label: `${def.label} body`, granted: cut.granted, killed: false, knockedOut: false, xp: 0 };
  }
  const damage = tool.damage * melee;
  target.lastHitBy = attackerId;
  ctx.scene.entity.effect({ from: attackerId, to: target.id, effect: "damage", via: { amount: damage } });
  world.driver.hurt(ctx, target.id, attackerId);
  world.lastTarget = { id: target.id, until: ctx.time.now() + 10 };
  const wasDown = world.taming.state(target.id)?.unconscious === true;
  if (wasDown) world.taming.damage(target.id, damage / maxHealth(target));
  const knockedOut = !wasDown && def.torporImmune !== true && world.taming.addTorpor(target.id, (tool.torpor ?? 0) * TORPOR_TAKEN * melee);
  if (knockedOut) knockOut(ctx, target);
  const killed = (ctx.scene.entity.stats.get(target.id, "health")?.current ?? 1) <= 0;
  if (killed) kill(ctx, target);
  return { label: def.label, granted: [], killed, knockedOut, xp: killed ? killXp(def, target.level) : 0 };
}

/** Left click on a mount: it bites what is in front, and cuts meat from a body for its rider. */
export function mountBite(ctx: GameContext): CreatureStrike | "riding" | null {
  const world = worldOf(ctx);
  const mountId = ridingOf(ctx).mountOf(ctx.player.userId);
  if (mountId === null) return null;
  const mount = world.creatures.get(mountId);
  const entity = ctx.scene.entity.get(mountId);
  const def = mount === undefined ? null : defOf(mount);
  if (mount === undefined || entity === null || def === null || def.attack === null) return "riding";
  const now = ctx.time.now();
  if (now < world.mountReady) return "riding";
  world.mountReady = now + def.attack.interval;
  const bite = { gather: { power: 1, biases: def.diet === "carnivore" ? { raw_meat: 2, hide: 1 } : { raw_meat: 0.5, hide: 1.5 }, defaultBias: 0 }, damage: def.attack.damage, reach: def.attack.reach + def.radius };
  const hit = strikeCreature(ctx, mountId, entity.rotationY, bite, statOf(mount, "melee"));
  if (hit === null) return "riding";
  for (const grant of hit.granted) {
    const whole = Math.floor(grant.amount + ctx.rng());
    if (whole > 0) ctx.player.inventory.put(BAG, grant.kind, whole);
  }
  return hit;
}

// --- knock out, wake, die, tame ---------------------------------------------------------------

function lie(ctx: GameContext, id: string, down: boolean): void {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return;
  ctx.scene.entity.setPose(id, { position: entity.position, rotationY: entity.rotationY, rotationZ: down ? Math.PI / 2 : 0 });
  ctx.scene.entity.setVelocity(id, [0, 0, 0]);
}

function knockOut(ctx: GameContext, creature: Creature): void {
  lie(ctx, creature.id, true);
  ctx.game.notices.push({ text: `The ${defOf(creature).label} is knocked out. Put food in its inventory.`, tone: "success" });
}

function kill(ctx: GameContext, creature: Creature): void {
  const world = worldOf(ctx);
  if (creature.dead) return;
  if (ridingOf(ctx).riderOf(creature.id) !== null) ridingOf(ctx).dismount(ctx.player.userId);
  creature.dead = true;
  creature.rot = CARCASS_SECONDS;
  world.taming.forget(creature.id);
  world.driver.forget(creature.id);
  if (creature.tamed) {
    world.roster.release(creature.id);
    ctx.game.notices.push({ text: `Your ${defOf(creature).label} was killed`, tone: "deny" });
  } else if (creature.region !== "") {
    world.director.notifyRemoved(creature.region, creature.species);
  }
  // The wild ones the Broodmother's tribute asks for carry their trophy, to take from the body.
  const trophy = creature.tamed ? undefined : TROPHY_DROPS[creature.species];
  if (trophy !== undefined) {
    const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, trophy, 1);
    if (put.status === "ok") creature.inventory = put.state;
  }
  lie(ctx, creature.id, true);
  const killer = creature.lastHitBy === null ? undefined : world.creatures.get(creature.lastHitBy);
  if (killer?.growth != null && !killer.dead) grantTameXp(ctx, killer, killXp(defOf(creature), creature.level));
}

/** XP for a tame: ARK levels it on its own curve and gives a point per level to spend. */
function grantTameXp(ctx: GameContext, creature: Creature, amount: number): void {
  const growth = creature.growth;
  if (growth === null || amount <= 0) return;
  const progress = TAME_TRACK.resolve(growth.gained + 1, growth.xp + amount);
  growth.xp = progress.xp;
  if (progress.levelsGained === 0) return;
  growth.gained = progress.level - 1;
  creature.level = growth.tamedAt + growth.gained;
  ctx.game.notices.push({ text: `Your ${defOf(creature).label} reached level ${creature.level}. A point to spend in its inventory.`, tone: "success" });
}

/** A tame's second: the passive XP trickle, and stamina spent on a ridden sprint or won back at rest. */
function tickTame(ctx: GameContext, creature: Creature, ridden: boolean, dt: number): void {
  grantTameXp(ctx, creature, TAME_LEVELS.passivePerSecond * dt);
  const max = statOf(creature, "stamina");
  const entity = ctx.scene.entity.get(creature.id);
  const moving = entity !== null && Math.hypot(entity.velocity[0], entity.velocity[2]) > 0.5;
  const sprinting = ridden && moving && ctx.input.isDown("sprint") && creature.stamina > 1;
  const rate = sprinting ? -defOf(creature).sprintStamina : moving ? 0 : max * STAMINA_REGEN;
  creature.stamina = Math.max(0, Math.min(max, creature.stamina + rate * dt));
  const def = defOf(creature);
  const walk = def.walk * statOf(creature, "speed");
  // Ridden, the mount sprints at its own ARK ratio (a tamed raptor 11.04 / 4.8 m/s), not the survivor's.
  const run = (def.tamedSprint ?? def.sprint) / def.walk;
  const moved = entity === null ? null : entity.movement;
  if (ridden && moved !== null && (Math.abs((moved.walkSpeed ?? 0) - walk) > 0.01 || moved.runMultiplier !== run)) ctx.scene.entity.update(creature.id, { movement: { ...moved, walkSpeed: walk, runMultiplier: run } });
}

/** Whether the mount under the survivor has the stamina to sprint; null on foot. */
export function mountCanSprint(ctx: GameContext): boolean | null {
  const mountId = ridingOf(ctx).mountOf(ctx.player.userId);
  const mount = mountId === null ? undefined : worldOf(ctx).creatures.get(mountId);
  return mount === undefined ? null : mount.stamina > 1;
}

/** Spend one of the viewed tame's points: its stat grows, and a pool's current value with it, as in ARK. */
export function levelTame(ctx: GameContext, stat: TameStat): void {
  const creature = viewed(ctx);
  const growth = creature?.growth ?? null;
  if (creature === null || growth === null || creature.dead) return;
  const before = { health: maxHealth(creature), stamina: statOf(creature, "stamina") };
  if (!TAME_POINTS.spend(growth.points, stat, growth.gained)) return;
  if (stat === "health") {
    const health = ctx.scene.entity.stats.get(creature.id, "health");
    const max = maxHealth(creature);
    ctx.scene.entity.stats.set(creature.id, "health", { max, current: (health?.current ?? max) + max - before.health });
  }
  if (stat === "stamina") creature.stamina += statOf(creature, "stamina") - before.stamina;
}

function tame(ctx: GameContext, creature: Creature, effectiveness: number, bonus: number): void {
  creature.level += bonus;
  // ARK's taming bonus levels land on random stats like wild ones, and pass to babies the same way.
  const extra = scatterLevels(bonus, WILD_STATS, ctx.rng);
  for (const stat of WILD_STATS) creature.wild[stat] += extra[stat];
  makeTame(ctx, creature);
  ctx.game.notices.push({ text: `${defOf(creature).label} tamed! Level ${creature.level} (+${bonus} from ${Math.round(effectiveness * 100)}% taming effectiveness)`, tone: "success" });
}

/** A creature becomes the survivor's: its tame levels start, full health, and it waits where it stands. */
function makeTame(ctx: GameContext, creature: Creature): void {
  const world = worldOf(ctx);
  creature.tamed = true;
  creature.growth = { tamedAt: creature.level, gained: 0, xp: 0, points: TAME_POINTS.empty() };
  creature.stamina = statOf(creature, "stamina");
  const health = maxHealth(creature);
  ctx.scene.entity.stats.set(creature.id, "health", { max: health, current: health });
  lie(ctx, creature.id, false);
  const entity = ctx.scene.entity.get(creature.id);
  const home = entity === null ? null : ([entity.position[0], entity.position[1], entity.position[2]] as const);
  // ARK's fresh tame waits where it woke, not following until whistled.
  world.roster.adopt(ctx.player.userId, { id: creature.id, command: "stay", home, leash: 40, level: creature.level });
  if (home !== null) world.driver.setHome(creature.id, home);
  if (creature.region !== "") world.director.notifyRemoved(creature.region, creature.species);
  creature.region = "";
}

/** A bred baby: hatched or born beside `at`, the survivor's from the first moment. Returns its id. */
export function spawnBaby(ctx: GameContext, species: string, at: readonly [number, number], genes: CreatureGenes, size: number): string | null {
  const id = spawnCreature(ctx, species, at, { genes, size });
  if (id !== null) tameSummoned(ctx, id, false);
  return id;
}

/** ARK's GMSummon: the creature just spawned is the survivor's at once, mating on or off. */
export function tameSummoned(ctx: GameContext, id: string, mating: boolean): void {
  const creature = worldOf(ctx).creatures.get(id);
  if (creature === undefined) return;
  worldOf(ctx).taming.forget(id);
  makeTame(ctx, creature);
  creature.mating = mating;
}

/** Every living tame of the survivor's, for breeding: where it stands, its kind, sex and whether it may mate. */
export function tames(ctx: GameContext): { id: string; species: string; sex: "female" | "male"; mating: boolean; at: readonly [number, number, number]; radius: number; following: boolean }[] {
  const world = worldOf(ctx);
  const out = [];
  for (const creature of world.creatures.values()) {
    if (!creature.tamed || creature.dead) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity === null) continue;
    out.push({ id: creature.id, species: creature.species, sex: creature.sex, mating: creature.mating, at: entity.position, radius: defOf(creature).radius, following: world.roster.get(creature.id)?.command === "follow" });
  }
  return out;
}

/** A creature's genes, for its babies; null when it is gone. */
export function genesOf(ctx: GameContext, id: string): CreatureGenes | null {
  const creature = worldOf(ctx).creatures.get(id);
  return creature === undefined ? null : { sex: creature.sex, wild: { ...creature.wild }, mutations: creature.mutations };
}

/** Set a bred tame's imprint: its imprinted stats grow, and its health with them. */
export function setImprint(ctx: GameContext, id: string, imprint: number): void {
  const creature = worldOf(ctx).creatures.get(id);
  if (creature === undefined || creature.dead) return;
  const before = maxHealth(creature);
  creature.imprint = Math.max(0, Math.min(1, imprint));
  const max = maxHealth(creature);
  const health = ctx.scene.entity.stats.get(id, "health");
  ctx.scene.entity.stats.set(id, "health", { max, current: Math.max(0, (health?.current ?? max) + max - before) });
}

/** The max food a creature holds (ARK's food stat). */
export function foodMaxOf(ctx: GameContext, id: string): number {
  const creature = worldOf(ctx).creatures.get(id);
  return creature === undefined ? 0 : statOf(creature, "food");
}

/** Take one `item` from a creature's own inventory; false when it has none. */
export function takeFromCreatureInventory(ctx: GameContext, id: string, item: string): boolean {
  const creature = worldOf(ctx).creatures.get(id);
  if (creature === undefined) return false;
  const taken = takeItem(creature.inventory, item, 1);
  if (taken.status !== "ok") return false;
  creature.inventory = taken.state;
  return true;
}

/** Whether a creature is alive. */
export function creatureAlive(ctx: GameContext, id: string): boolean {
  const creature = worldOf(ctx).creatures.get(id);
  return creature !== undefined && !creature.dead;
}

/** Set a creature down at `at` (a portal took it): it stands there, and a tame told to stay now waits there. */
export function moveCreature(ctx: GameContext, id: string, at: readonly [number, number]): void {
  const world = worldOf(ctx);
  const creature = world.creatures.get(id);
  if (creature === undefined || creature.dead) return;
  const position = openGround(ctx, at, defOf(creature).radius) ?? [at[0], ctx.world.groundHeightAt(at[0], at[1]), at[1]];
  ctx.scene.entity.setPose(id, { position });
  ctx.scene.entity.setVelocity(id, [0, 0, 0]);
  world.driver.setHome(id, position);
  if (world.roster.get(id) !== null) world.roster.setHome(id, position);
  world.steps.delete(id);
}

/** A creature dies where it stands (the tames left behind in a lost boss fight). */
export function slayCreature(ctx: GameContext, id: string): void {
  const creature = worldOf(ctx).creatures.get(id);
  if (creature !== undefined) kill(ctx, creature);
}

/** A creature, alive or a body, is gone from the world at once (a boss lair clearing out). */
export function removeCreatureNow(ctx: GameContext, id: string): void {
  const world = worldOf(ctx);
  const creature = world.creatures.get(id);
  if (creature !== undefined) removeCreature(ctx, world, creature, 0);
}

/** A live creature's health, as a share of its max; null when it is gone or dead. */
export function creatureHealth(ctx: GameContext, id: string): number | null {
  const creature = worldOf(ctx).creatures.get(id);
  const health = creature === undefined || creature.dead ? null : ctx.scene.entity.stats.get(id, "health");
  return health === null || health.max <= 0 ? null : Math.max(0, health.current / health.max);
}

/** The creature the survivor is aimed at, or null. */
export function aimedCreature(ctx: GameContext): string | null {
  return worldOf(ctx).aimed;
}

/** The creature whose inventory screen is open, or null. */
export function viewedCreature(ctx: GameContext): string | null {
  return viewed(ctx)?.id ?? null;
}

/** ARK's Enable Mating, on the tame whose inventory is open. */
export function toggleMating(ctx: GameContext): void {
  const creature = viewed(ctx);
  if (creature === null || !creature.tamed) return;
  creature.mating = !creature.mating;
  ctx.game.notices.push({ text: `${defOf(creature).label}: mating ${creature.mating ? "on" : "off"}`, tone: "success" });
}

function feeder(creature: Creature): TamingFeeder {
  return {
    count: (itemId) => countItem(creature.inventory, itemId),
    take(itemId) {
      const taken = takeItem(creature.inventory, itemId, 1);
      if (taken.status !== "ok") return false;
      creature.inventory = taken.state;
      return true;
    },
  };
}

// --- the tick ------------------------------------------------------------------------------

function threatsTo(world: World, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const [id, step] of world.steps) if (step.targetId !== null && ids.includes(step.targetId) && !world.creatures.get(id)?.tamed) out.push(id);
  return out;
}

export function tickCreatures(ctx: GameContext, dt: number): CreatureEvent[] {
  const world = worldOf(ctx);
  const events: CreatureEvent[] = [];
  const riding = ridingOf(ctx);
  const owner = ctx.scene.entity.get(ctx.player.userId);
  const ownerTarget = world.lastTarget !== null && world.lastTarget.until > ctx.time.now() && world.creatures.get(world.lastTarget.id)?.dead === false ? world.lastTarget.id : null;

  for (const { id, event } of world.taming.tick(dt, (id) => {
    const creature = world.creatures.get(id);
    return creature === undefined ? null : feeder(creature);
  }, world.tamingSpeed)) {
    const creature = world.creatures.get(id);
    if (creature === undefined) continue;
    const label = defOf(creature).label;
    if (event.type === "knockedOut") {
      knockOut(ctx, creature);
      events.push({ type: "knockedOut", id, label });
    } else if (event.type === "woke") {
      lie(ctx, id, false);
      if (world.viewing === id) closeCreature(ctx);
      ctx.game.notices.push({ text: `The ${label} woke up!`, tone: "deny" });
      events.push({ type: "woke", id, label });
    } else if (event.type === "ate") {
      ctx.scene.entity.floatText({ instanceId: id, text: `Ate ${itemLabel(event.itemId)}`, kind: "pickup" });
    } else if (event.type === "tamed") {
      tame(ctx, creature, event.effectiveness, event.bonusLevels);
      events.push({ type: "tamed", id, label, level: creature.level, effectiveness: event.effectiveness });
    }
  }

  const mine = [ctx.player.userId, ...world.roster.list(ctx.player.userId).map((record) => record.id)];
  const threats = threatsTo(world, mine);
  for (const creature of world.creatures.values()) {
    const def = defOf(creature);
    if (creature.dead) {
      creature.rot -= dt;
      if (creature.rot <= 0) {
        world.creatures.delete(creature.id);
        world.steps.delete(creature.id);
        ctx.scene.entity.despawn(creature.id);
      }
      continue;
    }
    if ((ctx.scene.entity.stats.get(creature.id, "health")?.current ?? 1) <= 0) {
      events.push({ type: "killed", id: creature.id, label: def.label, level: creature.level, byPlayer: world.lastTarget?.id === creature.id });
      kill(ctx, creature);
      continue;
    }
    const down = world.taming.state(creature.id)?.unconscious === true;
    const ridden = riding.riderOf(creature.id) !== null;
    // Out past the survivor's notice a wild creature only grazes, so it can think a few times a second.
    const self = ctx.scene.entity.get(creature.id);
    const far = !creature.tamed && owner !== null && self !== null && Math.hypot(self.position[0] - owner.position[0], self.position[2] - owner.position[2]) > NEAR_RANGE;
    let stepDt = dt;
    if (far) {
      const waited = (world.idle.get(creature.id) ?? 0) + dt;
      if (waited < FAR_STEP) {
        world.idle.set(creature.id, waited);
        continue;
      }
      stepDt = waited;
    }
    world.idle.delete(creature.id);
    const record = creature.tamed ? world.roster.get(creature.id) : null;
    const mind = down || ridden
      ? ({ kind: "still" } as const)
      : record !== null
        ? ({ kind: "tamed", intent: world.roster.resolveIntent(creature.id, { ownerPosition: owner?.position ?? null, ownerTargetId: ownerTarget, threats })! } as const)
        : ({ kind: "wild", temperament: temperamentOf(def) } as const);
    const step = world.driver.step(ctx, creature.id, mind, body(world, creature), stepDt);
    world.steps.set(creature.id, step);
    const bitten = step.struck && step.targetId !== null ? world.creatures.get(step.targetId) : undefined;
    if (bitten !== undefined) {
      bitten.lastHitBy = creature.id;
      world.driver.hurt(ctx, bitten.id, creature.id);
    }
    if (creature.growth !== null) tickTame(ctx, creature, ridden, dt);
  }

  const here = owner?.position ?? null;
  world.sinceHerdCheck += dt;
  const moved = here !== null && (world.herdCheckedAt === null || Math.hypot(here[0] - world.herdCheckedAt[0], here[2] - world.herdCheckedAt[2]) > HERD_CHECK_MOVE);
  if (!world.populated || moved || world.sinceHerdCheck >= HERD_CHECK) tickHerds(ctx, world, here);

  world.carcasses.tick(dt);
  const me = ctx.scene.entity.get(actor(ctx));
  world.aimed = me === null ? null : (creatureInFront(ctx, me.id, me.rotationY, USE_REACH, (creature) => riding.riderOf(creature.id) === null)?.id ?? null);
  return events;
}

// --- E, orders, riding --------------------------------------------------------------------------

/** E on a creature: dismount, ride a saddled tame, or open the inventory of a downed or tamed one. */
export function useCreature(ctx: GameContext): void {
  const world = worldOf(ctx);
  const riding = ridingOf(ctx);
  const mounted = riding.mountOf(ctx.player.userId);
  if (mounted !== null) {
    riding.dismount(ctx.player.userId);
    const entity = ctx.scene.entity.get(mounted);
    if (entity !== null) {
      world.roster.command(mounted, "stay");
      world.roster.setHome(mounted, [entity.position[0], entity.position[1], entity.position[2]]);
    }
    return;
  }
  const creature = world.aimed === null ? undefined : world.creatures.get(world.aimed);
  if (creature === undefined) return;
  if (creature.dead) {
    // A body still holding something (a trophy, a tame's things) opens like a live one's inventory.
    if (holdsItems(creature)) {
      world.viewing = creature.id;
      setScreen(ctx, "creature");
    }
    return;
  }
  if (creature.tamed && creature.saddled) {
    const ride = riding.ride(ctx.player.userId, creature.id, defOf(creature).seat as SeatOffset);
    if (!ride.ok) ctx.game.notices.push({ text: ride.reason, tone: "deny" });
    return;
  }
  if (creature.tamed || world.taming.state(creature.id)?.unconscious === true) {
    world.viewing = creature.id;
    setScreen(ctx, "creature");
  }
}

export function closeCreature(ctx: GameContext): void {
  worldOf(ctx).viewing = null;
  setScreen(ctx, null);
}

/** ARK's whistles: every tame of yours in earshot follows you, or stays where it stands. */
export function whistle(ctx: GameContext, order: Extract<CompanionCommand, "follow" | "stay">): void {
  const world = worldOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  let heard = 0;
  for (const record of world.roster.list(ctx.player.userId)) {
    const entity = ctx.scene.entity.get(record.id);
    if (entity === null || ridingOf(ctx).riderOf(record.id) !== null) continue;
    if (Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]) > WHISTLE_RANGE) continue;
    world.roster.command(record.id, order);
    if (order === "stay") world.roster.setHome(record.id, [entity.position[0], entity.position[1], entity.position[2]]);
    heard += 1;
  }
  ctx.game.notices.push({ text: heard === 0 ? "No tames in earshot" : order === "follow" ? `${heard} following` : `${heard} staying`, tone: heard === 0 ? "deny" : "success" });
}

/** The E prompt for creatures, outranking a bush behind them. */
export function creaturePrompts(ctx: GameContext): PositionedPrompt[] {
  const world = worldOf(ctx);
  const mounted = ridingOf(ctx).mountOf(ctx.player.userId);
  const at = (id: string) => {
    const entity = ctx.scene.entity.get(id);
    return entity === null ? null : { x: entity.position[0], z: entity.position[2] };
  };
  const prompt = (id: string, label: string): PositionedPrompt[] => {
    const position = at(id);
    return position === null ? [] : [{ id: `creature:${id}`, position, priority: 2, prompt: proximityPrompt({ radius: USE_REACH + 4, display: keybind("interact", label), invoke: command("creatureUse") }) }];
  };
  if (mounted !== null) return prompt(mounted, "Dismount");
  const creature = world.aimed === null ? undefined : world.creatures.get(world.aimed);
  if (creature === undefined) return [];
  if (creature.dead) return holdsItems(creature) ? prompt(creature.id, "Access inventory") : [];
  if (creature.tamed) return prompt(creature.id, creature.saddled ? "Ride" : "Access inventory");
  if (world.taming.state(creature.id)?.unconscious === true) return prompt(creature.id, "Access inventory");
  return [];
}

// --- the creature's inventory ---------------------------------------------------------------------

const NARCOTICS: Readonly<Record<string, { torpor: number; seconds: number }>> = {
  narcoberry: { torpor: 8, seconds: 3 },
  narcotic: { torpor: 40, seconds: 16 },
  stimberry: { torpor: -7.5, seconds: 3 },
  stimulant: { torpor: -40, seconds: 3 },
};

function holdsItems(creature: Creature): boolean {
  return creature.inventory.slots.some((slot) => slot !== null);
}

/** The creature whose inventory is open: a live one, or a body with something left in it. */
function viewed(ctx: GameContext): Creature | null {
  const world = worldOf(ctx);
  const creature = world.viewing === null ? undefined : world.creatures.get(world.viewing);
  return creature === undefined || (creature.dead && !holdsItems(creature)) ? null : creature;
}

/** Move a stack from the survivor's bag or hotbar into the creature; a matching saddle goes on its back. */
export function giveToCreature(ctx: GameContext, from: string, slot: number): void {
  const creature = viewed(ctx);
  const stack = ctx.player.inventory.state(from).slots[slot] ?? null;
  if (creature === null || stack === null) return;
  const def = defOf(creature);
  if (itemDef(stack.itemId)?.kind === "saddle") {
    if (!creature.tamed || def.saddle !== stack.itemId) {
      ctx.game.notices.push({ text: creature.tamed ? `That saddle does not fit a ${def.label}` : "Tame it first", tone: "deny" });
      return;
    }
    if (creature.saddled) return;
    ctx.player.inventory.take(from, stack.itemId, 1);
    creature.saddled = true;
    ctx.game.notices.push({ text: `Saddled. E to ride the ${def.label}.`, tone: "success" });
    return;
  }
  const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, stack.itemId, stack.count);
  if (put.status !== "ok") {
    ctx.game.notices.push({ text: `The ${def.label}'s inventory is full`, tone: "deny" });
    return;
  }
  ctx.player.inventory.take(from, stack.itemId, stack.count);
  creature.inventory = put.state;
}

/** Take a stack back out of the creature into the survivor's bag. */
export function takeFromCreature(ctx: GameContext, slot: number): void {
  const creature = viewed(ctx);
  const stack = creature?.inventory.slots[slot] ?? null;
  if (creature === null || stack === null) return;
  if (ctx.player.inventory.put(BAG, stack.itemId, stack.count).status !== "ok") {
    ctx.game.notices.push({ text: "Inventory is full", tone: "deny" });
    return;
  }
  const taken = takeItem(creature.inventory, stack.itemId, stack.count);
  if (taken.status === "ok") creature.inventory = taken.state;
}

/** Take the saddle off, back into the bag. */
export function unsaddle(ctx: GameContext): void {
  const creature = viewed(ctx);
  const def = creature === null ? null : defOf(creature);
  if (creature === null || def === null || !creature.saddled || def.saddle === null) return;
  if (ctx.player.inventory.put(BAG, def.saddle, 1).status !== "ok") return;
  creature.saddled = false;
}

/** Force-feed one narcotic (or stimulant) the creature holds: ARK's "use" on a downed creature. */
export function feedNarcotic(ctx: GameContext, itemId: string): void {
  const creature = viewed(ctx);
  const dose = NARCOTICS[itemId];
  if (creature === null || dose === undefined) return;
  const taken = takeItem(creature.inventory, itemId, 1);
  if (taken.status !== "ok") return;
  creature.inventory = taken.state;
  const world = worldOf(ctx);
  if (dose.torpor >= 0) world.taming.dose(creature.id, dose);
  else world.taming.addTorpor(creature.id, dose.torpor);
}

/** Admin cheats as ARK's console has them, for proofs and testing: taming speed and a forced tame. */
export function setTamingSpeed(ctx: GameContext, multiplier: number): void {
  worldOf(ctx).tamingSpeed = Math.max(0, multiplier);
}

/** ARK's `forcetame`: the wild creature in front is yours at once, at full effectiveness. */
export function forceTame(ctx: GameContext): void {
  const world = worldOf(ctx);
  const creature = world.aimed === null ? undefined : world.creatures.get(world.aimed);
  if (creature === undefined || creature.dead || creature.tamed) return;
  world.taming.forget(creature.id);
  tame(ctx, creature, 1, 0);
}

/** ARK's dino XP cheat: XP for the mount under you, or else the tame whose inventory is open. */
export function giveTameXp(ctx: GameContext, amount: number): void {
  const world = worldOf(ctx);
  const id = ridingOf(ctx).mountOf(ctx.player.userId) ?? world.viewing;
  const creature = id === null ? undefined : world.creatures.get(id);
  if (creature !== undefined) grantTameXp(ctx, creature, amount);
}

// --- what the HUD and screens read ------------------------------------------------------------------

function tamingView(world: World, creature: Creature, state: Readonly<TamingState> | null) {
  const def = defOf(creature);
  const max = world.taming.maxTorpor(creature.id);
  const food = Object.keys(def.taming.foods).find((itemId) => countItem(creature.inventory, itemId) > 0) ?? null;
  return state === null
    ? null
    : {
        torpor: Math.round(state.torpor),
        maxTorpor: Math.round(max),
        unconscious: state.unconscious,
        progress: state.progress,
        effectiveness: 1 / (1 + state.spent),
        nextMeal: Math.max(0, Math.ceil(state.nextMeal / world.tamingSpeed)),
        eating: food,
        foods: Object.keys(def.taming.foods),
      };
}

/** ARK's tame stat sheet: level, XP to the next, points to spend, and each stat with what a point adds. */
function growthView(creature: Creature) {
  const growth = creature.growth;
  if (growth === null) return null;
  const maxed = growth.gained >= TAME_LEVELS.max;
  return {
    tamedAt: growth.tamedAt,
    gained: growth.gained,
    xp: Math.floor(growth.xp),
    xpNext: maxed ? 0 : TAME_TRACK.xpForLevel(growth.gained + 1),
    maxed,
    unspent: TAME_POINTS.unspent(growth.points, growth.gained),
    stats: TAME_STATS.map((stat) => {
      const value = statOf(creature, stat.id);
      const shown = (amount: number) => (stat.unit === "%" ? Math.round(amount * 1000) / 10 : Math.round(amount * 10) / 10);
      return { id: stat.id, label: stat.label, unit: stat.unit, points: growth.points[stat.id], value: shown(value), gain: shown(value / (1 + growth.points[stat.id] * stat.perPoint) * stat.perPoint) };
    }),
  };
}

export function creatureCard(ctx: GameContext, id: string | null) {
  const world = worldOf(ctx);
  const creature = id === null ? undefined : world.creatures.get(id);
  if (creature === undefined) return null;
  const def = defOf(creature);
  const health = ctx.scene.entity.stats.get(creature.id, "health");
  return {
    id: creature.id,
    label: def.label,
    level: creature.level,
    temperament: def.temperament,
    diet: def.diet,
    health: { value: Math.max(0, Math.round(health?.current ?? 0)), max: Math.round(health?.max ?? 0) },
    tamed: creature.tamed,
    dead: creature.dead,
    saddled: creature.saddled,
    saddle: def.saddle,
    sex: creature.sex,
    mating: creature.mating,
    imprint: creature.imprint,
    mutations: creature.mutations,
    order: creature.tamed ? (world.roster.get(creature.id)?.command ?? null) : null,
    taming: creature.tamed ? null : tamingView(world, creature, world.taming.state(creature.id)),
    stamina: { value: Math.floor(creature.stamina), max: Math.round(statOf(creature, "stamina")) },
    growth: growthView(creature),
    inventory: creature.inventory.slots,
  };
}

export type CreatureCard = NonNullable<ReturnType<typeof creatureCard>>;

export function creaturesView(ctx: GameContext) {
  const world = worldOf(ctx);
  let tamed = 0;
  let down = 0;
  for (const creature of world.creatures.values()) {
    if (creature.dead) continue;
    if (creature.tamed) tamed += 1;
    else if (world.taming.state(creature.id)?.unconscious === true) down += 1;
  }
  const riding = ridingOf(ctx).mountOf(ctx.player.userId);
  return {
    aimed: creatureCard(ctx, world.aimed),
    viewing: creatureCard(ctx, world.viewing),
    riding: creatureCard(ctx, riding),
    count: [...world.creatures.values()].filter((creature) => !creature.dead).length,
    tamed,
    down,
  };
}

export type CreaturesView = ReturnType<typeof creaturesView>;

// --- save -----------------------------------------------------------------------------------------

interface CreaturesSave {
  creatures: Creature[];
  seq: number;
  driver: Record<string, CreatureDriverState>;
  taming: ReturnType<ReturnType<typeof createKnockoutTaming>["snapshot"]>;
  roster: Record<string, CompanionRecord>;
  carcasses: Record<string, ResourceNodeState>;
  director: PopulationDirectorState;
  riding: { riders: MountedRider[]; seats: Record<string, SeatOffset> };
  tamingSpeed: number;
}

export function creaturesSave(ctx: GameContext) {
  return {
    key: "fernwild.creatures",
    snapshot: (): CreaturesSave => {
      const world = worldOf(ctx);
      return {
        creatures: [...world.creatures.values()].map((creature) => structuredClone(creature)),
        seq: world.seq,
        driver: world.driver.snapshot(),
        taming: world.taming.snapshot(),
        roster: world.roster.snapshot(),
        carcasses: world.carcasses.snapshot(),
        director: world.director.snapshot(),
        riding: ridingOf(ctx).snapshot(),
        tamingSpeed: world.tamingSpeed,
      };
    },
    hydrate: (data: CreaturesSave) => {
      const world = worldOf(ctx);
      world.creatures = new Map(data.creatures.map((saved) => {
        const creature = structuredClone(saved);
        creature.lastHitBy ??= null;
        creature.growth = creature.growth == null ? (creature.tamed ? { tamedAt: creature.level, gained: 0, xp: 0, points: TAME_POINTS.empty() } : null) : { ...creature.growth, points: TAME_POINTS.normalize(creature.growth.points) };
        creature.stamina ??= statOf(creature, "stamina");
        return [creature.id, creature];
      }));
      world.seq = data.seq;
      world.populated = true;
      world.driver.restore(data.driver);
      world.taming.restore(data.taming);
      world.roster.hydrate(data.roster);
      world.carcasses.hydrate(data.carcasses);
      world.director.hydrate(data.director);
      ridingOf(ctx).restore(data.riding);
      world.tamingSpeed = data.tamingSpeed;
    },
  };
}

export function resetCreatures(ctx: GameContext): void {
  const world = worldOf(ctx);
  ridingOf(ctx).reset();
  for (const id of world.creatures.keys()) ctx.scene.entity.despawn(id);
  world.creatures.clear();
  world.steps.clear();
  world.driver.reset();
  world.taming.reset();
  world.roster.hydrate({});
  world.populated = false;
  world.aimed = null;
  world.viewing = null;
  world.lastTarget = null;
}

/** Hotbar too: ARK lets you drag from either. Exposed for the screen. */
export const CREATURE_SOURCES = [BAG, HOTBAR] as const;
