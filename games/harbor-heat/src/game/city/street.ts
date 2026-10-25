import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../../editorLayers";
import { spend } from "../cash";
import { GANGS, TURF, type GangId } from "../city";
import { landHit } from "../combat/hitModel";
import { cityEvent, cityOf } from "../cityRuntime";
import { handrollOf } from "../handroll";
import { frontIn } from "./fronts";

/**
 * The street layer of the city's systems: each crew standing on the blocks it holds, crews pushing
 * into blocks they want, the Carmines and the Riptides shooting it out where their war lands, cover
 * HHPD can't see into, and the two ways to buy heat down (a respray at Sunset Motors, a call to Dee).
 * All of it reads the world model; none of it keeps state the world doesn't already have, except
 * which bodies are standing right now.
 */

/** Crews stand only on blocks within this many metres of the player, so the city never fills up. */
const CREW_REACH = 150;
/** Seconds before a block whose crew was dropped puts new soldiers on the corner. */
const CREW_RESPAWN = 45;
/** Metres around the block's centre the crew loiters. */
const CREW_SPREAD = 9;
/** A crew turns on the player once its gang is this angry (or the block is already shooting). */
export const WAR_MOOD = -20;
const PUSHERS = 3;
/** Soldiers each crew sends to a clash the player is close enough to see. */
const CLASH_SIDE = 2;
/** Seconds a clash's survivors hang around before going home. */
const CLASH_LIFETIME = 40;
const CLASH_RANGE = 26;
const CLASH_SHOT_RANGE = 15;
/** No cover hides you while a cop is this close: they watched you pull in. */
const COVER_BLOWN = 28;
const RESPRAY_PER_STAR = 150;
const PAYOFF_PER_STAR = 400;

/** What each crew sends onto the street. */
const SOLDIER: Record<GangId, string> = { carmine: "ganger_dock", riptide: "riptide_soldier" };
export const GANG_LABEL: Record<string, string> = { carmine: "The Carmines", riptide: "The Riptides" };

/** Which crew a body belongs to, by its catalog id, or null for anyone else. */
export function gangOf(catalogId: string): GangId | null {
  if (catalogId.startsWith("ganger_") || catalogId === "kingpin_sal") return "carmine";
  if (catalogId.startsWith("riptide_")) return "riptide";
  return null;
}

const isGang = (value: unknown): value is GangId => (GANGS as readonly unknown[]).includes(value);

interface Street {
  /** Sim seconds before fast driving can scare the street again. */
  recklessAt: number;
  /** Sim seconds at which each block may put a crew on the corner again. */
  cooldown: Record<string, number>;
  /** Crew ids standing per block, so a dropped one is noticed. */
  standing: Record<string, string[]>;
  /** The crew standing on each block, so a block that changed hands swaps its corner crew. */
  standingFor: Record<string, GangId>;
  /** Clashes on the street: the block and when the survivors go home. */
  clashes: Record<string, number>;
  nextCheck: number;
}

const streetOf = perContext((): Street => ({ recklessAt: 0, cooldown: {}, standing: {}, standingFor: {}, clashes: {}, nextCheck: 0 }));

const crewId = (place: string, index: number) => `crew_${place}_${index}`;
const pusherId = (place: string, gang: GangId, index: number) => `crew_push_${gang}_${place}_${index}`;
const clashId = (place: string, gang: GangId, index: number) => `clash_${place}_${gang}_${index}`;

/** Crew members on a block: one more after dark, one fewer as the grip slips. */
function crewSize(ctx: GameContext, place: string): number {
  const world = cityOf(ctx);
  if (!isGang(world.fact(`${place}.owner`))) return 0;
  const grip = world.num(`${place}.grip`);
  const base = grip >= 60 ? 3 : grip >= 25 ? 2 : 1;
  return base + (world.fact("clock.night") === true ? 1 : 0);
}

function spawnAround(ctx: GameContext, id: string, catalogId: string, at: readonly [number, number], index: number, count: number, spread = CREW_SPREAD): void {
  if (ctx.scene.entity.get(id) !== null) return;
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + 0.6;
  const x = at[0] + Math.cos(angle) * spread;
  const z = at[1] + Math.sin(angle) * spread;
  ctx.scene.entity.spawn(catalogId, { id, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
}

/** Put each nearby crew block's soldiers on its corner, and swap them when the block changed hands. */
export function tickStreetCrews(ctx: GameContext): void {
  const street = streetOf(ctx);
  const now = ctx.time.now();
  if (now < street.nextCheck) return;
  street.nextCheck = now + 1;
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const world = cityOf(ctx);
  for (const place of TURF) {
    const at = world.position(place);
    if (at === null) continue;
    const owner = world.fact(`${place}.owner`);
    const near = Math.hypot(at[0] - player.position[0], at[1] - player.position[2]) <= CREW_REACH;
    const want = near ? crewSize(ctx, place) : 0;
    const before = street.standing[place] ?? [];
    const swapped = street.standingFor[place] !== undefined && street.standingFor[place] !== owner;
    const alive = before.filter((id) => ctx.scene.entity.get(id) !== null);
    if (alive.length < before.length && want > 0 && !swapped) street.cooldown[place] = now + CREW_RESPAWN;
    if (want === 0 || !near || swapped || !isGang(owner)) {
      for (const id of alive) ctx.scene.entity.despawn(id);
      street.standing[place] = [];
      delete street.standingFor[place];
      continue;
    }
    if (alive.length === 0 && (street.cooldown[place] ?? 0) <= now) {
      const ids = Array.from({ length: want }, (_, index) => crewId(place, index));
      ids.forEach((id, index) => spawnAround(ctx, id, SOLDIER[owner], at, index, want));
      street.standing[place] = ids;
      street.standingFor[place] = owner;
    } else {
      street.standing[place] = alive;
    }
  }
}

/**
 * Whether a crew body on the street goes for the player: pushers and raiders always, clash fighters
 * only while their own crew is angry at you, corner crews once it's war or their block is shooting.
 */
export function crewHostile(ctx: GameContext, entity: { id: string; name: string; position: readonly [number, number, number] }): boolean {
  const corner = entity.id.startsWith("crew_") && !entity.id.startsWith("crew_push_");
  const clash = entity.id.startsWith("clash_");
  if (!corner && !clash) return true;
  const world = cityOf(ctx);
  const gang = gangOf(entity.name);
  if (gang !== null && world.num(`${gang}.mood`) <= WAR_MOOD) return true;
  if (clash) return false;
  const place = world.placeAt(entity.position[0], entity.position[2]);
  return place !== null && world.num(`${place}.fear`) >= 30;
}

/** World hook: a crew pushes into a block the player holds; if the player is close, the crew turns up. */
export function crewPush(ctx: GameContext, call: WorldHookCall): void {
  if (call.place === null) return;
  const world = cityOf(ctx);
  const gang = world.fact(`${call.place}.attacker`);
  if (!isGang(gang)) return;
  const at = world.position(call.place);
  const player = ctx.scene.entity.get(ctx.player.userId);
  const label = world.def.places?.[call.place]?.label ?? "your block";
  const crew = gang === "riptide" ? "Riptide" : "Carmine";
  if (at === null || player === null || Math.hypot(at[0] - player.position[0], at[1] - player.position[2]) > CREW_REACH) {
    ctx.game.notices.push({ text: `${crew} crews are pushing into ${label}. Its hold is slipping.`, tone: "warn" });
    return;
  }
  for (let index = 0; index < PUSHERS; index += 1) spawnAround(ctx, pusherId(call.place, gang, index), SOLDIER[gang], at, index, PUSHERS);
  ctx.game.notices.push({ text: `${crew} crew rolling into ${label}! Drop them or lose the block.`, tone: "warn" });
  ctx.game.feedback.cue("deny", `Crew in ${label}`);
}

/**
 * World hook: the crews' war landed on a block. Far from the player it is a line on the news; within
 * reach, two soldiers from each side turn up and shoot it out, and whoever drops whom moves the block.
 */
export function gangClash(ctx: GameContext, call: WorldHookCall): void {
  if (call.place === null) return;
  const street = streetOf(ctx);
  const now = ctx.time.now();
  if ((street.clashes[call.place] ?? 0) > now) return;
  const world = cityOf(ctx);
  const at = world.position(call.place);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (at === null || player === null || Math.hypot(at[0] - player.position[0], at[1] - player.position[2]) > CREW_REACH) return;
  street.clashes[call.place] = now + CLASH_LIFETIME;
  GANGS.forEach((gang, side) => {
    // The two crews come at each other from opposite sides of the block's centre.
    const offset = side === 0 ? -1 : 1;
    const from: readonly [number, number] = [at[0] + offset * 10, at[1] + offset * 4];
    for (let index = 0; index < CLASH_SIDE; index += 1) spawnAround(ctx, clashId(call.place!, gang, index), SOLDIER[gang], from, index, CLASH_SIDE, 2.5);
  });
  const label = world.def.places?.[call.place]?.label ?? "the block";
  ctx.game.notices.push({ text: `Carmines and Riptides are shooting it out in ${label}.`, tone: "warn" });
}

/** Clash fighters go for the nearest soldier of the other crew; when nobody is left to fight, they go home. */
export function tickClashes(ctx: GameContext, dt: number): void {
  const street = streetOf(ctx);
  const now = ctx.time.now();
  const fighters = ctx.scene.entity.list().filter((entity) => entity.id.startsWith("clash_"));
  if (fighters.length === 0) return;
  const soldiers = ctx.scene.entity.list().filter((entity) => gangOf(entity.name) !== null);
  for (const fighter of fighters) {
    const place = fighter.id.split("_")[1] ?? "";
    if ((street.clashes[place] ?? 0) <= now) {
      ctx.scene.entity.despawn(fighter.id);
      continue;
    }
    const gang = gangOf(fighter.name);
    let target: (typeof soldiers)[number] | null = null;
    let best = CLASH_RANGE;
    for (const other of soldiers) {
      const theirs = gangOf(other.name);
      if (theirs === null || theirs === gang) continue;
      const distance = Math.hypot(other.position[0] - fighter.position[0], other.position[2] - fighter.position[2]);
      if (distance < best) {
        best = distance;
        target = other;
      }
    }
    if (target === null) continue;
    if (best > 7) ctx.scene.entity.moveToward(fighter.id, target.position, { speed: 4.2, stopDistance: 6, dt });
    if (best > CLASH_SHOT_RANGE || !ctx.scene.entity.hasLineOfSight(fighter.id, target.id)) continue;
    const meta = (fighter.meta ?? {}) as { nextShotAt?: number };
    if ((meta.nextShotAt ?? 0) > now) continue;
    ctx.scene.entity.update(fighter.id, { meta: { ...meta, nextShotAt: now + 1.1 + (fighter.id.length % 3) * 0.2 } });
    landHit(ctx, { from: fighter.id, to: target.id, type: "ballistic", base: 9 });
  }
}

/** Residents and pedestrians on a block the player holds don't talk to HHPD. Cops still see everything. */
export function quietOnYourBlock(ctx: GameContext, entity: { readonly position: readonly [number, number, number] }): boolean {
  const world = cityOf(ctx);
  const place = world.placeAt(entity.position[0], entity.position[2]);
  return place !== null && world.fact(`${place}.owner`) === "player";
}

/** Cover HHPD doesn't look into, as the scene authors it: a radius, and what the player must own first. */
interface Hideout {
  id: string;
  label: string;
  at: readonly [number, number];
  radius: number;
  needs: string | null;
}

const HIDEOUTS: readonly Hideout[] = editorLayers.markers
  .filter((marker) => marker.kind === "hideout")
  .map((marker) => ({
    id: marker.id,
    label: marker.label ?? marker.id,
    at: [marker.position.x, marker.position.z] as const,
    radius: typeof marker.meta?.radius === "number" ? marker.meta.radius : 8,
    needs: typeof marker.meta?.needs === "string" && marker.meta.needs !== "" ? marker.meta.needs : null,
  }));

function hideoutOpen(ctx: GameContext, hideout: Hideout, safehouseOwned: boolean): boolean {
  if (hideout.needs === null) return true;
  if (hideout.needs === "safehouse") return safehouseOwned;
  const front = frontIn(ctx, hideout.needs);
  return front !== null && cityOf(ctx).fact(`${front}.hit`) !== true;
}

function copWithin(ctx: GameContext, at: readonly [number, number, number], metres: number): boolean {
  return ctx.scene.entity.list().some((entity) => entity.name.startsWith("cop_") && entity.name !== "car_cop" && Math.hypot(entity.position[0] - at[0], entity.position[2] - at[2]) <= metres);
}

/** The cover the player is in right now, or null. */
export function coverAt(ctx: GameContext, safehouseOwned: boolean): Hideout | null {
  const body = ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId);
  if (body === null) return null;
  for (const hideout of HIDEOUTS) {
    if (Math.hypot(hideout.at[0] - body.position[0], hideout.at[1] - body.position[2]) > hideout.radius) continue;
    if (!hideoutOpen(ctx, hideout, safehouseOwned)) continue;
    if (copWithin(ctx, body.position, COVER_BLOWN)) return null;
    return hideout;
  }
  return null;
}

/** Tell the pursuit whether the player is in cover this tick; it cools the trail faster and ignores sightings. */
export function tickCover(ctx: GameContext, safehouseOwned: boolean): void {
  const handroll = handrollOf(ctx);
  const cover = handroll.wanted().stars > 0 ? coverAt(ctx, safehouseOwned) : null;
  const hidden = cover !== null;
  if (hidden === handroll.hidden()) return;
  handroll.setHidden(hidden);
  if (hidden) ctx.game.notices.push({ text: `Laying low at ${cover.label}. HHPD can't see you here.`, tone: "info" });
}

const motors = () => HIDEOUTS.find((hideout) => hideout.id === "hideout_motors") ?? null;

export const resprayCost = (stars: number) => stars * RESPRAY_PER_STAR;
export const payoffCost = (stars: number) => stars * PAYOFF_PER_STAR;

export function registerStreet(ctx: GameContext): void {
  handrollOf(ctx).setWitnessFilter(quietOnYourBlock);

  ctx.game.commands.define<Record<string, never>>("city.respray", {
    validate(state) {
      const stars = handrollOf(state).wanted().stars;
      const vehicle = handrollOf(state).drivingVehicleId();
      if (vehicle === null) return { reason: "no-car", message: "Bring a car into the bay." };
      if (stars === 0) return { reason: "clean", message: "Nobody's looking for this car." };
      const at = state.scene.entity.get(vehicle)?.position;
      if (at !== undefined && copWithin(state, at, 45)) return { reason: "watched", message: "Lose the tail first. They watched you pull in." };
      if (state.game.economy.balance(state.player.userId, "cash") < resprayCost(stars)) return { reason: "cost", message: `A respray costs $${resprayCost(stars)}.` };
      return null;
    },
    apply(state) {
      const handroll = handrollOf(state);
      const cost = resprayCost(handroll.wanted().stars);
      if (!spend(state, cost, "respray")) return;
      handroll.forgiveHeat(state, Number.MAX_SAFE_INTEGER);
      state.game.notices.push({ text: `New paint, new plates. HHPD lost you. -$${cost}`, tone: "success" });
      state.game.feedback.cue("objective", "Resprayed");
    },
  });

  ctx.game.commands.define<Record<string, never>>("city.payoff", {
    validate(state) {
      const world = cityOf(state);
      const stars = handrollOf(state).wanted().stars;
      if (world.fact("dee.known") !== true) return { reason: "unknown", message: "You don't know a cop who'd take it." };
      if (world.num("dee.trust") <= -20) return { reason: "burned", message: "Dee won't pick up." };
      if (stars === 0) return { reason: "clean", message: "There's nothing to lose." };
      if (state.game.economy.balance(state.player.userId, "cash") < payoffCost(stars)) return { reason: "cost", message: `Dee wants $${payoffCost(stars)} to lose a report.` };
      return null;
    },
    apply(state) {
      const handroll = handrollOf(state);
      const wanted = handroll.wanted();
      const cost = payoffCost(wanted.stars);
      if (!spend(state, cost, "payoff")) return;
      const floor = handroll.heatForStars(wanted.stars - 1);
      const left = handroll.forgiveHeat(state, Math.max(1, wanted.heat - floor + 1));
      cityOf(state).change({ "dee.trust": -3 });
      state.game.notices.push({ text: `Dee lost a report. ${left === 0 ? "You're clean." : `Down to ${left} star${left === 1 ? "" : "s"}.`} -$${cost}`, tone: "success" });
    },
  });
}

/** The respray prompt, shown to a driver in Sunset Motors' bay with heat on them. */
export function streetPrompts(ctx: GameContext): PositionedPrompt[] {
  const bay = motors();
  if (bay === null || handrollOf(ctx).drivingVehicleId() === null || handrollOf(ctx).wanted().stars === 0) return [];
  return [{
    id: "street:respray",
    position: { x: bay.at[0], z: bay.at[1] },
    priority: 3,
    prompt: { radius: bay.radius, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "city.respray", input: {} } },
  }];
}

export function streetPromptLabel(ctx: GameContext, id: string): string | null {
  if (id === "street:respray") return `Respray · $${resprayCost(handrollOf(ctx).wanted().stars)}`;
  return null;
}

/** What the phone's turf list shows. */
export function turfViews(ctx: GameContext) {
  const world = cityOf(ctx);
  return TURF.map((id) => {
    const attacker = world.fact(`${id}.attacker`);
    return {
      id,
      label: world.def.places?.[id]?.label ?? id,
      owner: String(world.fact(`${id}.owner`) ?? "carmine"),
      grip: Math.round(world.num(`${id}.grip`)),
      attacker: typeof attacker === "string" ? attacker : "",
    };
  });
}

/** Above this speed a car near people on foot is reckless driving, metres per second (about 40 km/h). */
const RECKLESS_SPEED = 11;
/** People on foot this close to a fast car jump clear, metres. */
const DODGE_REACH = 7;
const DODGE_STEP = 2.4;

const onFoot = (name: string) => name.startsWith("ped_") || name.startsWith("resident-");

/**
 * Fast driving past people on foot: they jump clear of the car's path, and the street remembers it as
 * reckless driving (a little fear, a little heat if anyone reports it) at most every few seconds.
 */
export function tickReckless(ctx: GameContext): void {
  const handroll = handrollOf(ctx);
  const id = handroll.drivingVehicleId();
  if (id === null || handroll.raceActive()) return;
  const speed = handroll.telemetry().speedMs;
  if (speed < RECKLESS_SPEED) return;
  const car = ctx.scene.entity.get(id);
  if (car === null) return;
  const heading: readonly [number, number] = [Math.sin(car.rotationY ?? 0), Math.cos(car.rotationY ?? 0)];
  let dodged = 0;
  for (const entity of ctx.scene.entity.list()) {
    if (!onFoot(entity.name)) continue;
    const dx = entity.position[0] - car.position[0];
    const dz = entity.position[2] - car.position[2];
    if (Math.hypot(dx, dz) > DODGE_REACH) continue;
    // Step off the car's line, to whichever side the person is already on.
    const side = dx * heading[1] - dz * heading[0] >= 0 ? 1 : -1;
    const x = entity.position[0] + heading[1] * side * DODGE_STEP;
    const z = entity.position[2] - heading[0] * side * DODGE_STEP;
    ctx.scene.entity.setPose(entity.id, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: Math.atan2(-dx, -dz) });
    dodged += 1;
  }
  const street = streetOf(ctx);
  const now = ctx.time.now();
  if (dodged === 0 || now < street.recklessAt) return;
  street.recklessAt = now + 4;
  // Your own block shrugs it off; anywhere else it is a scare and a call to HHPD.
  if (!quietOnYourBlock(ctx, car)) cityEvent(ctx, { kind: "reckless", at: [car.position[0], car.position[1], car.position[2]] });
}
