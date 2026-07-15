import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ENTRANCE, PARK_HALF, guestCap } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { GUEST_ID, GUEST_WALK_SPEED } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState, type PlacedObject } from "../session";
import { coasterThrill, demand } from "./rating";

const HUNGER_RATE = 3.1;
const THIRST_RATE = 3.8;
const HAPPY_DRIFT = 0.7;
const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 6;
const MIN_SPEND = 6;
const STALL_SERVICE = 2.2;

export function needPressure(value: number): number {
  return Math.max(0, (value - 45) / 55);
}

export function targetScore(
  guest: GuestState,
  obj: PlacedObject,
  tracks: number,
  distance: number,
): number {
  const def = buildableDef(obj.catalogId);
  const proximity = 1 / (1 + distance * 0.05);
  if (def.stall !== undefined) {
    if (obj.stock <= 0 || guest.money < def.stall.price) return -1;
    const pressure =
      def.stall.need === "hunger"
        ? needPressure(guest.hunger)
        : def.stall.need === "thirst"
          ? needPressure(guest.thirst)
          : guest.souvenir;
    if (pressure <= 0.02) return -1;
    return (2 + pressure * 8 + def.appeal) * proximity;
  }
  if (def.ride !== undefined) {
    if (obj.occupants >= def.ride.capacity) return -1;
    const thrill = def.appeal + (def.id === "ride_coaster" ? coasterThrill(tracks) : 0);
    return (1.5 + thrill * 0.9) * proximity;
  }
  return -1;
}

function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function chooseTarget(guest: GuestState, pos: readonly [number, number, number], tracks: number): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestScore = 0.01;
  for (const obj of session.placed.values()) {
    const dist = distance2(pos[0], pos[2], obj.x, obj.z);
    const score = targetScore(guest, obj, tracks, dist);
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  return best;
}

function spawnGuest(ctx: GameContext): void {
  const id = nextGuestId();
  const jitter = (Math.random() - 0.5) * 10;
  const start: [number, number, number] = [jitter, 0, ENTRANCE[2]];
  const guest: GuestState = {
    id,
    kind: GUEST_ID,
    happy: 62 - Math.max(0, session.ticketPrice - 16) * 1.1,
    money: 34 + Math.random() * 46,
    hunger: 12 + Math.random() * 22,
    thirst: 16 + Math.random() * 24,
    souvenir: Math.random() * 0.6,
    visits: 0,
    phase: "seeking",
    targetId: null,
    target: null,
    busy: 0,
    litterTimer: 4 + Math.random() * 6,
  };
  session.guests.set(id, guest);
  ctx.scene.entity.spawn(GUEST_ID, { id, position: start, role: "npc" });
  session.cash += session.ticketPrice;
  session.revenueToday += session.ticketPrice;
  session.guestsToday += 1;
}

export function seedGuests(ctx: GameContext, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = nextGuestId();
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    const guest: GuestState = {
      id,
      kind: GUEST_ID,
      happy: 60 + Math.random() * 15,
      money: 30 + Math.random() * 50,
      hunger: 20 + Math.random() * 40,
      thirst: 20 + Math.random() * 40,
      souvenir: Math.random() * 0.5,
      visits: 0,
      phase: "seeking",
      targetId: null,
      target: null,
      busy: 0,
      litterTimer: 3 + Math.random() * 6,
    };
    session.guests.set(id, guest);
    ctx.scene.entity.spawn(GUEST_ID, { id, position: [x, 0, z], role: "npc" });
  }
}

export function spawnGuests(ctx: GameContext, dt: number, totalAppeal: number): void {
  const cap = guestCap(session.rating);
  if (session.guests.size >= cap) return;
  const rate = demand(totalAppeal, session.ticketPrice, session.rating, session.open) * 2.4;
  session.spawnAcc += rate * dt;
  let budget = 4;
  while (session.spawnAcc >= 1 && session.guests.size < cap && budget > 0) {
    session.spawnAcc -= 1;
    budget -= 1;
    spawnGuest(ctx);
  }
}

function releaseOccupant(guest: GuestState): void {
  if (guest.targetId === null) return;
  const obj = session.placed.get(guest.targetId);
  if (obj !== undefined && obj.occupants > 0) obj.occupants -= 1;
}

function finishInteraction(guest: GuestState): void {
  const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
  if (obj !== undefined) {
    const def = buildableDef(obj.catalogId);
    if (def.stall !== undefined && obj.stock > 0 && guest.money >= def.stall.price) {
      guest.money -= def.stall.price;
      obj.stock -= 1;
      obj.soldTotal += 1;
      session.cash += def.stall.price;
      session.revenueToday += def.stall.price;
      if (def.stall.need === "hunger") guest.hunger = Math.max(0, guest.hunger - 70);
      else if (def.stall.need === "thirst") guest.thirst = Math.max(0, guest.thirst - 75);
      else guest.souvenir = 0;
      guest.happy = Math.min(100, guest.happy + 5);
    } else if (def.ride !== undefined) {
      guest.happy = Math.min(100, guest.happy + 6 + def.appeal * 0.8);
    } else if (def.stall !== undefined) {
      guest.happy = Math.max(0, guest.happy - 6);
    }
    guest.visits += 1;
  }
  releaseOccupant(guest);
  guest.targetId = null;
  guest.target = null;
  guest.phase = "seeking";
}

function shouldLeave(guest: GuestState): boolean {
  return (
    !session.open ||
    guest.money < MIN_SPEND ||
    guest.happy < 18 ||
    guest.visits >= MAX_VISITS
  );
}

function moveGuest(ctx: GameContext, guest: GuestState, target: readonly [number, number, number], dt: number): boolean {
  const next = ctx.scene.entity.moveToward(guest.id, target, {
    speed: GUEST_WALK_SPEED,
    dt,
    stopDistance: 0,
  });
  if (next === null) return false;
  ctx.scene.entity.setPose(guest.id, { position: next });
  return distance2(next[0], next[2], target[0], target[2]) <= ARRIVE_DISTANCE;
}

function despawnGuest(ctx: GameContext, guest: GuestState): void {
  releaseOccupant(guest);
  const weight = 0.06;
  session.happinessAvg = session.happinessAvg * (1 - weight) + guest.happy * weight;
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
}

export function tickGuests(ctx: GameContext, dt: number, tracks: number): void {
  for (const guest of session.guests.values()) {
    guest.hunger = Math.min(100, guest.hunger + HUNGER_RATE * dt);
    guest.thirst = Math.min(100, guest.thirst + THIRST_RATE * dt);
    guest.souvenir = Math.min(1, guest.souvenir + 0.02 * dt);
    guest.happy = Math.max(
      0,
      guest.happy - HAPPY_DRIFT * dt - session.litter * 0.004 * dt - needPressure(guest.hunger) * dt,
    );
    guest.litterTimer -= dt;
    if (guest.litterTimer <= 0) {
      guest.litterTimer = 5 + Math.random() * 6;
      session.litter = Math.min(100, session.litter + 0.5);
    }

    const ent = ctx.scene.entity.get(guest.id);
    const pos: readonly [number, number, number] = ent?.position ?? ENTRANCE;

    if (guest.phase === "busy") {
      guest.busy -= dt;
      if (guest.busy <= 0) finishInteraction(guest);
      continue;
    }

    if (guest.phase === "leaving") {
      void pos;
      if (moveGuest(ctx, guest, ENTRANCE, dt)) despawnGuest(ctx, guest);
      continue;
    }

    if (guest.targetId !== null && !session.placed.has(guest.targetId)) {
      guest.targetId = null;
      guest.target = null;
    }

    if (guest.targetId === null) {
      if (shouldLeave(guest)) {
        guest.phase = "leaving";
        continue;
      }
      const target = chooseTarget(guest, pos, tracks);
      if (target === null) {
        guest.phase = "leaving";
        continue;
      }
      guest.targetId = target.id;
      guest.target = [target.x, 0, target.z];
      target.occupants += 1;
    }

    if (guest.target !== null) {
      const arrived = moveGuest(ctx, guest, guest.target, dt);
      if (arrived) {
        const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
        const def = obj === undefined ? undefined : buildableDef(obj.catalogId);
        guest.phase = "busy";
        guest.busy = def?.ride?.rideSeconds ?? STALL_SERVICE;
      }
    }
  }
}
