import { createCreatureDriver, type CreatureBody, type CreatureDriverState, type CreatureStep } from "@jgengine/core/ai/creatureDriver";
import { createPopulationDirector, type PopulationDirector, type PopulationDirectorState } from "@jgengine/core/ai/populationDirector";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { countItem, createEmptyInventory, putItem, takeItem, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import type { NavPoint } from "@jgengine/core/nav/navGrid";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createCompanionRoster, type CompanionCommand, type CompanionRecord } from "@jgengine/core/scene/companion";
import { ridingOf, type SeatOffset } from "@jgengine/core/scene/riding";
import type { MountedRider } from "@jgengine/core/scene/mount";
import { createKnockoutTaming, type TamingFeeder, type TamingState } from "@jgengine/core/taming/knockoutTaming";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { createResourceNodeField, type ResourceGrant, type ResourceNodeState, type ToolProfile } from "@jgengine/core/world/resourceNode";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { itemDef, itemLabel, itemTraits } from "./data/items";
import { SPECIES, speciesDef, statAt, temperamentOf, TORPOR_TAKEN, WILD_LEVELS, type SpeciesDef } from "./data/species";
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
}

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
  seq: number;
  populated: boolean;
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

/** Each creature_spawn marker in editor.scene.json is a herd: its species, how many, how far they roam. */
function herds() {
  return markersOfKind(editorLayers, "creature_spawn").map((marker) => {
    const meta = (marker.meta ?? {}) as { species?: string; count?: number; radius?: number };
    const species = meta.species ?? "";
    if (speciesDef(species) === null) throw new Error(`Fernwild creature_spawn "${marker.id}" names unknown species "${species}"`);
    const radius = meta.radius ?? 14;
    const center: [number, number, number] = [marker.position.x, marker.position.y, marker.position.z];
    const ring: NavPoint[] = Array.from({ length: 8 }, (_, i) => [center[0] + Math.cos((i / 8) * Math.PI * 2) * radius * 0.6, center[2] + Math.sin((i / 8) * Math.PI * 2) * radius * 0.6] as const);
    return { region: marker.id, species, count: meta.count ?? 2, radius, center, ring };
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
      regions: authored.map((herd) => ({ region: herd.region, species: [{ species: herd.species, cap: herd.count }], spawnPoints: herd.ring })),
      respawnDelay: RESPAWN_SECONDS,
      seed: 7,
    }),
    regions: new Map(authored.map((herd) => [herd.region, { center: herd.center, radius: herd.radius }])),
    steps: new Map(),
    seq: 0,
    populated: false,
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

function maxHealth(def: SpeciesDef, level: number): number {
  return Math.round(statAt(def.health, level));
}

/** Melee multiplier at a level, ARK-style: the bite grows with the melee stat. */
function meleeScale(def: SpeciesDef, level: number): number {
  return statAt(def.melee, level) / def.melee.base;
}

function body(world: World, creature: Creature): CreatureBody {
  const def = defOf(creature);
  return {
    walk: def.walk,
    sprint: def.sprint,
    attack: def.attack === null ? null : { effect: "damage", amount: def.attack.damage * meleeScale(def, creature.level), interval: def.attack.interval, reach: def.attack.reach + def.radius },
    wander: { radius: world.regions.get(creature.region)?.radius ?? 16 },
  };
}

// --- spawning -----------------------------------------------------------------------------

function rollLevel(ctx: GameContext): number {
  // Low levels are common and high ones rare, as on ARK's Island.
  return WILD_LEVELS.min + Math.floor(Math.pow(ctx.rng(), 1.6) * (WILD_LEVELS.max - WILD_LEVELS.min + 1));
}

export function spawnCreature(ctx: GameContext, species: string, at: readonly [number, number], options: { region?: string; level?: number } = {}): string | null {
  const def = speciesDef(species);
  if (def === null || ctx.world.groundHeightAt(at[0], at[1]) < SHORE) return null;
  const world = worldOf(ctx);
  const id = `${species}_${(world.seq += 1)}`;
  const level = options.level ?? rollLevel(ctx);
  const position: [number, number, number] = [at[0], ctx.world.groundHeightAt(at[0], at[1]), at[1]];
  ctx.scene.entity.spawn(species, { id, position, rotationY: ctx.rng() * Math.PI * 2, role: "npc" });
  const health = maxHealth(def, level);
  ctx.scene.entity.stats.set(id, "health", { max: health, current: health });
  world.creatures.set(id, { id, species, level, region: options.region ?? "", inventory: createEmptyInventory({ slots: CREATURE_SLOTS }), tamed: false, saddled: false, dead: false, rot: 0 });
  world.driver.add(id, position);
  world.taming.track(id, species, level);
  return id;
}

function populate(ctx: GameContext, world: World): void {
  if (world.populated) return;
  world.populated = true;
  for (const herd of herds()) {
    for (let i = 0; i < herd.count; i += 1) {
      const point = herd.ring[Math.floor(ctx.rng() * herd.ring.length)]!;
      if (spawnCreature(ctx, herd.species, point, { region: herd.region }) !== null) world.director.notifySpawned(herd.region, herd.species);
    }
  }
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
    return { label: `${def.label} body`, granted: cut.granted, killed: false, knockedOut: false };
  }
  const damage = tool.damage * melee;
  ctx.scene.entity.effect({ from: attackerId, to: target.id, effect: "damage", via: { amount: damage } });
  world.driver.hurt(ctx, target.id, attackerId);
  world.lastTarget = { id: target.id, until: ctx.time.now() + 10 };
  const wasDown = world.taming.state(target.id)?.unconscious === true;
  if (wasDown) world.taming.damage(target.id, damage / maxHealth(def, target.level));
  const knockedOut = !wasDown && world.taming.addTorpor(target.id, (tool.torpor ?? 0) * TORPOR_TAKEN * melee);
  if (knockedOut) knockOut(ctx, target);
  const killed = (ctx.scene.entity.stats.get(target.id, "health")?.current ?? 1) <= 0;
  if (killed) kill(ctx, target);
  return { label: def.label, granted: [], killed, knockedOut };
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
  const hit = strikeCreature(ctx, mountId, entity.rotationY, bite, meleeScale(def, mount.level));
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
  lie(ctx, creature.id, true);
}

function tame(ctx: GameContext, creature: Creature, effectiveness: number, bonus: number): void {
  const world = worldOf(ctx);
  const def = defOf(creature);
  creature.tamed = true;
  creature.level += bonus;
  const health = maxHealth(def, creature.level);
  ctx.scene.entity.stats.set(creature.id, "health", { max: health, current: health });
  lie(ctx, creature.id, false);
  const entity = ctx.scene.entity.get(creature.id);
  const home = entity === null ? null : ([entity.position[0], entity.position[1], entity.position[2]] as const);
  // ARK's fresh tame waits where it woke, not following until whistled.
  world.roster.adopt(ctx.player.userId, { id: creature.id, command: "stay", home, leash: 40, level: creature.level });
  if (home !== null) world.driver.setHome(creature.id, home);
  if (creature.region !== "") world.director.notifyRemoved(creature.region, creature.species);
  creature.region = "";
  ctx.game.notices.push({ text: `${def.label} tamed! Level ${creature.level} (+${bonus} from ${Math.round(effectiveness * 100)}% taming effectiveness)`, tone: "success" });
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
  populate(ctx, world);
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
    const record = creature.tamed ? world.roster.get(creature.id) : null;
    const mind = down || ridden
      ? ({ kind: "still" } as const)
      : record !== null
        ? ({ kind: "tamed", intent: world.roster.resolveIntent(creature.id, { ownerPosition: owner?.position ?? null, ownerTargetId: ownerTarget, threats })! } as const)
        : ({ kind: "wild", temperament: temperamentOf(def) } as const);
    const step = world.driver.step(ctx, creature.id, mind, body(world, creature), dt);
    world.steps.set(creature.id, step);
    if (step.struck && step.targetId !== null && world.creatures.has(step.targetId)) world.driver.hurt(ctx, step.targetId, creature.id);
  }

  for (const request of world.director.tick(dt)) {
    const region = world.regions.get(request.region);
    const point = request.point ?? (region === undefined ? null : ([region.center[0], region.center[2]] as const));
    if (point === null) continue;
    // A herd never refills in plain view: wait until the survivor has wandered off.
    const near = owner !== null && Math.hypot(owner.position[0] - point[0], owner.position[2] - point[1]) < 60;
    if (near || spawnCreature(ctx, request.species, point, { region: request.region }) === null) world.director.notifyRemoved(request.region, request.species);
  }

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
  if (creature === undefined || creature.dead) return;
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
  if (creature === undefined || creature.dead) return [];
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

function viewed(ctx: GameContext): Creature | null {
  const world = worldOf(ctx);
  const creature = world.viewing === null ? undefined : world.creatures.get(world.viewing);
  return creature === undefined || creature.dead ? null : creature;
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
    order: creature.tamed ? (world.roster.get(creature.id)?.command ?? null) : null,
    taming: creature.tamed ? null : tamingView(world, creature, world.taming.state(creature.id)),
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
      world.creatures = new Map(data.creatures.map((creature) => [creature.id, structuredClone(creature)]));
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
