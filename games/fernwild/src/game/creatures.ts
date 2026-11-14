import { createCreatureDriver, type CreatureBody, type CreatureTerrain, type CreatureDriverState, type CreatureStep } from "@jgengine/core/ai/creatureDriver";
import { createPopulationDirector, type PopulationDirector, type PopulationDirectorState } from "@jgengine/core/ai/populationDirector";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { countItem, createEmptyInventory, putItem, takeItem, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { solidObstaclesNear } from "@jgengine/core/movement/solidObstacles";
import type { NavPoint } from "@jgengine/core/nav/navGrid";
import type { DoseSupply } from "@jgengine/core/stats/doseTable";
import type { VitalDose } from "@jgengine/core/stats/vitals";
import { resolveEncumbrance, totalLoad, type EncumbranceState } from "@jgengine/core/inventory/encumbrance";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { leveling } from "@jgengine/core/progression/leveling";
import { createStatPoints, type StatPointSheet } from "@jgengine/core/progression/statPoints";
import { createCompanionRoster, type CompanionCommand, type CompanionRecord, type CompanionStance } from "@jgengine/core/scene/companion";
import { ridingOf, type SeatOffset } from "@jgengine/core/scene/riding";
import type { MountedRider } from "@jgengine/core/scene/mount";
import { scatterPoints } from "@jgengine/core/inheritance/inheritance";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { createCarrierField, type CarrierField, type CarrierState } from "@jgengine/core/movement/carrier";
import { createResourceNodeField, type ResourceGrant, type ResourceNodeState, type ToolProfile } from "@jgengine/core/world/resourceNode";
import { playerMovementHeading } from "@jgengine/core/movement/playerMovement";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { itemDef, itemLabel, itemTraits } from "./data/items";
import { IMPRINT_BONUS, IMPRINTED_STATS, MUTATIONS } from "./data/breeding";
import { TROPHY_DROPS } from "./data/bosses";
import { botProfile, HOSTILE, packBonus, revertChance, rollQuirk, SIGNAL_STORM, stormAt, targetScore, traitDef, traitMultiplier, type StrikeTrick, type TargetFacts } from "./data/bots";
import { killXp, SPECIES, speciesDef, statAt, TAME_LEVELS, TAME_STATS, temperamentOf, WILD_LEVELS, wildLevelCap,WILD_STATS, type SpeciesDef, type TameStat, type WildStat } from "./data/species";
import { bonusLevels, NARCOTICS } from "./data/taming";
import { createKnockoutTaming, type KnockoutTaming, type TamingRead, type TamingSave } from "./knockoutTaming";
import { setScreen } from "./screens";
import { drainSurvivorStamina, heldItem, nearestHarvestable, patchSurvivor, strikeHarvestable } from "./survivor";
import { depositInto, homeBox, powerStations } from "./base";
import { climateAt } from "./climate";
import { biteProfile, loadShare, TAME_GATHER } from "./data/tameWork";
import { backDeck } from "./data/robotBodies";
import { AIRBORNE, FLYERS, LIFT_HANG, LIFT_REACH } from "./data/flight";
import { SWIM_DEPTH, SWIM_SLOW, SWIMMERS } from "./data/swim";
import { SEA_LEVEL } from "../world";

/** Slots in a creature's own inventory (ARK caps it by weight; slots are the simple stand-in). */
const CREATURE_SLOTS = 30;
/** Seconds a body lies before it rots away. */
const CARCASS_SECONDS = 300;
/** Seconds before a killed or tamed creature's slot in its herd refills. */
const RESPAWN_SECONDS = 240;
/** How far a whistle carries to your tames. */
const WHISTLE_RANGE = 30;
/** How far an aggressive tame looks for a wild creature to pick a fight with (approx ARK's aggro radius). */
const AGGRESSIVE_RANGE = 15;
/** How far E and a swing reach a creature, past its body. */
const USE_REACH = 3;
/** A bola wraps nothing bigger than this body radius, metres (ARK: big creatures shrug it off; approx). */
const BOLA_MAX_RADIUS = 1.6;
/** Sea and shallows creatures will not walk into. */
const SHORE = 0.4;
/** A tame's carrying bands, as the survivor's: slowed from 85% of its weight stat, stuck at the limit. */
const TAME_ENCUMBRANCE = { soft: 0.85, floor: 0.5 } as const;

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
  /** A bred creature's lineage: which parent each wild stat came from, and which a mutation raised; null for one born wild. */
  lineage: Lineage | null;
  /** A tame left to mate with tames of its kind nearby (ARK's Enable Mating). */
  mating: boolean;
  /** How much of its imprint it had as a baby, 0 to 1: every stat but stamina, oxygen and speed up to 20% more. */
  imprint: number;
  /** Quirks from a sloppy upload and glitches from forging (bots.ts), for good. */
  traits: string[];
  /** Machines it has torn apart (a Scrapper Rex grows on them). */
  scrapped: number;
  /** A Rootkit standing still as a tree until the forest is disturbed. */
  dormant: boolean;
  /** Its Harvest chip is in: on Guard Zone it works the nearest node of its specialty into its own inventory. */
  harvesting: boolean;
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
  | { type: "killed"; id: string; label: string; level: number; byPlayer: boolean }
  | { type: "trick"; id: string; label: string; trick: StrikeTrick["kind"]; detail: string }
  | { type: "storm"; on: boolean; reverted: string[] }
  | { type: "ping"; id: string; hostiles: number };

interface World {
  creatures: Map<string, Creature>;
  driver: ReturnType<typeof createCreatureDriver>;
  taming: KnockoutTaming;
  roster: ReturnType<typeof createCompanionRoster>;
  carcasses: ReturnType<typeof createResourceNodeField>;
  director: PopulationDirector;
  regions: Map<string, { center: [number, number, number]; radius: number; maxLevel: number }>;
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
  /** The last tame's taming effectiveness and bonus levels, for the HUD and proofs. */
  lastTame: { effectiveness: number; bonus: number } | null;
  /** The creature each flyer holds in its talons, by flyer. */
  carried: Map<string, string>;
  /** The last creature a flyer lifted and where it was lifted from, for the HUD and proofs. */
  lastLift: { id: string; from: [number, number] } | null;
  /** Who is making noise and until when (game seconds): swings, shots and sprints draw the loud-seekers. */
  noise: Map<string, { amount: number; until: number }>;
  /** The last trick a bot pulled and where, for an Echo Mimic to copy. */
  lastTrick: { trick: StrikeTrick; at: readonly [number, number, number]; time: number } | null;
  /** A Signal Storm is on. */
  storm: boolean;
  /** The Root Server is down: no more storms. */
  stormsEnded: boolean;
  /** A storm forced on or off whatever the night (a console, a proof); null follows the schedule. */
  stormForced: boolean | null;
  /** Hostiles each sentry last pinged, so it pings once per arrival. */
  pinged: Map<string, number>;
  /** Seconds to each sentry's next sweep. */
  sweep: number;
  /** Seconds to the harvesters' next swing. */
  harvestIn: number;
  /** Tames frozen by the Hivemind's signal, until when (game seconds). */
  puppeted: Map<string, number>;
  /** Uploaded platform bots (the Hoover): their backs carry whoever stands on them. */
  carriers: CarrierField;
}

const TAMING = Object.fromEntries(Object.values(SPECIES).map((def) => [def.id, def.taming]));

/** Wild creatures farther than this from the survivor think in coarse steps of {@link FAR_STEP} seconds. */
const NEAR_RANGE = 60;
const FAR_STEP = 0.25;
/** Herds wake when the survivor comes this close to their zone and sleep (wild ones vanish) past it. */
const AWAKE_RANGE = 220;
/** A herd never refills in plain view: only once the survivor is this many metres from the spawn point. */
const REFILL_UNSEEN = 60;
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
  const start = markersOfKind(editorLayers, "player_spawn")[0];
  return markersOfKind(editorLayers, "creature_spawn").flatMap((marker) => {
    const meta = (marker.meta ?? {}) as { species?: readonly ZoneSpecies[]; count?: number; radius?: number };
    const listed = meta.species ?? [];
    const species = shareOut(meta.count ?? 2, listed).filter((entry) => entry.cap > 0 && speciesDef(entry.species) !== null);
    if (species.length === 0) return [];
    const radius = meta.radius ?? 14;
    const center: [number, number, number] = [marker.position.x, marker.position.y, marker.position.z];
    const ring: NavPoint[] = Array.from({ length: 8 }, (_, i) => [center[0] + Math.cos((i / 8) * Math.PI * 2) * radius * 0.6, center[2] + Math.sin((i / 8) * Math.PI * 2) * radius * 0.6] as const);
    const fromStart = start === undefined ? Infinity : Math.hypot(center[0] - start.position.x, center[2] - start.position.z);
    return [{ region: marker.id, species, radius, center, ring, maxLevel: wildLevelCap(fromStart) }];
  });
}

const worldOf = perContext((ctx: GameContext): World => {
  const authored = herds();
  // After movement, as riding seats its rider: a lifted creature hangs under its flyer wherever it flew.
  ctx.sim.addStage({ id: "airlift", phase: "afterMovement", run: () => holdLifted(ctx) });
  // After movement too: whoever stands on a walking platform's back rides along with it.
  ctx.sim.addStage({ id: "carriers", phase: "afterMovement", run: () => worldOf(ctx).carriers.step(ctx) });
  return {
    creatures: new Map(),
    driver: createCreatureDriver({
      sight: 24,
      memorySeconds: 10,
      blocked: (context, x, z) => context.world.groundHeightAt(x, z) < SHORE,
      waterSurface: (context, x, z) => waterSurface(context, x, z),
      notices: (context, self, candidate) => notices(context, self, candidate),
    }),
    taming: createKnockoutTaming(TAMING),
    roster: createCompanionRoster(),
    carcasses: createResourceNodeField({ nodes: [], resolve: (id) => carcassNode(worldOf(ctx), id), rng: () => ctx.rng() }),
    director: createPopulationDirector({
      regions: authored.map((herd) => ({ region: herd.region, species: herd.species, spawnPoints: herd.ring })),
      respawnDelay: RESPAWN_SECONDS,
      seed: 7,
    }),
    regions: new Map(authored.map((herd) => [herd.region, { center: herd.center, radius: herd.radius, maxLevel: herd.maxLevel }])),
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
    lastTame: null,
    carried: new Map(),
    lastLift: null,
    noise: new Map(),
    lastTrick: null,
    storm: false,
    stormsEnded: false,
    stormForced: null,
    pinged: new Map(),
    sweep: 0,
    harvestIn: 0,
    puppeted: new Map(),
    carriers: createCarrierField({ solidsLayer: "fernwild:carriers" }),
  };
});

function carcassNode(world: World, id: string) {
  const creature = world.creatures.get(id);
  const def = creature === undefined ? null : speciesDef(creature.species);
  if (creature === undefined || def === null || !creature.dead) return null;
  return { id, budget: def.carcass.hits, resources: [{ kind: "biogel", amount: def.carcass.meat }, { kind: "salvage", amount: def.carcass.salvage }] };
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
  const imprinted = IMPRINTED_STATS.includes(stat) ? tamed * (1 + IMPRINT_BONUS * creature.imprint) : tamed;
  return stat === "health" || stat === "melee" || stat === "speed" || stat === "weight" ? imprinted * traitMultiplier(creature.traits, stat) : imprinted;
}

/** What a creature carries against its weight stat: its specialty items weigh what it feels them at (`LIGHTER_LOADS`). */
function loadOf(creature: Creature): EncumbranceState {
  const stacks = creature.inventory.slots.flatMap((slot) => (slot === null ? [] : [{ itemId: slot.itemId, quantity: slot.count }]));
  return resolveEncumbrance(totalLoad(stacks, (itemId) => (itemDef(itemId)?.weight ?? 0) * loadShare(creature.species, itemId)), statOf(creature, "weight"), TAME_ENCUMBRANCE);
}

function maxHealth(creature: Creature): number {
  return Math.round(statOf(creature, "health"));
}

function body(ctx: GameContext, world: World, creature: Creature): CreatureBody {
  const def = defOf(creature);
  const overclocked = !creature.tamed && world.storm;
  const pace = overclocked ? SIGNAL_STORM.speed : 1;
  const melee = statOf(creature, "melee") * (creature.tamed ? 1 : wildMelee(ctx, world, creature)) * (overclocked ? SIGNAL_STORM.melee : 1);
  return {
    walk: def.walk * statOf(creature, "speed") * loadOf(creature).moveMultiplier * pace,
    sprint: def.sprint * statOf(creature, "speed") * loadOf(creature).moveMultiplier * pace,
    attack: def.attack === null ? null : { effect: "damage", amount: def.attack.damage * melee, interval: def.attack.interval, reach: def.attack.reach + def.radius },
    // An ambusher holds its post; everything else grazes its zone.
    wander: { radius: botProfile(creature.species)?.temperament === "ambush" ? 0.5 : (world.regions.get(creature.region)?.radius ?? 16) },
    // Swimmers keep to their element: tamed ones too, except when ridden (riding has its own swim).
    terrain: botProfile(creature.species)?.terrain ?? "land",
    swimDepth: SWIM_UNDER,
  };
}

/**
 * A wild bot's melee on top of its stats: a pack's buff for packmates close by, a Choir's song from any
 * singer near it, and the parts a Scrapper Rex has torn from other machines.
 */
function wildMelee(ctx: GameContext, world: World, creature: Creature): number {
  const profile = botProfile(creature.species);
  const self = ctx.scene.entity.get(creature.id)?.position;
  if (self === undefined) return 1;
  let packmates = 0;
  let song = 1;
  for (const other of world.creatures.values()) {
    if (other === creature || other.dead || other.tamed) continue;
    const at = ctx.scene.entity.get(other.id)?.position;
    if (at === undefined) continue;
    const distance = Math.hypot(at[0] - self[0], at[2] - self[2]);
    if (profile?.pack !== undefined && other.species === creature.species && distance <= profile.pack.radius) packmates += 1;
    const aura = botProfile(other.species)?.aura;
    if (aura !== undefined && other.species !== creature.species && distance <= aura.radius) song = Math.max(song, aura.damage);
  }
  const scraps = profile?.scraps === undefined ? 1 : 1 + Math.min(profile.scraps.max - 1, creature.scrapped * profile.scraps.perKill);
  return packBonus(profile?.pack, packmates) * song * scraps;
}

/**
 * The conductor of a wild singing ring `creature` belongs to: the highest-level wild singer of its species
 * within the ring's reach (ties to the oldest id), or null when it sings alone or is not a singer.
 */
function conductorOf(ctx: GameContext, world: World, creature: Creature): string | null {
  const ring = botProfile(creature.species)?.conducted;
  const self = ctx.scene.entity.get(creature.id)?.position;
  if (ring === undefined || creature.tamed || self === undefined) return null;
  let best: Creature | null = null;
  let members = 0;
  for (const other of world.creatures.values()) {
    if (other.species !== creature.species || other.dead || other.tamed) continue;
    const at = ctx.scene.entity.get(other.id)?.position;
    if (at === undefined || Math.hypot(at[0] - self[0], at[2] - self[2]) > ring.radius) continue;
    members += 1;
    if (best === null || other.level > best.level || (other.level === best.level && other.id < best.id)) best = other;
  }
  return members < 2 || best === null ? null : best.id;
}

/** Who a wild bot reacts to: the technician (unless riding a light-bending Mirrorcat); other machines too when it hunts machines. */
function notices(ctx: GameContext, selfId: string, candidateId: string): boolean {
  const entity = ctx.scene.entity.get(candidateId);
  if (entity?.role === "player") {
    // Riding, the technician steers the mount: either id may stand for the pair.
    const riding = ridingOf(ctx);
    const mount = riding.mountOf(candidateId) ?? (riding.riderOf(candidateId) !== null ? candidateId : null);
    const cloaked = mount !== null && botProfile(worldOf(ctx).creatures.get(mount)?.species ?? "")?.cloak === true;
    const hitBy = worldOf(ctx).creatures.get(selfId)?.lastHitBy;
    return !cloaked || hitBy === candidateId || hitBy === ctx.player.userId;
  }
  const world = worldOf(ctx);
  const self = world.creatures.get(selfId);
  const other = world.creatures.get(candidateId);
  if (self === undefined || other === undefined || other.dead || other.species === self.species) return false;
  // A mount carries its rider into the fight: hunters go for it, unless it bends light around them both.
  const rider = ridingOf(ctx).riderOf(candidateId);
  if (rider !== null && HOSTILE.has(defOf(self).temperament)) return botProfile(other.species)?.cloak !== true || self.lastHitBy === rider;
  return botProfile(self.species)?.targets.includes("machines") === true || (world.storm && other.tamed);
}

/** Item worth to a thief, per unit: gear and relics first, refined goods a little. */
function lootValue(itemId: string): number {
  const def = itemDef(itemId);
  if (def === null) return 0;
  if (itemId.startsWith("artifact_") || itemId === "element" || itemId.includes("trophy")) return 10;
  if (def.kind === "tool" || def.kind === "armor" || def.kind === "saddle") return 5;
  return ["metal_ingot", "crystal", "obsidian", "oil", "metal", "sparkpowder"].includes(itemId) ? 0.2 : 0;
}

/** What a candidate looks like to a wild bot choosing whom to go for. */
function targetFacts(ctx: GameContext, world: World, self: Creature, candidateId: string): TargetFacts {
  const entity = ctx.scene.entity.get(candidateId);
  const other = world.creatures.get(candidateId);
  const health = ctx.scene.entity.stats.get(candidateId, "health");
  const speed = entity === null ? 0 : Math.hypot(entity.velocity[0], entity.velocity[2]);
  const noise = world.noise.get(candidateId);
  const loud = Math.min(1, speed / 8 + (noise !== undefined && noise.until > ctx.time.now() ? noise.amount : 0));
  const fraction = ctx.time.calendar().dayFraction;
  const night = fraction < 0.25 || fraction > 0.78;
  const isMe = candidateId === ctx.player.userId;
  const bright = isMe && night && heldItem(ctx) === "torch" ? 1 : 0;
  let rich = 0;
  if (isMe) for (const bag of CREATURE_SOURCES) for (const slot of ctx.player.inventory.state(bag).slots) if (slot !== null) rich += lootValue(slot.itemId) * slot.count;
  return {
    loud,
    bright,
    rich: Math.min(1, rich / 40),
    hurt: health === null || health.max <= 0 ? 0 : 1 - Math.max(0, health.current) / health.max,
    machine: other !== undefined,
    attacker: self.lastHitBy === candidateId,
    size: other === undefined ? 0.15 : Math.min(1, defOf(other).radius / 4),
  };
}

/** Someone made a racket: swings, shots and sprints draw the bots that hunt the loudest. */
export function makeNoise(ctx: GameContext, id: string, amount: number, seconds = 3): void {
  worldOf(ctx).noise.set(id, { amount, until: ctx.time.now() + seconds });
}

// --- spawning -----------------------------------------------------------------------------

function rollLevel(ctx: GameContext, max: number): number {
  // Low levels are common and high ones rare, as on ARK's Island.
  return WILD_LEVELS.min + Math.floor(Math.pow(ctx.rng(), 1.6) * (max - WILD_LEVELS.min + 1));
}

/** The nearest open ground to `at` a body of `radius` fits on: never inside a trunk or a boulder, never in the sea. */
function openGround(ctx: GameContext, at: readonly [number, number], radius: number, terrain: CreatureTerrain = "land"): [number, number, number] | null {
  // A water-only bot needs water deep enough to swim under; it searches wider, rivers being narrow.
  const rings = terrain === "water" ? 8 : 4;
  const spacing = terrain === "water" ? 2 : 1;
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let step = 0; step < (ring === 0 ? 1 : 8); step += 1) {
      const angle = (step / 8) * Math.PI * 2;
      const x = at[0] + Math.sin(angle) * ring * spacing;
      const z = at[1] + Math.cos(angle) * ring * spacing;
      const y = ctx.world.groundHeightAt(x, z);
      if (terrain === "water") {
        const surface = waterSurface(ctx, x, z);
        if (surface !== null && y < surface - 1.2) return [x, surface - SWIM_UNDER, z];
        continue;
      }
      if ((terrain === "amphibious" || y >= SHORE) && solidObstaclesNear(ctx, [x, y, z], radius, radius).length === 0) {
        const surface = terrain === "amphibious" ? waterSurface(ctx, x, z) : null;
        return [x, surface === null ? y : Math.max(y, surface - SWIM_UNDER), z];
      }
    }
  }
  return null;
}

/** How deep a wild swimmer travels under the surface, metres. */
const SWIM_UNDER = 0.6;

/** The water's surface over (x, z), or null where the ground is dry or only damp. */
function waterSurface(ctx: GameContext, x: number, z: number): number | null {
  return ctx.world.groundHeightAt(x, z) < SEA_LEVEL - 0.3 ? SEA_LEVEL : null;
}

/** What a creature is born with: a wild one rolls it, a bred one inherits it. */
export interface CreatureGenes {
  sex: "female" | "male";
  wild: Record<WildStat, number>;
  mutations: number;
  lineage: Lineage | null;
}

/** Which parent a bred creature's wild levels in one stat came from: "both" when they had the same. */
export type StatSource = "mother" | "father" | "both";

/** A bred creature's lineage, as ARK's stat screen shows it: its parents, each stat's parent, and each mutation's stat. */
export interface Lineage {
  mother: string;
  father: string;
  from: Record<WildStat, StatSource>;
  /** The stat each mutation raised, once per mutation (one stat can take two). */
  mutated: WildStat[];
}

/**
 * A bred creature's stats that match neither parent, its mutations taken off: 0 when it inherited every stat whole;
 * -1 for one born wild or whose parents are gone.
 */
export function lineageStrays(ctx: GameContext, id: string): number {
  const creatures = worldOf(ctx).creatures;
  const lineage = creatures.get(id)?.lineage ?? null;
  const child = creatures.get(id);
  const mum = lineage === null ? undefined : creatures.get(lineage.mother);
  const dad = lineage === null ? undefined : creatures.get(lineage.father);
  if (child === undefined || lineage === null || mum === undefined || dad === undefined) return -1;
  return WILD_STATS.filter((stat) => {
    const levels = child.wild[stat] - lineage.mutated.filter((field) => field === stat).length * MUTATIONS.amount;
    return levels !== mum.wild[stat] && levels !== dad.wild[stat];
  }).length;
}

export function spawnCreature(
  ctx: GameContext,
  species: string,
  at: readonly [number, number],
  options: { region?: string; level?: number; sex?: "female" | "male"; genes?: CreatureGenes; size?: number; traits?: readonly string[] } = {},
): string | null {
  const def = speciesDef(species);
  const position = def === null ? null : openGround(ctx, at, def.radius, botProfile(species)?.terrain ?? "land");
  if (def === null || position === null) return null;
  const world = worldOf(ctx);
  const id = `${species}_${(world.seq += 1)}`;
  const sex = ctx.rng() < 0.5 ? "female" : "male";
  const genes = options.genes ?? { sex: options.sex ?? sex, wild: scatterPoints((options.level ?? rollLevel(ctx, world.regions.get(options.region ?? "")?.maxLevel ?? WILD_LEVELS.max)) - 1, WILD_STATS, ctx.rng), mutations: 0, lineage: null };
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
    lineage: genes.lineage,
    mating: false,
    imprint: 0,
    traits: [...(options.traits ?? [])],
    scrapped: 0,
    dormant: botProfile(species)?.dormantUntilChop !== undefined && options.genes === undefined,
    harvesting: false,
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
    // The very first fill aside, wait until the survivor has wandered off.
    const near = world.populated && here !== null && Math.hypot(here[0] - point[0], here[2] - point[1]) < REFILL_UNSEEN;
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

/** How many live wild creatures stand within `within` metres of `from`. */
export function wildCountNear(ctx: GameContext, from: readonly [number, number, number], within: number): number {
  let count = 0;
  for (const creature of worldOf(ctx).creatures.values()) {
    if (creature.dead || creature.tamed) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at !== undefined && Math.hypot(at[0] - from[0], at[2] - from[2]) <= within) count += 1;
  }
  return count;
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
  // A body the aim line passes through wins, the nearest along the line, as a crosshair picks; a smaller body inside
  // a bigger one's reach along the line (a baby standing in its parent) wins over it. With the line through nothing,
  // the nearest within 60° of it, or so close the body fills the view.
  let hit: Creature | null = null;
  let hitAlong = Infinity;
  let hitBody = 0;
  let near: Creature | null = null;
  let nearDistance = Infinity;
  for (const creature of world.creatures.values()) {
    if (creature.id === fromId || !accept(creature)) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity === null) continue;
    const dx = entity.position[0] - from.position[0];
    const dz = entity.position[2] - from.position[2];
    const distance = Math.hypot(dx, dz);
    const radius = defOf(creature).radius;
    if (distance > reach + radius) continue;
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
    const body = radius * (entity.size ?? 1);
    const inside = hit !== null && body < hitBody && Math.abs(along - hitAlong) <= hitBody;
    const nearer = along < hitAlong && !(hit !== null && hitBody < body && Math.abs(along - hitAlong) <= body);
    if (along > -body && across <= body && (inside || nearer)) {
      hit = creature;
      hitAlong = along;
      hitBody = body;
    }
    const facing = distance < radius + 0.5 || along / Math.max(distance, 1e-6) > 0.5;
    if (facing && distance < nearDistance) {
      near = creature;
      nearDistance = distance;
    }
  }
  return hit ?? near;
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
export function strikeCreature(ctx: GameContext, attackerId: string, yaw: number, tool: { gather: ToolProfile; damage: number; hits?: readonly VitalDose[]; reach: number }, melee: number): CreatureStrike | null {
  const world = worldOf(ctx);
  const target = creatureInFront(ctx, attackerId, yaw, tool.reach, (creature) => !(creature.tamed && !creature.dead) && ridingOf(ctx).riderOf(creature.id) === null);
  if (target === null) return null;
  const def = defOf(target);
  if (target.dead) {
    const cut = world.carcasses.harvest(target.id, tool.gather, { multiplier: melee });
    if (cut.depleted) target.rot = Math.min(target.rot, 2);
    return { label: `${def.label} body`, granted: cut.granted, killed: false, knockedOut: false, xp: 0 };
  }
  return landHit(ctx, attackerId, target, tool.damage * melee, (tool.hits ?? []).map((dose) => ({ ...dose, amount: dose.amount * melee })));
}

/**
 * The first live wild creature along the aim within `range` metres: a shot passes a body whose radius
 * (plus a little slack for aiming) reaches the line, the nearest such body taking it.
 */
function creatureAlongAim(ctx: GameContext, fromId: string, yaw: number, range: number): Creature | null {
  const from = ctx.scene.entity.get(fromId);
  if (from === null) return null;
  const world = worldOf(ctx);
  const ax = Math.sin(yaw);
  const az = Math.cos(yaw);
  let best: Creature | null = null;
  let bestAlong = Infinity;
  for (const creature of world.creatures.values()) {
    if (creature.id === fromId || creature.dead || (creature.tamed && !creature.dead) || ridingOf(ctx).riderOf(creature.id) !== null) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity === null) continue;
    const dx = entity.position[0] - from.position[0];
    const dz = entity.position[2] - from.position[2];
    const along = dx * ax + dz * az;
    if (along <= 0 || along > range) continue;
    const off = Math.abs(dx * az - dz * ax);
    if (off > defOf(creature).radius + 0.6) continue;
    if (along < bestAlong) {
      best = creature;
      bestAlong = along;
    }
  }
  return best;
}

/** A shot from a ranged weapon: the first wild creature along the aim takes the ammo's damage and doses. */
export function shootCreature(ctx: GameContext, attackerId: string, yaw: number, range: number, shot: { damage: number; doses: readonly VitalDose[] }): CreatureStrike | null {
  const target = creatureAlongAim(ctx, attackerId, yaw, range);
  return target === null ? null : landHit(ctx, attackerId, target, shot.damage, shot.doses);
}

/** What a creature's body takes from a hit: no torpor for one immune to it, no hold for one too big for a bola. */
function dosesFor(def: SpeciesDef, doses: readonly VitalDose[]): VitalDose[] {
  return doses.filter((dose) => !(dose.vital === "torpor" && def.torporImmune === true) && !(dose.vital === "held" && def.radius > BOLA_MAX_RADIUS));
}

/** One blow or shot on a live creature: damage, aggro, its doses (torpor knocking it out, a bola's hold), and death. */
function landHit(ctx: GameContext, attackerId: string, target: Creature, dealt: number, doses: readonly VitalDose[]): CreatureStrike {
  const world = worldOf(ctx);
  const def = defOf(target);
  // A choir singer under a living conductor shrugs most of a hit off.
  const conductor = conductorOf(ctx, world, target);
  const shield = botProfile(target.species)?.conducted;
  const damage = conductor !== null && conductor !== target.id && shield !== undefined ? dealt * shield.shielded : dealt;
  if (damage < dealt) ctx.scene.entity.floatText({ instanceId: target.id, text: "Shielded: hit the conductor", kind: "damage" });
  target.lastHitBy = attackerId;
  ctx.scene.entity.effect({ from: attackerId, to: target.id, effect: "damage", via: { amount: damage } });
  world.driver.hurt(ctx, target.id, attackerId);
  world.lastTarget = { id: target.id, until: ctx.time.now() + 10 };
  const wasDown = world.taming.state(target.id)?.subdued === true;
  if (wasDown) world.taming.hurt(target.id, damage / maxHealth(target));
  const knockedOut = world.taming.hit(target.id, dosesFor(def, doses)) && !wasDown;
  if (knockedOut) knockOut(ctx, target);
  const killed = (ctx.scene.entity.stats.get(target.id, "health")?.current ?? 1) <= 0;
  if (killed) kill(ctx, target);
  return { label: def.label, granted: [], killed, knockedOut, xp: killed ? killXp(def, target.level) : 0 };
}

/**
 * Left click on a mount: it turns to where the camera aims (`yaw`), as the survivor's swing does, and bites
 * what is in front: a creature, a body (meat for its rider), or a tree, rock or bush (into its own inventory).
 */
export function mountBite(ctx: GameContext, yaw?: number): CreatureStrike | "riding" | null {
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
  if (yaw !== undefined && yaw !== entity.rotationY) ctx.scene.entity.setPose(mountId, { position: entity.position, rotationY: yaw });
  const bite = { gather: biteProfile(mount.species, def.diet), damage: def.attack.damage, reach: def.attack.reach + def.radius };
  const facing = yaw ?? entity.rotationY;
  const hit = strikeCreature(ctx, mountId, facing, bite, statOf(mount, "melee"));
  if (hit !== null) {
    for (const grant of hit.granted) {
      const whole = Math.floor(grant.amount + ctx.rng());
      if (whole > 0) ctx.player.inventory.put(BAG, grant.kind, whole);
    }
    return hit;
  }
  // Nothing alive in front: the bite works the tree, rock or bush there, into the mount's own inventory, as
  // ARK's gatherers do. One loaded to its limit stops working.
  if (loadOf(mount).immobile) {
    ctx.game.notices.push({ text: `Your ${def.label} is carrying too much to gather`, tone: "deny" });
    return "riding";
  }
  const granted = strikeHarvestable(ctx, entity.position, facing, bite.reach, bite.gather, statOf(mount, "melee"));
  for (const grant of granted ?? []) {
    const whole = Math.floor(grant.amount + ctx.rng());
    if (whole <= 0) continue;
    const put = putItem(mount.inventory, { slots: CREATURE_SLOTS }, itemTraits, grant.kind, whole);
    if (put.status === "ok") mount.inventory = put.state;
  }
  smelt(mount);

  return "riding";
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
  ctx.scene.entity.floatText({ instanceId: creature.id, text: "OFFLINE · E to jack in", kind: "pickup" });
  ctx.game.notices.push({ text: `The ${defOf(creature).label} is offline: its battery is drained. Press E to jack in and feed it firmware or biogel while the upload runs.`, tone: "success" });
}

function kill(ctx: GameContext, creature: Creature): void {
  const world = worldOf(ctx);
  if (creature.dead) return;
  if (ridingOf(ctx).riderOf(creature.id) !== null) ridingOf(ctx).dismount(ctx.player.userId);
  creature.dead = true;
  creature.rot = CARCASS_SECONDS;
  world.carriers.remove(creature.id);
  world.taming.forget(creature.id);
  world.driver.forget(creature.id);
  if (creature.tamed) {
    world.roster.release(creature.id);
    ctx.game.notices.push({ text: `Your ${defOf(creature).label} was killed`, tone: "deny" });
  } else if (creature.region !== "") {
    world.director.notifyRemoved(creature.region, creature.species);
  }
  // The wild ones the Hivemind's tribute asks for carry their trophy, to take from the body.
  const trophy = creature.tamed ? undefined : TROPHY_DROPS[creature.species];
  if (trophy !== undefined) {
    const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, trophy, 1);
    if (put.status === "ok") creature.inventory = put.state;
  }
  lie(ctx, creature.id, true);
  const killer = creature.lastHitBy === null ? undefined : world.creatures.get(creature.lastHitBy);
  if (killer?.growth != null && !killer.dead) grantTameXp(ctx, killer, killXp(defOf(creature), creature.level));
  // A Scrapper Rex tears the wreck apart and bolts the parts onto itself.
  if (killer !== undefined && !killer.dead && botProfile(killer.species)?.scraps !== undefined) {
    killer.scrapped += 1;
    ctx.scene.entity.floatText({ instanceId: killer.id, text: "Scrapped!", kind: "pickup" });
  }
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

/** How high a creature stands above the ground under it, metres. */
function heightAboveGround(ctx: GameContext, id: string): number {
  const entity = ctx.scene.entity.get(id);
  return entity === null ? 0 : entity.position[1] - ctx.world.groundHeightAt(entity.position[0], entity.position[2]);
}

/** Whether a creature stands in water deep enough to swim. */
function inDeepWater(ctx: GameContext, id: string): boolean {
  const entity = ctx.scene.entity.get(id);
  return entity !== null && SEA_LEVEL - ctx.world.groundHeightAt(entity.position[0], entity.position[2]) > SWIM_DEPTH;
}

/** A tame's second: the passive XP trickle, and stamina spent on a ridden sprint or in the air, or won back at rest. */
function tickTame(ctx: GameContext, creature: Creature, ridden: boolean, dt: number): void {
  grantTameXp(ctx, creature, TAME_LEVELS.passivePerSecond * dt);
  const max = statOf(creature, "stamina");
  const entity = ctx.scene.entity.get(creature.id);
  const moving = entity !== null && Math.hypot(entity.velocity[0], entity.velocity[2]) > 0.5;
  const sprinting = ridden && moving && ctx.input.isDown("sprint") && creature.stamina > 1;
  const flyer = FLYERS[creature.species];
  const flying = ridden && flyer !== undefined && heightAboveGround(ctx, creature.id) > AIRBORNE;
  const rate = (sprinting ? -defOf(creature).sprintStamina : 0) + (flying ? -flyer.stamina : 0) || (moving ? 0 : max * STAMINA_REGEN);
  creature.stamina = Math.max(0, Math.min(max, creature.stamina + rate * dt));
  const def = defOf(creature);
  // In water a swimmer swims at its own speed, which the water's slowing (applied to every swimmer) would otherwise cut.
  const swimmer = SWIMMERS[creature.species];
  const swimming = ridden && swimmer !== undefined && inDeepWater(ctx, creature.id);
  // Loaded past its weight the mount slows, and at the limit it cannot move. In the air a flyer flies at its flying speed.
  const walk = (flying ? flyer.speed : swimming ? swimmer.speed / SWIM_SLOW : def.walk * statOf(creature, "speed")) * loadOf(creature).moveMultiplier;
  // Ridden, the mount sprints at its own ARK ratio (a tamed lodestone 11.04 / 4.8 m/s), not the survivor's.
  const run = (def.tamedSprint ?? def.sprint) / def.walk;
  const moved = entity === null ? null : entity.movement;
  if (ridden && moved !== null && (Math.abs((moved.walkSpeed ?? 0) - walk) > 0.01 || moved.runMultiplier !== run)) ctx.scene.entity.update(creature.id, { movement: { ...moved, walkSpeed: walk, runMultiplier: run } });
}

/** Whether the survivor rides a flyer with the stamina to hold itself up: false drops it out of the sky. */
export function mountCanFly(ctx: GameContext): boolean {
  const mountId = ridingOf(ctx).mountOf(ctx.player.userId);
  const mount = mountId === null ? undefined : worldOf(ctx).creatures.get(mountId);
  return mount !== undefined && FLYERS[mount.species] !== undefined && mount.stamina > 1 && !loadOf(mount).immobile;
}

/** Whether the survivor rides through deep water, and whether their mount is one of the swimmers. */
export function mountSwim(ctx: GameContext): { swimming: boolean; swimmer: boolean } {
  const mountId = ridingOf(ctx).mountOf(ctx.player.userId);
  const mount = mountId === null ? undefined : worldOf(ctx).creatures.get(mountId);
  return { swimming: mount !== undefined && inDeepWater(ctx, mount.id), swimmer: mount !== undefined && SWIMMERS[mount.species] !== undefined };
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
  worldOf(ctx).lastTame = { effectiveness, bonus };
  creature.level += bonus;
  // ARK's taming bonus levels land on random stats like wild ones, and pass to babies the same way.
  const extra = scatterPoints(bonus, WILD_STATS, ctx.rng);
  for (const stat of WILD_STATS) creature.wild[stat] += extra[stat];
  makeTame(ctx, creature);
  ctx.scene.entity.floatText({ instanceId: creature.id, text: "UPLOAD COMPLETE", kind: "pickup" });
  ctx.game.notices.push({ text: `${defOf(creature).label} uploaded! Level ${creature.level} (+${bonus} from ${Math.round(effectiveness * 100)}% upload integrity)`, tone: "success" });
  // A sloppy upload leaves a permanent quirk.
  const quirk = rollQuirk(effectiveness, ctx.rng);
  if (quirk !== null && !creature.traits.includes(quirk)) {
    creature.traits.push(quirk);
    const health = maxHealth(creature);
    ctx.scene.entity.stats.set(creature.id, "health", { max: health, current: health });
    ctx.game.notices.push({ text: `The upload was sloppy: your ${defOf(creature).label} picked up a quirk, ${traitDef(quirk)?.label ?? quirk}.`, tone: "deny" });
  }
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
  mountDeck(world, creature);
}

/** The crane an uploaded crane bot near the technician lends the build ghost, or null. */
export function craneNear(ctx: GameContext): { reach: number; lift: number } | null {
  const me = ctx.scene.entity.get(ctx.player.userId)?.position;
  if (me === undefined) return null;
  for (const creature of worldOf(ctx).creatures.values()) {
    const crane = botProfile(creature.species)?.crane;
    if (crane === undefined || !creature.tamed || creature.dead) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at !== undefined && Math.hypot(at[0] - me[0], at[2] - me[2]) <= crane.radius) return { reach: crane.reach, lift: crane.lift };
  }
  return null;
}

/** A smelting bot (Thermite Beetle) turns the metal ore in its inventory into ingots as it cuts. */
function smelt(creature: Creature): void {
  const per = botProfile(creature.species)?.smelts?.per;
  if (per === undefined) return;
  const ore = countItem(creature.inventory, "metal");
  const ingots = Math.floor(ore / per);
  if (ingots <= 0) return;
  const taken = takeItem(creature.inventory, "metal", ingots * per);
  if (taken.status !== "ok") return;
  const put = putItem(taken.state, { slots: CREATURE_SLOTS }, itemTraits, "metal_ingot", ingots);
  if (put.status === "ok") creature.inventory = put.state;
}

/** Where each Klepto with stolen goods keeps its nest, and how many stacks lie there: for the world to draw. */
export function kleptoNests(ctx: GameContext): { id: string; at: readonly [number, number, number]; stacks: number }[] {
  const world = worldOf(ctx);
  const out: { id: string; at: readonly [number, number, number]; stacks: number }[] = [];
  for (const creature of world.creatures.values()) {
    if (botProfile(creature.species)?.trick?.kind !== "steal" || creature.tamed || creature.dead) continue;
    const stacks = creature.inventory.slots.filter((slot) => slot !== null).length;
    const home = world.driver.state(creature.id)?.home;
    if (stacks > 0 && home !== undefined) out.push({ id: creature.id, at: home, stacks });
  }
  return out;
}

/** An uploaded platform bot gets a deck on its back; a wild one, or a dead one, has none. */
function mountDeck(world: World, creature: Creature): void {
  const deck = botProfile(creature.species)?.platform === true ? backDeck(creature.species) : null;
  if (deck !== null && creature.tamed && !creature.dead) world.carriers.add(creature.id, deck);
  else world.carriers.remove(creature.id);
}

/** E on an uploaded platform bot's card: climb onto the middle of its back. */
export function boardCarrier(ctx: GameContext): void {
  const world = worldOf(ctx);
  const creature = viewed(ctx);
  if (creature === null || !world.carriers.has(creature.id)) return;
  const deck = backDeck(creature.species);
  const self = ctx.scene.entity.get(creature.id);
  if (deck === null || self === null) return;
  closeCreature(ctx);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [self.position[0], self.position[1] + deck.height + 0.05, self.position[2]], rotationY: self.rotationY });
  ctx.game.notices.push({ text: `Aboard the ${defOf(creature).label}: it carries you as it walks. Step off its edge to get down.`, tone: "success" });
}

/** Whether the technician stands on a platform bot's back right now, and which. */
export function aboard(ctx: GameContext): string | null {
  const world = worldOf(ctx);
  for (const creature of world.creatures.values()) if (world.carriers.has(creature.id) && world.carriers.carries(ctx, creature.id, ctx.player.userId)) return creature.id;
  return null;
}

/** A bred baby: hatched or born beside `at`, the survivor's from the first moment. Returns its id. */
export function spawnBaby(ctx: GameContext, species: string, at: readonly [number, number], genes: CreatureGenes, size: number, traits: readonly string[] = []): string | null {
  const id = spawnCreature(ctx, species, at, { genes, size, traits });
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

/** The most taming progress (0..1) any awake wild creature still carries: 0 when waking loses the tame. */
export function awakeTamingProgress(ctx: GameContext): number {
  const world = worldOf(ctx);
  let most = 0;
  for (const creature of world.creatures.values()) {
    const state = creature.tamed || creature.dead ? null : world.taming.state(creature.id);
    if (state !== null && !state.subdued) most = Math.max(most, state.progress);
  }
  return most;
}

/** The last creature tamed: its taming effectiveness (0-1) and the bonus levels it gave; null before any. */
export function lastTame(ctx: GameContext): { effectiveness: number; bonus: number } | null {
  return worldOf(ctx).lastTame;
}

/** For proofs and admins: put a wild creature straight to sleep, as if clubbed under. */
export function knockOutNow(ctx: GameContext, id: string): boolean {
  const world = worldOf(ctx);
  const creature = world.creatures.get(id);
  if (creature === undefined || creature.dead || creature.tamed) return false;
  if (!world.taming.hit(id, [{ vital: "torpor", amount: (world.taming.state(id)?.maxTorpor ?? 0) * 2 }])) return false;
  knockOut(ctx, creature);
  return true;
}

/** Wild females awake and alive, where they stand: the ones that lay eggs. */
export function wildFemales(ctx: GameContext): { id: string; species: string; at: readonly [number, number, number]; radius: number }[] {
  const world = worldOf(ctx);
  const out = [];
  for (const creature of world.creatures.values()) {
    if (creature.tamed || creature.dead || creature.sex !== "female" || world.taming.state(creature.id)?.subdued === true) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity !== null) out.push({ id: creature.id, species: creature.species, at: entity.position, radius: defOf(creature).radius });
  }
  return out;
}

/** A creature's genes, for its babies; null when it is gone. */
export function genesOf(ctx: GameContext, id: string): CreatureGenes | null {
  const creature = worldOf(ctx).creatures.get(id);
  return creature === undefined ? null : { sex: creature.sex, wild: { ...creature.wild }, mutations: creature.mutations, lineage: creature.lineage };
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

/** A creature's own inventory as something it eats from; null when there is no such creature. */
export function creatureSupply(ctx: GameContext, id: string): DoseSupply | null {
  const creature = worldOf(ctx).creatures.get(id);
  return creature === undefined ? null : feeder(creature);
}

/** Starving: it loses `share` of its max health, and dies when that runs out. */
export function starveCreature(ctx: GameContext, id: string, share: number): void {
  const creature = worldOf(ctx).creatures.get(id);
  const health = ctx.scene.entity.stats.get(id, "health");
  if (creature === undefined || creature.dead || health === null) return;
  const current = health.current - health.max * share;
  ctx.scene.entity.stats.set(id, "health", { current: Math.max(0, current) });
  if (current <= 0) kill(ctx, creature);
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

function feeder(creature: Creature): DoseSupply {
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

/** Living wild creatures within `within` metres of `from`: what an aggressive tame picks fights with. */
function wildAround(ctx: GameContext, world: World, from: readonly [number, number, number] | undefined, within: number): string[] {
  if (from === undefined) return [];
  const out: string[] = [];
  for (const creature of world.creatures.values()) {
    if (creature.dead || creature.tamed) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at !== undefined && Math.hypot(at[0] - from[0], at[2] - from[2]) <= within) out.push(creature.id);
  }
  return out;
}

function threatsTo(world: World, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const [id, step] of world.steps) if (step.targetId !== null && ids.includes(step.targetId) && !world.creatures.get(id)?.tamed) out.push(id);
  return out;
}

export function tickCreatures(ctx: GameContext, dt: number): CreatureEvent[] {
  const world = worldOf(ctx);
  const events: CreatureEvent[] = [];
  const riding = ridingOf(ctx);
  const lifted = new Set(world.carried.values());
  const owner = ctx.scene.entity.get(ctx.player.userId);
  const ownerTarget = world.lastTarget !== null && world.lastTarget.until > ctx.time.now() && world.creatures.get(world.lastTarget.id)?.dead === false ? world.lastTarget.id : null;

  for (const { id, event } of world.taming.tick(dt, (id) => {
    const creature = world.creatures.get(id);
    return creature === undefined ? null : feeder(creature);
  }, world.tamingSpeed)) {
    const creature = world.creatures.get(id);
    if (creature === undefined) continue;
    const label = defOf(creature).label;
    if (event.type === "subdued") {
      knockOut(ctx, creature);
      events.push({ type: "knockedOut", id, label });
    } else if (event.type === "released") {
      lie(ctx, id, false);
      if (world.viewing === id) closeCreature(ctx);
      ctx.game.notices.push({ text: `The ${label} recharged and rebooted wild: the upload is lost.`, tone: "deny" });
      ctx.scene.entity.floatText({ instanceId: id, text: "REBOOTED", kind: "damage" });
      events.push({ type: "woke", id, label });
    } else if (event.type === "ate") {
      ctx.scene.entity.floatText({ instanceId: id, text: `Ate ${itemLabel(event.itemId)}`, kind: "pickup" });
    } else if (event.type === "won") {
      tame(ctx, creature, event.effectiveness, bonusLevels(creature.level, event.effectiveness));
      events.push({ type: "tamed", id, label, level: creature.level, effectiveness: event.effectiveness });
    }
  }

  events.push(...tickStorm(ctx, world));
  tickSentries(ctx, world, dt);
  tickHarvesters(ctx, world, dt);
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
    const taming = world.taming.state(creature.id);
    // Out cold, or tangled in a bola: it stays where it is.
    const down = taming !== null && (taming.subdued || taming.held > 0);
    const ridden = riding.riderOf(creature.id) !== null || lifted.has(creature.id);
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
    const puppet = world.puppeted.get(creature.id);
    const frozen = puppet !== undefined && puppet > ctx.time.now();
    if (puppet !== undefined && !frozen) world.puppeted.delete(creature.id);
    const mind = down || ridden || frozen
      ? ({ kind: "still" } as const)
      : record !== null
        ? ({
            kind: "tamed",
            intent: world.roster.resolveIntent(creature.id, {
              ownerPosition: owner?.position ?? null,
              ownerTargetId: ownerTarget,
              threats,
              nearby: record.stance === "aggressive" ? wildAround(ctx, world, self?.position, AGGRESSIVE_RANGE) : [],
            })!,
          } as const)
        : creature.dormant || perchedByDay(ctx, creature)
          ? ({ kind: "still" } as const)
          : wildMind(ctx, world, creature, def);
    const step = world.driver.step(ctx, creature.id, mind, body(ctx, world, creature), stepDt);
    world.steps.set(creature.id, step);
    const bitten = step.struck && step.targetId !== null ? world.creatures.get(step.targetId) : undefined;
    if (bitten !== undefined) {
      bitten.lastHitBy = creature.id;
      world.driver.hurt(ctx, bitten.id, creature.id);
    }
    if (step.struck && step.targetId !== null && !creature.tamed) {
      const trick = trickEvent(ctx, world, creature, step.targetId);
      if (trick !== null) events.push(trick);
    }
    if (creature.growth !== null) tickTame(ctx, creature, ridden, dt);
    if (record !== null) rideShoulder(ctx, creature, record.command);
    else burrow(ctx, creature, step.mode);
  }

  const here = owner?.position ?? null;
  world.sinceHerdCheck += dt;
  const moved = here !== null && (world.herdCheckedAt === null || Math.hypot(here[0] - world.herdCheckedAt[0], here[2] - world.herdCheckedAt[2]) > HERD_CHECK_MOVE);
  if (!world.populated || moved || world.sinceHerdCheck >= HERD_CHECK) tickHerds(ctx, world, here);

  world.carcasses.tick(dt);
  const me = ctx.scene.entity.get(actor(ctx));
  // On foot the aim is where the camera looks, as for building: a survivor too loaded to walk can still turn to a tame.
  const aim = me === null ? 0 : me.id === ctx.player.userId ? playerMovementHeading(ctx, me.id) || me.rotationY : me.rotationY;
  world.aimed = me === null ? null : (creatureInFront(ctx, me.id, aim, USE_REACH, (creature) => riding.riderOf(creature.id) === null)?.id ?? null);
  return events;
}

// --- machine instincts: targeting, tricks, storms, sentries ----------------------------------------

/** A wild bot's mind: its temperament (every one hunts in a Signal Storm), its targeting rules, and light. */
function wildMind(ctx: GameContext, world: World, creature: Creature, def: SpeciesDef) {
  const profile = botProfile(creature.species);
  const temperament = world.storm ? { kind: "predator" as const, breakAt: 0 } : temperamentOf(def);
  const rules = profile?.targets ?? [];
  const lightSeeker = rules.includes("brightest");
  return {
    kind: "wild" as const,
    temperament: lightSeeker ? { ...temperament, light: "attracted" as const } : temperament,
    ...(rules.length === 0 ? {} : { focus: (candidateId: string) => targetScore(rules, targetFacts(ctx, world, creature, candidateId)) }),
    ...(lightSeeker ? { lightOf: (candidateId: string) => targetFacts(ctx, world, creature, candidateId).bright } : {}),
  };
}

/** A nocturnal wild bot (Watchwing) perches still through the day, unless something hurts it. */
function perchedByDay(ctx: GameContext, creature: Creature): boolean {
  if (creature.tamed || botProfile(creature.species)?.nocturnal !== true || creature.lastHitBy !== null) return false;
  const fraction = ctx.time.calendar().dayFraction;
  return fraction >= 0.25 && fraction <= 0.78;
}

/** A shoulder bot (Ticklet) told to follow sits on the technician's right shoulder instead of walking. */
function rideShoulder(ctx: GameContext, creature: Creature, command: CompanionCommand): void {
  if (botProfile(creature.species)?.shoulder !== true) return;
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (command !== "follow") {
    // Told to stay, it hops down from the shoulder to the ground where it was.
    const self = ctx.scene.entity.get(creature.id);
    if (self === null) return;
    const ground = ctx.world.groundHeightAt(self.position[0], self.position[2]);
    if (self.position[1] > ground + 0.5) {
      ctx.scene.entity.setPose(creature.id, { position: [self.position[0], ground, self.position[2]] });
      worldOf(ctx).roster.setHome(creature.id, [self.position[0], ground, self.position[2]]);
    }
    return;
  }
  if (me === null || ridingOf(ctx).mountOf(ctx.player.userId) !== null) return;
  const self = ctx.scene.entity.get(creature.id);
  if (self === null || Math.hypot(self.position[0] - me.position[0], self.position[2] - me.position[2]) > WHISTLE_RANGE) return;
  const yaw = me.rotationY;
  const right = 0.28;
  ctx.scene.entity.setPose(creature.id, { position: [me.position[0] - Math.cos(yaw) * right, me.position[1] + 1.55, me.position[2] + Math.sin(yaw) * right], rotationY: yaw });
}

/** How deep a burrowing bot sinks, as a share of its body radius. */
const BURROW_DEPTH = 0.8;

/** A wild burrower (Thermite Beetle) with nothing to fight sinks until only its shell shows; it surfaces to fight or flee. */
function burrow(ctx: GameContext, creature: Creature, mode: string): void {
  if (botProfile(creature.species)?.burrows !== true || creature.tamed) return;
  const self = ctx.scene.entity.get(creature.id);
  if (self === null) return;
  const ground = ctx.world.groundHeightAt(self.position[0], self.position[2]);
  // Knocked out, held or ridden ("still"), it lies on the surface where you can reach it.
  const calm = mode === "idle" || mode === "wander" || mode === "guard";
  const y = calm ? ground - defOf(creature).radius * BURROW_DEPTH : ground;
  if (Math.abs(self.position[1] - y) > 0.01) ctx.scene.entity.setPose(creature.id, { position: [self.position[0], y, self.position[2]] });
}

/** Whether a burrowing bot is under the ground now. */
export function burrowed(ctx: GameContext, id: string): boolean {
  const self = ctx.scene.entity.get(id);
  return self !== null && self.position[1] < ctx.world.groundHeightAt(self.position[0], self.position[2]) - 0.2;
}

/** Whether a shoulder bot is riding the technician's shoulder now. */
export function onShoulder(ctx: GameContext, id: string): boolean {
  const creature = worldOf(ctx).creatures.get(id);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const self = ctx.scene.entity.get(id);
  if (creature === undefined || me === null || self === null || botProfile(creature.species)?.shoulder !== true) return false;
  return self.position[1] > me.position[1] + 1.2 && Math.hypot(self.position[0] - me.position[0], self.position[2] - me.position[2]) < 0.6;
}

/** The forest stands up: every dormant Rootkit within its reach of `at` wakes and hunts. */
export function disturbForest(ctx: GameContext, at: readonly [number, number, number]): number {
  const world = worldOf(ctx);
  let woke = 0;
  for (const creature of world.creatures.values()) {
    const reach = botProfile(creature.species)?.dormantUntilChop?.radius;
    if (!creature.dormant || creature.dead || reach === undefined) continue;
    const self = ctx.scene.entity.get(creature.id)?.position;
    if (self === undefined || Math.hypot(self[0] - at[0], self[2] - at[2]) > reach) continue;
    creature.dormant = false;
    world.driver.hurt(ctx, creature.id, ctx.player.userId);
    woke += 1;
  }
  if (woke > 0) ctx.game.notices.push({ text: woke === 1 ? "A tree stands up: Rootkit!" : `The forest stands up: ${woke} Rootkits!`, tone: "deny" });
  return woke;
}

/** The trick a bot pulls when its strike lands on `targetId`, with an Echo Mimic copying the last one near it. */
function trickEvent(ctx: GameContext, world: World, creature: Creature, targetId: string): CreatureEvent | null {
  const profile = botProfile(creature.species);
  let trick = profile?.trick;
  const self = ctx.scene.entity.get(creature.id)?.position;
  if (trick === undefined || self === undefined) return null;
  if (trick.kind === "mimic") {
    const last = world.lastTrick;
    if (last === null || last.trick.kind === "mimic" || ctx.time.now() - last.time > 30 || Math.hypot(last.at[0] - self[0], last.at[2] - self[2]) > trick.radius) return null;
    trick = last.trick;
  } else {
    world.lastTrick = { trick, at: [self[0], self[1], self[2]], time: ctx.time.now() };
  }
  const label = defOf(creature).label;
  const detail = applyTrick(ctx, world, creature, trick, targetId);
  if (detail === null) return null;
  ctx.game.notices.push({ text: `${label}: ${detail}`, tone: "deny" });
  return { type: "trick", id: creature.id, label, trick: trick.kind, detail };
}

/** Do it; returns what happened in words, or null when it did nothing. */
function applyTrick(ctx: GameContext, world: World, creature: Creature, trick: StrikeTrick, targetId: string): string | null {
  const me = targetId === ctx.player.userId;
  switch (trick.kind) {
    case "drainStamina":
      if (!me) return null;
      drainSurvivorStamina(ctx, trick.amount);
      return `latched on and drained ${trick.amount} stamina`;
    case "disarm": {
      const held = me ? heldItem(ctx) : null;
      if (held === null || !/^(metal_|element_)/.test(held) || ctx.rng() >= trick.chance) return null;
      if (ctx.player.inventory.take(HOTBAR, held, 1).status !== "ok") return null;
      const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, held, 1);
      if (put.status === "ok") creature.inventory = put.state;
      return `magnetic pull yanked your ${itemLabel(held)} away. Down it to get it back`;
    }
    case "steal": {
      if (!me) return null;
      const stacks = ctx.player.inventory.state(BAG).slots.flatMap((slot, index) => (slot === null ? [] : [{ index, slot }]));
      if (stacks.length === 0) return null;
      const pick = stacks[Math.floor(ctx.rng() * stacks.length)]!;
      const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, pick.slot.itemId, pick.slot.count);
      if (put.status !== "ok") return null;
      ctx.player.inventory.take(BAG, pick.slot.itemId, pick.slot.count);
      creature.inventory = put.state;
      const self = ctx.scene.entity.get(creature.id)?.position;
      if (self !== undefined) {
        const angle = ctx.rng() * Math.PI * 2;
        moveCreature(ctx, creature.id, [self[0] + Math.sin(angle) * trick.blink, self[2] + Math.cos(angle) * trick.blink]);
        // Where it lands is its nest: it keeps its loot there and guards it.
        const nest = ctx.scene.entity.get(creature.id)?.position;
        if (nest !== undefined) world.driver.setHome(creature.id, nest);
      }
      return `stole ${pick.slot.count} ${itemLabel(pick.slot.itemId)} and blinked away`;
    }
    case "chain": {
      const target = ctx.scene.entity.get(targetId);
      const attack = defOf(creature).attack;
      if (target === null || attack === null) return null;
      const wet = climateAt(ctx, target.position).wet;
      const amount = attack.damage * trick.share * (wet ? 2 : 1);
      let arcs = 0;
      for (const id of ctx.scene.entity.inRadius(targetId, trick.radius, (candidate) => candidate !== creature.id && candidate !== targetId)) {
        const other = world.creatures.get(id);
        if (other !== undefined && (other.dead || (!other.tamed && other.species === creature.species))) continue;
        if (other === undefined && ctx.scene.entity.get(id)?.role !== "player") continue;
        ctx.scene.entity.effect({ from: creature.id, to: id, effect: "damage", via: { amount } });
        arcs += 1;
      }
      ctx.scene.entity.effect({ from: creature.id, to: targetId, effect: "damage", via: { amount: wet ? amount : 0 } });
      return arcs === 0 && !wet ? null : `lightning arced${wet ? " through the water" : ""}${arcs > 0 ? ` to ${arcs} more` : ""}`;
    }
    case "mimic":
      return null;
  }
}

/** A clock's whole days since the start, as a fraction. */
function daysNow(ctx: GameContext): number {
  const calendar = ctx.time.calendar();
  return calendar.day + calendar.dayFraction;
}

/**
 * Signal Storms: on a storm night every wild bot goes Overclocked (wildMind, body) and, as the broadcast
 * starts, each tame out under the open sky may revert to wild. A roof over it keeps the signal off.
 */
function tickStorm(ctx: GameContext, world: World): CreatureEvent[] {
  const storm = !world.stormsEnded && (world.stormForced ?? stormAt(daysNow(ctx)));
  if (storm === world.storm) return [];
  return storm ? startStorm(ctx, world) : stopStorm(ctx, world);
}

function startStorm(ctx: GameContext, world: World): CreatureEvent[] {
  world.storm = true;
  const reverted: string[] = [];
  for (const creature of world.creatures.values()) {
    if (!creature.tamed || creature.dead || ridingOf(ctx).riderOf(creature.id) !== null) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at === undefined || climateAt(ctx, at).covered) continue;
    if (ctx.rng() >= revertChance(creature.traits)) continue;
    revertToWild(ctx, world, creature);
    reverted.push(creature.id);
  }
  ctx.game.notices.push({ text: reverted.length === 0 ? "Signal Storm! Wild machines are Overclocked." : `Signal Storm! Wild machines are Overclocked, and ${reverted.length} of your bots reverted to wild.`, tone: "deny" });
  return [{ type: "storm", on: true, reverted }];
}

function stopStorm(ctx: GameContext, world: World): CreatureEvent[] {
  world.storm = false;
  ctx.game.notices.push({ text: "The Signal Storm passes. Wild machines calm down.", tone: "success" });
  return [{ type: "storm", on: false, reverted: [] }];
}

/** The broadcast rewrote it: a tame goes wild again, keeping its levels and whatever it carried. */
function revertToWild(ctx: GameContext, world: World, creature: Creature): void {
  if (world.viewing === creature.id) closeCreature(ctx);
  world.roster.release(creature.id);
  creature.tamed = false;
  creature.saddled = false;
  creature.growth = null;
  creature.mating = false;
  world.carriers.remove(creature.id);
  world.taming.track(creature.id, creature.species, creature.level);
}

/** Start or stop a Signal Storm now, whatever the night (a console, a proof). */
export function setStorm(ctx: GameContext, on: boolean): CreatureEvent[] {
  const world = worldOf(ctx);
  if (on && world.stormsEnded) return [];
  world.stormForced = on;
  if (world.storm === on) return [];
  return on ? startStorm(ctx, world) : stopStorm(ctx, world);
}

/** The Root Server is down: the broadcasts stop for good. */
export function endStorms(ctx: GameContext): void {
  const world = worldOf(ctx);
  world.stormsEnded = true;
  world.storm = false;
  world.stormForced = null;
}

export function stormView(ctx: GameContext): { storm: boolean; ended: boolean } {
  const world = worldOf(ctx);
  return { storm: world.storm, ended: world.stormsEnded };
}

/** Seconds between helper sweeps: sentries ping, Ticklets patch, Arcwires power. */
const SWEEP = 4;

/** Uploaded helpers at work: a following Ticklet patches you up, an Arcwire on Guard Zone powers the stations near it. */
function tickHelpers(ctx: GameContext, world: World): void {
  const me = ctx.scene.entity.get(ctx.player.userId)?.position;
  for (const creature of world.creatures.values()) {
    const profile = botProfile(creature.species);
    if (!creature.tamed || creature.dead || profile === null || (profile.patches === undefined && profile.powers === undefined)) continue;
    const record = world.roster.get(creature.id);
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (record === null || at === undefined) continue;
    if (profile.patches !== undefined && record.command === "follow" && me !== undefined && Math.hypot(at[0] - me[0], at[2] - me[2]) <= 6) patchSurvivor(ctx, profile.patches);
    if (profile.powers !== undefined && record.command === "stay") powerStations(ctx, at, profile.powers.radius, SWEEP);
  }
}

/** Tamed sentries on Guard Zone sweep for hostiles every few seconds and ping when new ones arrive. */
function tickSentries(ctx: GameContext, world: World, dt: number): void {
  world.sweep -= dt;
  if (world.sweep > 0) return;
  world.sweep = SWEEP;
  tickHelpers(ctx, world);
  for (const creature of world.creatures.values()) {
    const sentry = botProfile(creature.species)?.sentry;
    if (sentry === undefined || !creature.tamed || creature.dead || world.roster.get(creature.id)?.command !== "stay") {
      world.pinged.delete(creature.id);
      continue;
    }
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at === undefined) continue;
    let hostiles = 0;
    for (const other of world.creatures.values()) {
      if (other.dead || other.tamed || other.dormant || !HOSTILE.has(defOf(other).temperament)) continue;
      const there = ctx.scene.entity.get(other.id)?.position;
      if (there !== undefined && Math.hypot(there[0] - at[0], there[2] - at[2]) <= sentry.radius) hostiles += 1;
    }
    const before = world.pinged.get(creature.id) ?? 0;
    world.pinged.set(creature.id, hostiles);
    if (hostiles > before) {
      ctx.game.notices.push({ text: `${defOf(creature).label} pings: ${hostiles} hostile${hostiles === 1 ? "" : "s"} near its post`, tone: "deny" });
      ctx.scene.entity.floatText({ instanceId: creature.id, text: "PING", kind: "damage" });
    }
  }
}

/**
 * A courier bot (Homer) flies what it carries home: every stack into the storage box nearest it, then it
 * lands beside the box and guards there. Returns the stacks delivered.
 */
export function sendHome(ctx: GameContext): number {
  const world = worldOf(ctx);
  const creature = viewed(ctx);
  if (creature === null || !creature.tamed || botProfile(creature.species)?.courier !== true) return 0;
  const at = ctx.scene.entity.get(creature.id)?.position;
  const box = at === undefined ? null : homeBox(ctx, [at[0], at[2]]);
  if (box === null) {
    ctx.game.notices.push({ text: "No storage box to fly home to: build one first", tone: "deny" });
    return 0;
  }
  let delivered = 0;
  for (const slot of [...creature.inventory.slots]) {
    if (slot === null || itemDef(slot.itemId)?.kind === "saddle") continue;
    if (depositInto(ctx, box.id, slot.itemId, slot.count) === 0) continue;
    const taken = takeItem(creature.inventory, slot.itemId, slot.count);
    if (taken.status === "ok") creature.inventory = taken.state;
    delivered += 1;
  }
  if (delivered === 0) {
    ctx.game.notices.push({ text: `The ${defOf(creature).label} has nothing to carry, or the box is full`, tone: "deny" });
    return 0;
  }
  if (ridingOf(ctx).riderOf(creature.id) === null) {
    closeCreature(ctx);
    moveCreature(ctx, creature.id, [box.at[0] + 2, box.at[2] + 2]);
    world.roster.command(creature.id, "stay");
    world.roster.setHome(creature.id, [box.at[0] + 2, box.at[1], box.at[2] + 2]);
  }
  const distance = at === undefined ? 0 : Math.round(Math.hypot(box.at[0] - at[0], box.at[2] - at[2]));
  ctx.game.notices.push({ text: `The ${defOf(creature).label} flew ${delivered} stack${delivered === 1 ? "" : "s"} home, ${distance} m, and waits by the box`, tone: "success" });
  return delivered;
}

/** The Hivemind's signal freezes every one of the technician's bots within `radius` of `at` for `seconds`. */
export function puppetTames(ctx: GameContext, at: readonly [number, number, number], radius: number, seconds: number): number {
  const world = worldOf(ctx);
  let frozen = 0;
  for (const creature of world.creatures.values()) {
    if (!creature.tamed || creature.dead) continue;
    const self = ctx.scene.entity.get(creature.id)?.position;
    if (self === undefined || Math.hypot(self[0] - at[0], self[2] - at[2]) > radius) continue;
    world.puppeted.set(creature.id, ctx.time.now() + seconds);
    ctx.scene.entity.floatText({ instanceId: creature.id, text: "PUPPETED", kind: "damage" });
    frozen += 1;
  }
  return frozen;
}

/** Whether a tame stands frozen under the Hivemind's signal right now. */
export function isPuppeted(ctx: GameContext, id: string): boolean {
  return (worldOf(ctx).puppeted.get(id) ?? -Infinity) > ctx.time.now();
}

/** Seconds between a Harvest chip's swings, metres it ranges from its post. */
const HARVEST_EVERY = 3;
const HARVEST_RANGE = 14;

/** Slot the Harvest chip in or out of the bot whose inventory is open. */
export function toggleHarvest(ctx: GameContext): void {
  const creature = viewed(ctx);
  if (creature === null || !creature.tamed || TAME_GATHER[creature.species] === undefined) return;
  creature.harvesting = !creature.harvesting;
  if (creature.harvesting) {
    const entity = ctx.scene.entity.get(creature.id);
    worldOf(ctx).roster.command(creature.id, "stay");
    if (entity !== null) worldOf(ctx).roster.setHome(creature.id, [entity.position[0], entity.position[1], entity.position[2]]);
  }
  ctx.game.notices.push({ text: creature.harvesting ? `Harvest chip in: the ${defOf(creature).label} works the ground around this spot` : "Harvest chip out", tone: "success" });
}

/**
 * Every bot running a Harvest chip on Guard Zone walks to the nearest node of its best resource near its
 * post and works it into its own inventory, until it is loaded to its weight.
 */
function tickHarvesters(ctx: GameContext, world: World, dt: number): void {
  world.harvestIn -= dt;
  if (world.harvestIn > 0) return;
  world.harvestIn = HARVEST_EVERY;
  for (const creature of world.creatures.values()) {
    const tool = TAME_GATHER[creature.species];
    if (!creature.harvesting || tool === undefined || !creature.tamed || creature.dead || world.roster.get(creature.id)?.command !== "stay") continue;
    if (ridingOf(ctx).riderOf(creature.id) !== null || loadOf(creature).moveMultiplier <= 0) continue;
    const self = ctx.scene.entity.get(creature.id);
    const home = world.driver.state(creature.id)?.home;
    if (self === null || home === undefined) continue;
    const wanted = Object.entries(tool.biases ?? {}).sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
    let node: [number, number, number] | null = null;
    for (const kind of wanted) {
      node = nearestHarvestable(ctx, home, HARVEST_RANGE, "strike", kind) ?? nearestHarvestable(ctx, home, HARVEST_RANGE, "pick", kind);
      if (node !== null) break;
    }
    if (node === null) continue;
    // It works from beside the node, then reaches in.
    const away = Math.atan2(self.position[0] - node[0], self.position[2] - node[2]);
    const reach = defOf(creature).radius + 1.2;
    if (Math.hypot(self.position[0] - node[0], self.position[2] - node[2]) > reach) moveCreature(ctx, creature.id, [node[0] + Math.sin(away) * (reach - 0.4), node[2] + Math.cos(away) * (reach - 0.4)]);
    const from = ctx.scene.entity.get(creature.id)?.position ?? self.position;
    const facing = Math.atan2(node[0] - from[0], node[2] - from[2]);
    const granted = strikeHarvestable(ctx, from, facing, reach + 0.6, tool, statOf(creature, "melee"));
    if (granted === null) continue;
    for (const grant of granted) {
      const whole = Math.floor(grant.amount + ctx.rng());
      if (whole <= 0) continue;
      const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, grant.kind, whole);
      if (put.status === "ok") creature.inventory = put.state;
    }
    smelt(creature);
    ctx.game.playEntityAnimation(creature.id, "attack");
  }
}

/** What a creature decided on its last step (mode and target), for the HUD and tests; null when it has not stepped. */
export function creatureStep(ctx: GameContext, id: string): { mode: string; targetId: string | null } | null {
  const step = worldOf(ctx).steps.get(id);
  return step === undefined ? null : { mode: step.mode, targetId: step.targetId };
}

/** The technician lands a plain hit of `damage` on a creature by id (a console and test hook; shields and knockouts apply). */
export function hitCreature(ctx: GameContext, id: string, damage: number): CreatureStrike | null {
  const creature = worldOf(ctx).creatures.get(id);
  return creature === undefined || creature.dead ? null : landHit(ctx, ctx.player.userId, creature, damage, []);
}

/** A creature's traits (quirks and glitches), empty for none or an unknown id. */
export function traitsOf(ctx: GameContext, id: string): readonly string[] {
  return worldOf(ctx).creatures.get(id)?.traits ?? [];
}

/** Hostiles the sentries last counted, by sentry: for the HUD and proofs. */
export function sentryPings(ctx: GameContext): Record<string, number> {
  return Object.fromEntries(worldOf(ctx).pinged);
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
  if (creature.tamed || world.taming.state(creature.id)?.subdued === true) {
    world.viewing = creature.id;
    setScreen(ctx, "creature");
    return;
  }
  if (world.taming.state(creature.id)?.awakeTame === true) handFeed(ctx, creature);
}

/** The survivor's bag, then hotbar, as something to take food from. */
function survivorSupply(ctx: GameContext): DoseSupply {
  const inv = ctx.player.inventory;
  return {
    count: (itemId) => inv.count(BAG, itemId) + inv.count(HOTBAR, itemId),
    take: (itemId) => inv.take(BAG, itemId, 1).status === "ok" || inv.take(HOTBAR, itemId, 1).status === "ok",
  };
}

/** E on an awake tame: hand it a food it likes from the bag, if it is hungry. */
function handFeed(ctx: GameContext, creature: Creature): void {
  const world = worldOf(ctx);
  const def = defOf(creature);
  const result = world.taming.offer(creature.id, survivorSupply(ctx));
  if (result.type === "ate") {
    ctx.scene.entity.floatText({ instanceId: creature.id, text: `Ate ${itemLabel(result.itemId)}`, kind: "pickup" });
  } else if (result.type === "full") {
    ctx.game.notices.push({ text: `The ${def.label} is not hungry yet (${Math.ceil(result.seconds / world.tamingSpeed)} s)`, tone: "deny" });
  } else if (result.type === "refuses") {
    ctx.game.notices.push({ text: `The ${def.label} eats ${world.taming.foods(creature.species).slice(0, 3).map(itemLabel).join(", ")}`, tone: "deny" });
  }
}

export function closeCreature(ctx: GameContext): void {
  worldOf(ctx).viewing = null;
  setScreen(ctx, null);
}

const HEARD: Record<CompanionCommand | CompanionStance, string> = { follow: "following", stay: "staying", passive: "passive", neutral: "neutral", aggressive: "aggressive" };

/**
 * ARK's whistles: every tame of yours in earshot follows you or stays where it stands, or takes a stance:
 * passive never fights, neutral fights what attacks it or you and joins your fights, aggressive also starts them.
 */
export function whistle(ctx: GameContext, order: CompanionCommand | CompanionStance): void {
  const world = worldOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  let heard = 0;
  for (const record of world.roster.list(ctx.player.userId)) {
    const entity = ctx.scene.entity.get(record.id);
    if (entity === null || ridingOf(ctx).riderOf(record.id) !== null) continue;
    if (Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]) > WHISTLE_RANGE) continue;
    if (order === "follow" || order === "stay") world.roster.command(record.id, order);
    else world.roster.stance(record.id, order);
    if (order === "stay") world.roster.setHome(record.id, [entity.position[0], entity.position[1], entity.position[2]]);
    heard += 1;
  }
  ctx.game.notices.push({ text: heard === 0 ? "No bots in earshot" : `${heard} ${HEARD[order]}`, tone: heard === 0 ? "deny" : "success" });
}

/** The E prompt for creatures, outranking a bush behind them. */
/** Whether the survivor is in a saddle. */
export function isMounted(ctx: GameContext): boolean {
  return ridingOf(ctx).mountOf(ctx.player.userId) !== null;
}

export function creaturePrompts(ctx: GameContext): PositionedPrompt[] {
  const world = worldOf(ctx);
  const mounted = ridingOf(ctx).mountOf(ctx.player.userId);
  const flyer = mounted === null ? undefined : world.creatures.get(mounted);
  const lift = flyer === undefined ? undefined : FLYERS[flyer.species];
  const at = (id: string) => {
    const entity = ctx.scene.entity.get(id);
    return entity === null ? null : { x: entity.position[0], z: entity.position[2] };
  };
  const prompt = (id: string, label: string): PositionedPrompt[] => {
    const position = at(id);
    return position === null ? [] : [{ id: `creature:${id}`, position, priority: 2, prompt: proximityPrompt({ radius: USE_REACH + 4, display: keybind("interact", label), invoke: command("creatureUse") }) }];
  };
  if (mounted !== null) {
    const held = world.carried.get(mounted);
    const below = flyer === undefined || lift === undefined || held !== undefined ? null : liftable(ctx, world, flyer, lift.liftRadius);
    const position = at(mounted);
    const label = held !== undefined ? `Drop ${labelOf(world, held)}` : below !== null && below !== "too big" ? `Lift ${defOf(below).label}` : null;
    const talons: PositionedPrompt[] = label === null || position === null ? [] : [{ id: `airlift:${mounted}`, position, priority: 3, prompt: proximityPrompt({ radius: USE_REACH + 4, display: keybind("airlift", label), invoke: command("airlift") }) }];
    return [...talons, ...prompt(mounted, "Dismount")];
  }
  const creature = world.aimed === null ? undefined : world.creatures.get(world.aimed);
  if (creature === undefined) return [];
  if (creature.dead) return holdsItems(creature) ? prompt(creature.id, "Access inventory") : [];
  if (creature.tamed) return prompt(creature.id, creature.saddled ? "Ride" : "Access inventory");
  const taming = world.taming.state(creature.id);
  if (taming?.subdued === true) return prompt(creature.id, "Access inventory");
  if (taming?.awakeTame === true) {
    const food = world.taming.nextFood(creature.species, survivorSupply(ctx));
    const label = taming.belly > 0 ? `Not hungry (${Math.ceil(taming.belly / world.tamingSpeed)} s)` : food === null ? `Wants ${itemLabel(world.taming.foods(creature.species)[0] ?? "food")}` : `Feed ${itemLabel(food)}`;
    return prompt(creature.id, `${label} · uploaded ${Math.round(taming.progress * 100)}%`);
  }
  return [];
}

// --- a flyer's talons ----------------------------------------------------------------------------

const labelOf = (world: World, id: string): string => {
  const creature = world.creatures.get(id);
  return creature === undefined ? "it" : defOf(creature).label;
};

/**
 * The creature a flyer can lift: the nearest living one under or beside its talons, not ridden or held;
 * "too big" when the nearest is heavier than it lifts, null with none in reach.
 */
function liftable(ctx: GameContext, world: World, flyer: Creature, liftRadius: number): Creature | "too big" | null {
  const body = ctx.scene.entity.get(flyer.id);
  if (body === null) return null;
  const held = new Set(world.carried.values());
  let best: { creature: Creature; distance: number } | null = null;
  for (const creature of world.creatures.values()) {
    if (creature.id === flyer.id || creature.dead || held.has(creature.id) || ridingOf(ctx).riderOf(creature.id) !== null) continue;
    const entity = ctx.scene.entity.get(creature.id);
    if (entity === null) continue;
    const drop = body.position[1] - entity.position[1];
    const distance = Math.hypot(entity.position[0] - body.position[0], entity.position[2] - body.position[2]) - defOf(creature).radius;
    if (drop < -LIFT_REACH.above || drop > LIFT_REACH.below || distance > LIFT_REACH.around + defOf(flyer).radius) continue;
    if (best === null || distance < best.distance) best = { creature, distance };
  }
  if (best === null) return null;
  return defOf(best.creature).radius > liftRadius ? "too big" : best.creature;
}

function holdStill(ctx: GameContext, id: string, frozen: boolean): void {
  const entity = ctx.scene.entity.get(id);
  if (entity !== null) ctx.scene.entity.update(id, { movement: { ...entity.movement, frozen } });
  ctx.scene.entity.setVelocity(id, [0, 0, 0]);
}

/**
 * F on a flyer (ARK's grab): lift the creature under or beside its talons, if it is small enough for this
 * flyer, or let go of the one it holds, which drops to the ground beneath and stays there.
 */
export function airlift(ctx: GameContext): void {
  const world = worldOf(ctx);
  const flyerId = ridingOf(ctx).mountOf(ctx.player.userId);
  const flyer = flyerId === null ? undefined : world.creatures.get(flyerId);
  const lift = flyer === undefined ? undefined : FLYERS[flyer.species];
  if (flyer === undefined || lift === undefined) return;
  if (world.carried.has(flyer.id)) {
    letGo(ctx, world, flyer.id);
    return;
  }
  const target = liftable(ctx, world, flyer, lift.liftRadius);
  if (target === null || target === "too big") {
    ctx.game.notices.push({ text: target === null ? "Nothing below to lift" : `Too heavy for your ${defOf(flyer).label} to lift`, tone: "deny" });
    return;
  }
  const at = ctx.scene.entity.get(target.id)!.position;
  world.carried.set(flyer.id, target.id);
  world.lastLift = { id: target.id, from: [at[0], at[2]] };
  holdStill(ctx, target.id, true);
  holdLifted(ctx);
  ctx.game.notices.push({ text: `Your ${defOf(flyer).label} lifts the ${defOf(target).label}`, tone: "success" });
}

/** A flyer lets go: what it held drops to the ground under it and takes that spot as home. */
function letGo(ctx: GameContext, world: World, flyerId: string): void {
  const id = world.carried.get(flyerId);
  world.carried.delete(flyerId);
  const entity = id === undefined ? null : ctx.scene.entity.get(id);
  if (id === undefined || entity === null) return;
  const position: [number, number, number] = [entity.position[0], ctx.world.groundHeightAt(entity.position[0], entity.position[2]), entity.position[2]];
  ctx.scene.entity.setPose(id, { position });
  holdStill(ctx, id, false);
  world.driver.setHome(id, position);
  if (world.roster.get(id) !== null) world.roster.setHome(id, position);
}

/** Hang each lifted creature under its flyer; a flyer left unridden, or gone, lets go. */
function holdLifted(ctx: GameContext): void {
  const world = worldOf(ctx);
  for (const [flyerId, id] of [...world.carried]) {
    const flyer = ctx.scene.entity.get(flyerId);
    const held = world.creatures.get(id);
    if (flyer === null || held === undefined || held.dead || ridingOf(ctx).riderOf(flyerId) === null) {
      letGo(ctx, world, flyerId);
      continue;
    }
    const [x, y, z] = flyer.position;
    ctx.scene.entity.setPose(id, { position: [x, Math.max(ctx.world.groundHeightAt(x, z), y - LIFT_HANG), z], rotationY: flyer.rotationY });
  }
}

/** The creature the survivor's flyer holds, its height above the ground, and how far the last lifted creature now is from where it was lifted. */
export function airliftView(ctx: GameContext): { holding: string | null; heldAlt: number; liftMoved: number } {
  const world = worldOf(ctx);
  const flyerId = ridingOf(ctx).mountOf(ctx.player.userId);
  const holding = flyerId === null ? null : (world.carried.get(flyerId) ?? null);
  const held = holding === null ? null : ctx.scene.entity.get(holding);
  const last = world.lastLift === null ? null : ctx.scene.entity.get(world.lastLift.id);
  return {
    holding,
    heldAlt: held === null ? -1 : held.position[1] - ctx.world.groundHeightAt(held.position[0], held.position[2]),
    liftMoved: last === null || world.lastLift === null ? -1 : Math.hypot(last.position[0] - world.lastLift.from[0], last.position[2] - world.lastLift.from[1]),
  };
}

// --- the creature's inventory ---------------------------------------------------------------------

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
      ctx.game.notices.push({ text: creature.tamed ? `That rig does not fit a ${def.label}` : "Upload it first", tone: "deny" });
      return;
    }
    if (creature.saddled) return;
    ctx.player.inventory.take(from, stack.itemId, 1);
    creature.saddled = true;
    ctx.game.notices.push({ text: `Rigged. E to ride the ${def.label}.`, tone: "success" });
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
  const doses = NARCOTICS.of("any", itemId);
  if (creature === null || doses === null) return;
  const taken = takeItem(creature.inventory, itemId, 1);
  if (taken.status !== "ok") return;
  creature.inventory = taken.state;
  worldOf(ctx).taming.dose(creature.id, ...doses);
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

/** Items straight into the mount under you or the tame whose inventory is open, for tests and proofs; as many as fit. */
export function loadTame(ctx: GameContext, itemId: string, count: number): void {
  const world = worldOf(ctx);
  const id = ridingOf(ctx).mountOf(ctx.player.userId) ?? world.viewing;
  const creature = id === null ? undefined : world.creatures.get(id);
  if (creature === undefined) return;
  const stack = itemDef(itemId)?.stack ?? 1;
  for (let left = count; left > 0; left -= stack) {
    const put = putItem(creature.inventory, { slots: CREATURE_SLOTS }, itemTraits, itemId, Math.min(stack, left));
    if (put.status !== "ok") return;
    creature.inventory = put.state;
  }
}

// --- what the HUD and screens read ------------------------------------------------------------------

function tamingView(world: World, creature: Creature, state: TamingRead | null) {
  return state === null
    ? null
    : {
        torpor: Math.round(state.torpor),
        maxTorpor: Math.round(state.maxTorpor),
        unconscious: state.subdued,
        progress: state.progress,
        effectiveness: state.effectiveness,
        nextMeal: Math.max(0, Math.ceil(state.belly / Math.max(1e-6, world.tamingSpeed))),
        wakesIn: Math.ceil(state.wakesIn),
        eating: world.taming.nextFood(creature.species, feeder(creature)),
        foods: world.taming.foods(creature.species),
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
    species: creature.species,
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
    traits: creature.traits.flatMap((id) => {
      const trait = traitDef(id);
      return trait === null ? [] : [{ id, label: trait.label, kind: trait.kind, note: trait.note }];
    }),
    scrapped: creature.scrapped,
    courier: botProfile(creature.species)?.courier === true,
    harvester: TAME_GATHER[creature.species] !== undefined,
    platform: creature.tamed && world.carriers.has(creature.id),
    harvesting: creature.harvesting,
    puppeted: isPuppeted(ctx, creature.id),
    helper: botProfile(creature.species)?.patches !== undefined ? "Following you, it patches you up" : botProfile(creature.species)?.powers !== undefined ? "On Guard Zone, it powers stations near it" : botProfile(creature.species)?.sentry !== undefined ? "On Guard Zone, it pings hostiles near its post" : botProfile(creature.species)?.cloak === true ? "Ridden, wild bots cannot see you" : null,
    dormant: creature.dormant,
    overclocked: !creature.tamed && world.storm,
    conductor: conductorOf(ctx, world, creature) === creature.id,
    // Each wild stat's levels, the parent they came from and whether a mutation raised them; null for one born wild.
    lineage:
      creature.lineage === null
        ? null
        : WILD_STATS.map((stat) => ({ stat, label: TAME_STATS.find((entry) => entry.id === stat)?.label ?? stat, levels: creature.wild[stat], from: creature.lineage!.from[stat], mutated: creature.lineage!.mutated.includes(stat) })),
    order: creature.tamed ? (world.roster.get(creature.id)?.command ?? null) : null,
    stance: creature.tamed ? (world.roster.get(creature.id)?.stance ?? null) : null,
    taming: creature.tamed ? null : tamingView(world, creature, world.taming.state(creature.id)),
    stamina: { value: Math.floor(creature.stamina), max: Math.round(statOf(creature, "stamina")) },
    weight: { value: Math.round(loadOf(creature).mass * 10) / 10, max: Math.round(statOf(creature, "weight")) },
    growth: growthView(creature),
    inventory: creature.inventory.slots,
  };
}

export type CreatureCard = NonNullable<ReturnType<typeof creatureCard>>;

export function creaturesView(ctx: GameContext) {
  const world = worldOf(ctx);
  let tamed = 0;
  let down = 0;
  let held = 0;
  for (const creature of world.creatures.values()) {
    if (creature.dead) continue;
    if (creature.tamed) tamed += 1;
    else if (world.taming.state(creature.id)?.subdued === true) down += 1;
    if ((world.taming.state(creature.id)?.held ?? 0) > 0) held += 1;
  }
  const riding = ridingOf(ctx).mountOf(ctx.player.userId);
  return {
    aimed: creatureCard(ctx, world.aimed),
    viewing: creatureCard(ctx, world.viewing),
    riding: creatureCard(ctx, riding),
    count: [...world.creatures.values()].filter((creature) => !creature.dead).length,
    tamed,
    down,
    held,
  };
}

export type CreaturesView = ReturnType<typeof creaturesView>;

/** Where each authored herd lives and who lives there: fixed by editor.scene.json, so shared by every run. */
const HERD_HOMES: readonly { region: string; species: readonly string[]; center: readonly [number, number, number] }[] = herds().map((herd) => ({
  region: herd.region,
  species: herd.species.map((entry) => entry.species),
  center: herd.center,
}));

/** The species of every live creature, wild or tamed, within `within` metres of `from`. */
export function speciesNear(ctx: GameContext, from: readonly [number, number, number], within: number): Set<string> {
  const near = new Set<string>();
  for (const creature of worldOf(ctx).creatures.values()) {
    if (creature.dead || near.has(creature.species)) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at !== undefined && Math.hypot(at[0] - from[0], at[2] - from[2]) <= within) near.add(creature.species);
  }
  return near;
}

/** The highest level among the live wild creatures within `within` metres of `from`; 0 with none there. */
/** Wild creatures within `within` metres of `from` that have been hurt, the dead among them. */
export function wildHurtNear(ctx: GameContext, from: readonly [number, number, number], within: number): number {
  let hurt = 0;
  for (const creature of worldOf(ctx).creatures.values()) {
    if (creature.tamed) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    const health = ctx.scene.entity.stats.get(creature.id, "health");
    if (at === undefined || health === null || health === undefined) continue;
    if ((creature.dead || health.current < health.max) && Math.hypot(at[0] - from[0], at[2] - from[2]) <= within) hurt += 1;
  }
  return hurt;
}

/** The stance of your nearest tame: 0 passive, 1 neutral, 2 aggressive; -1 with none. */
export function nearestTameStance(ctx: GameContext, from: readonly [number, number, number]): number {
  const world = worldOf(ctx);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tame of tames(ctx)) {
    const distance = Math.hypot(tame.at[0] - from[0], tame.at[2] - from[2]);
    const stance = world.roster.get(tame.id)?.stance;
    if (stance === undefined || distance >= bestDistance) continue;
    best = stance === "passive" ? 0 : stance === "neutral" ? 1 : 2;
    bestDistance = distance;
  }
  return best;
}

export function wildLevelNear(ctx: GameContext, from: readonly [number, number, number], within: number): number {
  let top = 0;
  for (const creature of worldOf(ctx).creatures.values()) {
    if (creature.dead || creature.tamed || creature.level <= top) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at !== undefined && Math.hypot(at[0] - from[0], at[2] - from[2]) <= within) top = creature.level;
  }
  return top;
}

/**
 * Where to find a wild one of `species` (one id or several) from `from`: the nearest live untamed one
 * within `within` metres, else the centre of the nearest spawn zone it lives in that may hold one: an
 * asleep zone fills as you come, but an awake one with none left has shown you all it has until it refills.
 * `keep` passes over ones a survivor would not go for (one grazing beside a lodestone).
 */
export function nearestWild(
  ctx: GameContext,
  species: string | readonly string[],
  from: readonly [number, number, number],
  within: number,
  keep: (at: readonly [number, number, number]) => boolean = () => true,
): [number, number, number] | null {
  const wanted: readonly string[] = typeof species === "string" ? [species] : species;
  const world = worldOf(ctx);
  let best: [number, number, number] | null = null;
  let bestDistance = within;
  for (const creature of world.creatures.values()) {
    if (creature.dead || creature.tamed || !wanted.includes(creature.species)) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    const distance = at === undefined ? Number.POSITIVE_INFINITY : Math.hypot(at[0] - from[0], at[2] - from[2]);
    if (at !== undefined && distance <= bestDistance && keep(at)) {
      best = [at[0], at[1], at[2]];
      bestDistance = distance;
    }
  }
  if (best !== null) return best;
  const emptied = (region: string): boolean =>
    awake(world, region, from) && ![...world.creatures.values()].some((creature) => creature.region === region && !creature.dead && !creature.tamed && wanted.includes(creature.species));
  let home: readonly [number, number, number] | null = null;
  let homeDistance = Number.POSITIVE_INFINITY;
  for (const herd of HERD_HOMES) {
    const distance = Math.hypot(herd.center[0] - from[0], herd.center[2] - from[2]);
    if (distance < homeDistance && wanted.some((id) => herd.species.includes(id)) && !emptied(herd.region) && keep(herd.center)) {
      home = herd.center;
      homeDistance = distance;
    }
  }
  return home === null ? null : [home[0], ctx.world.groundHeightAt(home[0], home[2]), home[2]];
}

/** The nearest live tame of `species` the survivor owns, or null. */
export function nearestTame(ctx: GameContext, from: readonly [number, number, number], species: string): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tame of tames(ctx)) {
    if (tame.species !== species) continue;
    const distance = Math.hypot(tame.at[0] - from[0], tame.at[2] - from[2]);
    if (distance < bestDistance) {
      best = [tame.at[0], tame.at[1], tame.at[2]];
      bestDistance = distance;
    }
  }
  return best;
}

/** The nearest wild body still holding meat and hide within `within` metres of `from`, or null. */
export function nearestCarcass(ctx: GameContext, from: readonly [number, number, number], within: number): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestDistance = within;
  for (const creature of worldOf(ctx).creatures.values()) {
    // A body carved bare is left two seconds to rot.
    if (!creature.dead || creature.tamed || creature.rot <= 2) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at === undefined) continue;
    const distance = Math.hypot(at[0] - from[0], at[2] - from[2]);
    if (distance <= bestDistance) {
      best = [at[0], at[1], at[2]];
      bestDistance = distance;
    }
  }
  return best;
}

/** The nearest live wild hunter (aggressive or territorial) within `within` metres of `from`, or null. */
export function nearestThreat(ctx: GameContext, from: readonly [number, number, number], within: number): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestDistance = within;
  for (const creature of worldOf(ctx).creatures.values()) {
    const temperament = defOf(creature).temperament;
    if (creature.dead || creature.tamed || !HOSTILE.has(temperament)) continue;
    const at = ctx.scene.entity.get(creature.id)?.position;
    if (at === undefined) continue;
    const distance = Math.hypot(at[0] - from[0], at[2] - from[2]);
    if (distance <= bestDistance) {
      best = [at[0], at[1], at[2]];
      bestDistance = distance;
    }
  }
  return best;
}

// --- save -----------------------------------------------------------------------------------------

interface CreaturesSave {
  creatures: Creature[];
  seq: number;
  driver: Record<string, CreatureDriverState>;
  taming: Record<string, TamingSave>;
  roster: Record<string, CompanionRecord>;
  carcasses: Record<string, ResourceNodeState>;
  director: PopulationDirectorState;
  riding: { riders: MountedRider[]; seats: Record<string, SeatOffset> };
  tamingSpeed: number;
  storm?: boolean;
  stormsEnded?: boolean;
  carriers?: CarrierState;
}

export function creaturesSave(ctx: GameContext) {
  return {
    key: "fernwild.creatures2",
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
        storm: world.storm,
        stormsEnded: world.stormsEnded,
        carriers: world.carriers.snapshot(),
      };
    },
    hydrate: (data: CreaturesSave) => {
      const world = worldOf(ctx);
      world.creatures = new Map(data.creatures.map((saved) => {
        const creature = structuredClone(saved);
        creature.lastHitBy ??= null;
        creature.lineage ??= null;
        creature.growth = creature.growth == null ? (creature.tamed ? { tamedAt: creature.level, gained: 0, xp: 0, points: TAME_POINTS.empty() } : null) : { ...creature.growth, points: TAME_POINTS.normalize(creature.growth.points) };
        creature.traits ??= [];
        creature.scrapped ??= 0;
        creature.dormant ??= false;
        creature.harvesting ??= false;
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
      world.carriers = createCarrierField({ solidsLayer: "fernwild:carriers" });
      for (const creature of world.creatures.values()) mountDeck(world, creature);
      if (data.carriers !== undefined) world.carriers.restore(data.carriers);
      world.storm = data.storm ?? false;
      world.stormsEnded = data.stormsEnded ?? false;
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
  world.lastTame = null;
  world.carried.clear();
  world.lastLift = null;
  world.noise.clear();
  world.lastTrick = null;
  world.storm = false;
  world.stormsEnded = false;
  world.stormForced = null;
  world.pinged.clear();
  world.puppeted.clear();
  world.carriers = createCarrierField({ solidsLayer: "fernwild:carriers" });
}

/** Hotbar too: ARK lets you drag from either. Exposed for the screen. */
export const CREATURE_SOURCES = [BAG, HOTBAR] as const;
