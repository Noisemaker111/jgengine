import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RideTickSink } from "@jgengine/core/sim/rides";

import { guestCap } from "../catalog";
import type { BuildableDef, StaffRole } from "../objects/catalog";
import { GUEST_WALK_SPEED, guestKindFor } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState } from "../session";
import { fairPrice, park, parkObject, ridePrice, stallPrice, stockOf, type ParkObject } from "../park";
import {
  agentOf,
  clearAgents,
  createGuestAgent,
  forgetAgent,
  guestTargets,
  guestTaste,
  midwayPoint,
  parkMood,
  rideFun,
  syncAgentStates,
} from "../agents";
import { demand } from "./rating";
import { tallyThoughts, think, type ThoughtId } from "./thoughts";
import { staffCover } from "../staff";
import { joinRide, leaveRide, queuePosition, rideView, tickRides } from "../rides";
import { accessOf } from "../build/links";
import { groundAt } from "../build/terrain";

/**
 * The walking crowd. Guests are agents with bodies (game code), but everything they do to the park
 * goes through the world: a guest through the gate is the `admit` ripple, any money handed over is
 * `pay`, a stall's sale is that stall's `sold` fact, leaving is `leave`, and a ride breaking is the
 * `breakdown` ripple. They read the world back the same way: the ticket, whether the park is open,
 * its litter and what the crowd is saying (`park.buzz`).
 */

const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 14;
const MIN_SPEND = 2;
const STALL_SERVICE = 2.2;
const BROWSE_SECONDS = 3;
const TARGET_PATIENCE = 25;
const LEAVE_PATIENCE = 30;
const QUEUE_CHECK_SECONDS = 8;
/** Seconds between a guest's checks on how it feels (plus up to as much again). */
const THINK_SECONDS = 6;
/** An entertainer in reach lifts a guest's mood by this much. */
const ENTERTAINER_MOOD = 8;
/** Below this mood a guest with no guard in reach kicks over bins... */
const VANDAL_MOOD = 30;
/** ...adding this much litter a second. */
const VANDAL_LITTER = 0.05;
const NO_COVER: ReadonlySet<StaffRole> = new Set();

/** The needs a guest says out loud when they run low, and what it says. */
const NEED_THOUGHTS: readonly { need: string; below: number; id: ThoughtId; text: string }[] = [
  { need: "toilet", below: 0.22, id: "toilet", text: "I really need the toilet" },
  { need: "nausea", below: 0.4, id: "sick", text: "I feel sick" },
  { need: "hunger", below: 0.25, id: "hungry", text: "I'm hungry" },
  { need: "thirst", below: 0.25, id: "thirsty", text: "I'm thirsty" },
  { need: "info", below: 0.3, id: "lost", text: "I'm lost!" },
  { need: "energy", below: 0.2, id: "tired", text: "I'm tired" },
];

/** A guest checks how it feels and says the most pressing thing. */
function feel(guest: GuestState, agent: ReturnType<typeof agentOf>, litter: number, cover: ReadonlySet<StaffRole>, now: number): void {
  for (const entry of NEED_THOUGHTS) {
    if (agent.needs.fraction(entry.need) < entry.below) {
      think(guest, entry.id, entry.text, now);
      return;
    }
  }
  if (litter > 40) think(guest, "dirty", "This park is really dirty", now);
  else if (cover.has("entertainer")) think(guest, "entertained", "That entertainer is funny!", now);
}

/** How much of the crowd's buzz each guest feels: a breakdown's -15 is about -9 mood each. */
const BUZZ_WEIGHT = 0.6;

/** How close a guest must get to a structure: a ride's own footprint keeps it out of the middle. */
function arriveRadius(def: BuildableDef): number {
  return Math.max(ARRIVE_DISTANCE, def.footprint / 2 + 1.4);
}

/** Where a guest walks to for a structure: a ride's entrance, or the shop itself. */
function doorOf(ctx: GameContext, obj: ParkObject): { at: [number, number, number]; radius: number } {
  const door = obj.def.ride === undefined ? null : accessOf(ctx, obj.id)?.door ?? null;
  if (door === null) return { at: [obj.x, 0, obj.z], radius: arriveRadius(obj.def) };
  return { at: [door[0], 0, door[1]], radius: ARRIVE_DISTANCE };
}

/** A queue line makes a long wait easier to bear. */
const LINE_TOLERANCE = 1.6;

function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function makeGuest(ctx: GameContext, id: string, start: readonly [number, number, number]): GuestState {
  const kind = guestKindFor(id);
  const agent = createGuestAgent(id, kind, ctx.rng);
  const guest: GuestState = {
    id,
    kind,
    money: 20 + ctx.rng() * 40,
    visits: 0,
    phase: "seeking",
    targetId: null,
    target: null,
    targetUntil: 0,
    busy: 0,
    agent: agent.snapshot(),
  };
  session.guests.set(id, guest);
  ctx.scene.entity.spawn(kind, { id, position: start, role: "npc" });
  return guest;
}

function spawnGuest(ctx: GameContext): void {
  const id = nextGuestId();
  const jitter = (ctx.rng() - 0.5) * 10;
  makeGuest(ctx, id, [jitter, 0, 56]);
  // Through the turnstile, then the entry ticket: both are ripples the world declares.
  park.emit(ctx, { kind: "admit" });
  park.emit(ctx, { kind: "pay", scale: park.of(ctx).num("park.ticket") });
}

export function seedGuests(ctx: GameContext, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = nextGuestId();
    makeGuest(ctx, id, [(ctx.rng() - 0.5) * 80, 0, (ctx.rng() - 0.5) * 80]);
  }
  // A seeded crowd is already inside: it counts on site, not through today's gate.
  park.of(ctx).change({ "park.guests": count });
}

export function spawnGuests(ctx: GameContext, dt: number, totalAppeal: number): void {
  const w = park.of(ctx);
  const rating = w.num("park.rating");
  const cap = guestCap(rating);
  if (session.guests.size >= cap) return;
  const rate = demand(totalAppeal, w.num("park.ticket"), rating, w.fact("park.open") === true);
  session.spawnAcc += rate * dt;
  let budget = 4;
  while (session.spawnAcc >= 1 && session.guests.size < cap && budget > 0) {
    session.spawnAcc -= 1;
    budget -= 1;
    spawnGuest(ctx);
  }
}

function dropTarget(guest: GuestState): void {
  guest.targetId = null;
  guest.target = null;
  guest.busy = 0;
  guest.phase = "seeking";
}

/** A guest finishing at a stall: pay, take the stock, fill the need. Rides settle through the sim. */
function finishInteraction(ctx: GameContext, guest: GuestState): void {
  const obj = parkObject(ctx, guest.targetId);
  const agent = agentOf(guest, ctx.rng);
  if (obj !== undefined) {
    const stall = obj.def.stall;
    const w = park.of(ctx);
    const price = stall === undefined ? 0 : stallPrice(w, obj.kind);
    if (stall !== undefined && price > fairPrice(w, obj, 0)) {
      // Wanted it, wouldn't pay that: the park hears about it and the guest sulks a little.
      park.emit(ctx, { kind: "refused_price" });
      agent.moodSources.setSource("price", -6);
      think(guest, "too_expensive", `I'm not paying $${price} for the ${obj.def.label}`, ctx.time.now());
    } else if (stall !== undefined && stockOf(w, obj) > 0 && guest.money >= price) {
      if (price > 0 && price <= stall.value * 0.8) think(guest, "good_value", `The ${obj.def.label} is good value`, ctx.time.now());
      guest.money -= price;
      w.change({ [`${obj.id}.sold`]: 1, [`${obj.id}.sold_total`]: 1 });
      if (price > 0) park.emit(ctx, { kind: "pay", scale: price });
      agent.needs.refill(stall.need, stall.fill);
      // What goes in must come out.
      if (stall.need === "hunger" || stall.need === "thirst") agent.needs.refill("toilet", -18);
    }
    guest.visits += 1;
  }
  dropTarget(guest);
}

function shouldLeave(ctx: GameContext, guest: GuestState): boolean {
  const agent = agentOf(guest, ctx.rng);
  return park.of(ctx).fact("park.open") !== true || guest.money < MIN_SPEND || agent.mood().score < 18 || guest.visits >= MAX_VISITS;
}

function moveGuest(ctx: GameContext, guest: GuestState, target: readonly [number, number, number], dt: number, radius = ARRIVE_DISTANCE): boolean {
  const next = ctx.scene.entity.moveToward(guest.id, target, { speed: GUEST_WALK_SPEED, dt, stopDistance: 0 });
  if (next === null) return false;
  // Feet on the ground, whatever level the land is at.
  const feet: [number, number, number] = [next[0], groundAt(park.of(ctx), next[0], next[2]), next[2]];
  ctx.scene.entity.setPose(guest.id, { position: feet });
  return distance2(next[0], next[2], target[0], target[2]) <= radius;
}

function despawnGuest(ctx: GameContext, guest: GuestState): void {
  if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
  guest.agent = agentOf(guest, ctx.rng).snapshot();
  forgetAgent(guest.id);
  if (ctx.scene.entity.selection.has(guest.id)) ctx.scene.entity.selection.remove(guest.id);
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
  park.emit(ctx, { kind: "leave" });
}

/**
 * Where the next guest in line stands: along the ride's queue line when it has one (two to a tile),
 * else bunched outside its entrance, else out from its own footprint.
 */
function queueSpot(ctx: GameContext, obj: ParkObject, index: number): [number, number, number] {
  const access = accessOf(ctx, obj.id);
  const i = Math.max(0, index);
  if (access !== null && access.line.length > 0) {
    const tile = access.line[Math.min(access.line.length - 1, Math.floor(i / 2))]!;
    const side = i % 2 === 0 ? -0.8 : 0.8;
    return [tile[0] + side, 0, tile[1] + side * 0.5];
  }
  if (access?.door != null) {
    const [dx, dz] = access.door;
    const away = Math.atan2(dz - obj.z, dx - obj.x);
    return [dx + Math.cos(away) * (1 + i * 0.9), 0, dz + Math.sin(away) * (1 + i * 0.9)];
  }
  return [obj.x, 0, obj.z - arriveRadius(obj.def) - i * 1.15];
}

/** The line a guest is standing in: its own measured wait, or a sold-out stall's crowd. */
function queuePenalty(ctx: GameContext, guest: GuestState): number {
  const obj = parkObject(ctx, guest.targetId);
  if (obj === undefined) return 0;
  if (obj.def.ride !== undefined) {
    // Standing in line is what wears a guest down; walking towards a ride is not a wait yet.
    if (guest.phase !== "queued") return 0;
    const view = rideView(obj.id);
    if (view === null) return 0;
    const seconds = view.queue.wait.seconds + (view.phase === "broken" ? 45 : 0);
    return -Math.min(14, seconds * 0.18);
  }
  return obj.def.stall !== undefined && stockOf(park.of(ctx), obj) <= 0 ? -12 : 0;
}

/**
 * The ride sim's own events: a boarding pays the ride's ticket into the world, an alighting fills the
 * guest's fun from the ride's ratings, and a breakdown is the world's `breakdown` ripple - the crowd
 * groans and the crew is sent. The repair itself is the world's crew order, not the sim's.
 */
function makeRideSink(ctx: GameContext): RideTickSink {
  return {
    onBoard(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = parkObject(ctx, rideId);
      if (guest === undefined || obj === undefined) return;
      const price = ridePrice(park.of(ctx), obj.kind);
      if (price > 0) {
        guest.money = Math.max(0, guest.money - price);
        park.emit(ctx, { kind: "pay", scale: price });
      }
      guest.phase = "riding";
      guest.busy = 0;
      guest.targetId = rideId;
      ctx.scene.entity.setPose(guestId, { position: [obj.x, 0, obj.z] });
    },
    onAlight(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = parkObject(ctx, rideId);
      if (guest === undefined || obj === undefined) return;
      const agent = agentOf(guest, ctx.rng);
      agent.needs.refill("fun", rideFun(guest.kind, obj));
      // A wild ride unsettles the stomach in proportion to its nausea rating.
      const nausea = rideView(rideId)?.ratings.nausea ?? 0;
      if (nausea > 0) agent.needs.refill("nausea", -nausea * 6);
      const fun = rideFun(guest.kind, obj);
      if (agent.needs.fraction("nausea") < 0.4) think(guest, "sick", `The ${obj.def.label} made me feel sick`, ctx.time.now());
      else if (fun >= 6) think(guest, "great_ride", `The ${obj.def.label} was great!`, ctx.time.now());
      guest.visits += 1;
      guest.phase = "seeking";
      guest.targetId = null;
      guest.target = null;
      const exit = accessOf(ctx, rideId)?.exit ?? null;
      ctx.scene.entity.setPose(guestId, { position: exit === null ? [obj.x + 2.6, 0, obj.z + 2.6] : [exit[0], 0, exit[1]] });
    },
    onBreak(rideId) {
      park.emit(ctx, { kind: "breakdown", by: rideId });
    },
  };
}

const sinks = new WeakMap<GameContext, RideTickSink>();

/** Advance the park's rides one tick; their events land on the guests and the world. */
export function tickRidePark(ctx: GameContext, dt: number): void {
  let sink = sinks.get(ctx);
  if (sink === undefined) {
    sink = makeRideSink(ctx);
    sinks.set(ctx, sink);
  }
  tickRides(ctx, dt, sink);
}

/** Walk where the agent chose; a guest gives up on a line it has no hope of reaching the front of. */
function holdPlaceInLine(ctx: GameContext, guest: GuestState, obj: ParkObject, dt: number): void {
  const view = rideView(obj.id);
  if (view === null) {
    dropTarget(guest);
    return;
  }
  const index = queuePosition(obj.id, guest.id);
  moveGuest(ctx, guest, queueSpot(ctx, obj, index), dt);
  if (ctx.time.now() < guest.targetUntil) return;
  guest.targetUntil = ctx.time.now() + QUEUE_CHECK_SECONDS;
  // How long this guest actually faces from where it stands, at the line's own measured pace.
  const waitFromHere = (index + 1) * view.queue.wait.perGuestSeconds;
  const tolerance = guestTaste(guest.kind).queueTolerance * ((accessOf(ctx, obj.id)?.line.length ?? 0) > 0 ? LINE_TOLERANCE : 1);
  const hopeless = view.phase === "broken" ? waitFromHere > tolerance * 0.5 : waitFromHere > tolerance;
  if (!hopeless) return;
  leaveRide(obj.id, guest.id);
  dropTarget(guest);
  agentOf(guest, ctx.rng).moodSources.setSource("queue", -14);
  if (view.phase === "broken") think(guest, "broken", `The ${obj.def.label} has broken down`, ctx.time.now());
  else think(guest, "queue_long", `The queue for the ${obj.def.label} is too long`, ctx.time.now());
}

function arriveAtRide(ctx: GameContext, guest: GuestState, obj: ParkObject): void {
  const w = park.of(ctx);
  const price = ridePrice(w, obj.kind);
  const excitement = rideView(obj.id)?.ratings.excitement ?? 0;
  if (price > fairPrice(w, obj, excitement) || guest.money < price) {
    if (guest.money >= price) park.emit(ctx, { kind: "refused_price" });
    agentOf(guest, ctx.rng).moodSources.setSource("price", -6);
    if (guest.money >= price) think(guest, "too_expensive", `I'm not paying $${price} for the ${obj.def.label}`, ctx.time.now());
    else think(guest, "no_money", `I can't afford the ${obj.def.label}`, ctx.time.now());
    dropTarget(guest);
    return;
  }
  if (!joinRide(obj.id, guest.id)) {
    dropTarget(guest);
    return;
  }
  guest.phase = "queued";
  guest.busy = 0;
  guest.targetUntil = ctx.time.now() + QUEUE_CHECK_SECONDS;
}

/** Who is heading for or standing at each structure this tick: the crowd the next guest prices in. */
function countOccupants(): void {
  session.occupants.clear();
  for (const guest of session.guests.values()) {
    if (guest.targetId === null || guest.phase === "leaving") continue;
    session.occupants.set(guest.targetId, (session.occupants.get(guest.targetId) ?? 0) + 1);
  }
}

export function tickGuests(ctx: GameContext, dt: number, tracks: number): void {
  const now = ctx.time.now();
  const w = park.of(ctx);
  const litter = w.num("park.litter");
  const buzz = w.num("park.buzz") * BUZZ_WEIGHT;
  let vandalism = 0;
  countOccupants();
  for (const guest of session.guests.values()) {
    const agent = agentOf(guest, ctx.rng);
    agent.moodSources.setSource("litter", -litter * 0.02);
    agent.moodSources.setSource("buzz", buzz);
    const at = ctx.scene.entity.get(guest.id)?.position;
    const cover = at === undefined ? NO_COVER : staffCover(ctx, at[0], at[2]);
    // An entertainer nearby cheers the guest and halves the sting of a long line.
    agent.moodSources.setSource("entertainer", cover.has("entertainer") ? ENTERTAINER_MOOD : 0);
    agent.moodSources.setSource("queue", queuePenalty(ctx, guest) * (cover.has("entertainer") ? 0.5 : 1));
    // An unhappy guest with no guard in sight kicks over bins.
    if (agent.mood().score < VANDAL_MOOD && !cover.has("security")) vandalism += VANDAL_LITTER * dt;
    if (now >= (guest.nextThink ?? 0)) {
      guest.nextThink = now + THINK_SECONDS + ctx.rng() * THINK_SECONDS;
      feel(guest, agent, litter, cover, now);
    }

    if (guest.phase === "busy") {
      guest.busy -= dt;
      if (guest.busy <= 0) finishInteraction(ctx, guest);
      agent.update({ dt, now, targets: guestTargets(ctx, guest, tracks, guest.target ?? midwayPoint()) });
      continue;
    }

    if (guest.phase === "queued" || guest.phase === "riding") {
      const obj = parkObject(ctx, guest.targetId);
      if (obj === undefined) {
        if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
        dropTarget(guest);
      } else if (guest.phase === "queued") {
        holdPlaceInLine(ctx, guest, obj, dt);
      }
      agent.update({ dt, now });
      continue;
    }

    if (guest.phase === "leaving") {
      agent.update({ dt, now });
      const arrived = moveGuest(ctx, guest, [0, 0, 58], dt);
      if (arrived || now > guest.targetUntil) despawnGuest(ctx, guest);
      continue;
    }

    if (guest.targetId !== null && (parkObject(ctx, guest.targetId) === undefined || w.fact(`${guest.targetId}.closed`) === true)) {
      guest.targetId = null;
      guest.target = null;
    }

    const position = ctx.scene.entity.get(guest.id)?.position ?? [0, 0, 56];
    const frame = agent.update({ dt, now, targets: guestTargets(ctx, guest, tracks, position) });

    if (guest.targetId === null) {
      if (shouldLeave(ctx, guest)) {
        if (guest.money < MIN_SPEND) think(guest, "no_money", "I've spent all my money", now);
        else if (agent.mood().score >= 60) think(guest, "lovely_park", "What a lovely park!", now);
        else if (agent.mood().score < 18) think(guest, "tired", "I want to go home", now);
        guest.phase = "leaving";
        guest.target = null;
        guest.targetUntil = now + LEAVE_PATIENCE;
        continue;
      }
      const target = frame.action.target;
      const obj = target === null || target === "midway" ? undefined : parkObject(ctx, target);
      guest.targetUntil = now + TARGET_PATIENCE;
      if (obj === undefined) {
        guest.target = midwayPoint();
      } else {
        guest.targetId = obj.id;
        guest.target = doorOf(ctx, obj).at;
      }
    }

    if (guest.target !== null) {
      if (now > guest.targetUntil) {
        dropTarget(guest);
        continue;
      }
      const obj = parkObject(ctx, guest.targetId);
      const arrived = obj !== undefined ? moveGuest(ctx, guest, guest.target, dt, doorOf(ctx, obj).radius) : moveGuest(ctx, guest, guest.target, dt);
      if (arrived && obj !== undefined) {
        if (obj.def.ride !== undefined) {
          arriveAtRide(ctx, guest, obj);
        } else {
          guest.phase = "busy";
          guest.busy = STALL_SERVICE;
        }
      } else if (arrived) {
        guest.busy = BROWSE_SECONDS;
        guest.phase = "busy";
      }
    }
  }

  if (vandalism > 0) w.change({ "park.litter": vandalism });
  // The crowd's mood and its complaints are world facts: the rating, the HUD and the scenarios read them there.
  session.thoughts = tallyThoughts(session.guests.values(), now);
  w.set("park.complaints", session.thoughts.complaintShare);
  if (session.guests.size > 0) w.set("park.mood", parkMood());
}

/** Refresh the plain guest state from the live agents before a save is written. */
export { syncAgentStates };

/** Drop every live agent - a new park or a restore replaces them from their own snapshots. */
export function resetGuestAgents(): void {
  clearAgents();
}
