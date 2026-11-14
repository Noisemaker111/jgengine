import { findEditorMarker } from "@jgengine/core/editor/index";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorLayers } from "../../editorLayers";
import { earn, spend } from "../cash";
import { secondsAtHour } from "../clock";
import { vehicleById } from "../entities/vehicles/catalog";
import { streetPlayOf } from "../streetPlay";
import { grantCred, PIZZA_CRED } from "../progression/cred";
import { nightRules, scoreNight } from "./nights";
import { dropFloor, DUSK_HOUR, FLOOR_HEIGHT, hoursUntilDusk, shiftOpen, waterEffect, type DropFloor } from "../tide/tide";
import { waterAt } from "../tide/tideRuntime";
import { customerById, LIGHTHOUSE_KEEPER, PIZZAS, pizzaById } from "./menu";
import { ageOrder, hottest, nextCaller, parSeconds, repStars, settleOrder, type Order, type TipLine } from "./orders";
import {
  buyUpgrade,
  callInterval,
  closeShift,
  freshPizzeria,
  kitchenOf,
  nextTier,
  ovenCapacity,
  payDebt,
  type PizzeriaState,
  type UpgradeKind,
} from "./pizzeria";

/**
 * A night at Vell's: calls land on the board while the shop is open, the rider loads them at the oven
 * window, every box cools and soaks on the way, and the customer pays by how it arrives. Rival riders
 * from Carmine's Crust shadow a stacked bag and snatch the hottest box; swap docks trade a scooter for
 * a jet-ski mid-run. At midnight the shift closes against MegaSlice's quota.
 */

function markerXZ(id: string): readonly [number, number] {
  const marker = findEditorMarker(editorLayers, id);
  if (marker === undefined) throw new Error(`harbor-heat scene is missing marker "${id}"`);
  return [marker.position.x, marker.position.z];
}

export const OVEN = markerXZ("pizzeria_oven");
/** How close the rider must be to the oven window, a doorstep and a dock. */
export const OVEN_RADIUS = 7;
export const DROP_RADIUS = 8;
export const DOCK_RADIUS = 9;
/** Slower than this to hand a box over (km/h); a hovering blimp counts. */
export const HANDOFF_SPEED = 10;
/** Most calls the board holds; the rest wait. */
export const BOARD_SIZE = 4;
/** Game seconds a call waits on the board before the customer gives up and calls a rival. */
export const CALL_PATIENCE = 150;
/** Who calls first in a new career: the Okafor twins' stall, a short walk from the oven. */
export const FIRST_CALLER = "okafor_twins";
/** Each great drop in a row adds this share to the tips, up to the cap. */
export const STREAK_STEP = 0.06;
export const STREAK_CAP = 5;
/** Share of a special's price paid again on every box of it. */
export const SPECIAL_BONUS = 0.25;

export interface SwapDock {
  id: string;
  label: string;
  position: readonly [number, number];
}

export const SWAP_DOCKS: readonly SwapDock[] = editorLayers.markers
  .filter((marker) => marker.kind === "swap_dock")
  .map((marker) => ({ id: marker.id, label: marker.label ?? marker.id, position: [marker.position.x, marker.position.z] as const }));

/** Where a customer takes the box. */
export function customerSpot(customerId: string): readonly [number, number] | null {
  const customer = customerById(customerId);
  return customer === undefined ? null : markerXZ(customer.marker);
}

export interface Call {
  id: string;
  customerId: string;
  pizzas: readonly string[];
  calledAt: number;
}

export interface DeliveryReceipt {
  customerId: string;
  lines: TipLine[];
  total: number;
  thanks: string;
  floor: DropFloor;
  /** Game time it landed, so the HUD shows the slip for a few seconds. */
  at?: number;
}

export interface ShiftSummary {
  day: number;
  delivered: number;
  takings: number;
  best: number;
  lost: number;
  quota: number;
  metQuota: boolean;
  foreclosed: boolean;
  headline: string;
}

export interface ShiftState {
  /** Calls waiting at the oven window. */
  board: Call[];
  /** Boxes riding in the bag. */
  bag: Order[];
  serial: number;
  /** Seconds until the next call lands. */
  nextCallIn: number;
  /** Ida calls first whenever she is free; she becomes due again after each of her deliveries. */
  idaDue: boolean;
  /** The shift's running tally. */
  takings: number;
  delivered: number;
  best: number;
  lost: number;
  /** The day number of the shift now open, or null between shifts. */
  openDay: number | null;
  lastReceipt: DeliveryReceipt | null;
  summary: ShiftSummary | null;
  /** Seconds until a Carmine's Crust rider comes for a stacked bag. */
  rivalIn: number;
  /** How long the rival has been close enough to grab. */
  rivalGrip: number;
  /** Great deliveries in a row this shift: each adds to the tips until a bad one breaks it. */
  streak?: number;
  /** Tonight's special: every box of it pays a bonus on top of the tip. */
  special?: string;
}

export function freshShift(): ShiftState {
  return { board: [], bag: [], serial: 0, nextCallIn: 4, idaDue: true, takings: 0, delivered: 0, best: 0, lost: 0, openDay: null, lastReceipt: null, summary: null, rivalIn: 45, rivalGrip: 0 };
}

export const shiftStore = defineStore<ShiftState>("harbor.shift", freshShift);
export const pizzeriaStore = defineStore<PizzeriaState>("harbor.pizzeria", freshPizzeria);
/** Whether the pizzeria's books are open on screen: a menu. */
export const pizzeriaBoardStore = defineStore<boolean>("harbor.pizzeriaBoard", false);

export const RIVAL_ID = "crust_rider";
const RIVAL_SPEED = 15;
const RIVAL_REACH = 3.4;
const RIVAL_GRAB_SECONDS = 1.3;
const RIVAL_GIVE_UP = 70;
/** The family's starter scooter, parked at the shop. */
export const SHOP_SCOOTER = "shop_scooter";

/** A seeded roll so the night's callers replay the same from the same save. */
function roll(serial: number): number {
  const x = Math.sin(serial * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

function hourOf(ctx: GameContext): number {
  const calendar = ctx.time.calendar();
  return calendar.hour + calendar.minute / 60;
}

function dayOf(ctx: GameContext): number {
  return ctx.time.calendar().day;
}

function riderPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

function distanceTo(ctx: GameContext, target: readonly [number, number]): number {
  const at = riderPosition(ctx);
  return at === null ? Number.POSITIVE_INFINITY : Math.hypot(at[0] - target[0], at[2] - target[1]);
}

/** The rep stars the shop has earned. */
export function shopRep(ctx: GameContext): number {
  return repStars(pizzeriaStore.read(ctx).goodDeliveries);
}

/** The floor a customer leans out of tonight, read off the water at their door. */
export function floorAt(ctx: GameContext, spot: readonly [number, number]): DropFloor {
  const water = waterAt(ctx, spot[0], spot[1]);
  return water === null || water.openSea ? "door" : dropFloor(water.depth);
}

/** Put a call on the board when the oven's interval comes round. */
function tickCalls(ctx: GameContext, input: ShiftState, dt: number): ShiftState {
  let state = input;
  // A call left too long on the board walks to a rival pizzeria.
  const now = ctx.time.now();
  const stale = state.board.filter((call) => now - call.calledAt > CALL_PATIENCE);
  if (stale.length > 0) {
    for (const call of stale) ctx.game.notices.push({ text: `${customerById(call.customerId)?.name ?? "A customer"} gave up waiting and called Carmine's Crust.`, tone: "warn" });
    state = { ...state, board: state.board.filter((call) => !stale.includes(call)), lost: state.lost + stale.reduce((sum, call) => sum + call.pizzas.length, 0) };
  }
  if (state.board.length >= BOARD_SIZE) return state;
  const nextCallIn = state.nextCallIn - dt;
  if (nextCallIn > 0) return { ...state, nextCallIn };
  const busy = new Set([...state.board.map((call) => call.customerId), ...state.bag.map((order) => order.customerId)]);
  // A new rider's very first call is the night market across the boardwalk: a short walk that teaches the loop.
  const firstEver = pizzeriaStore.read(ctx).deliveries === 0 && state.serial === 0 && !busy.has(FIRST_CALLER);
  const caller = firstEver ? (customerById(FIRST_CALLER) ?? null) : nextCaller({ rep: shopRep(ctx), hour: hourOf(ctx), busy, roll: roll(state.serial + 1), idaDue: state.idaDue });
  const interval = callInterval(pizzeriaStore.read(ctx)) * (nightRules(ctx)?.callScale ?? 1);
  if (caller === null) return { ...state, nextCallIn: interval / 2 };
  const serial = state.serial + 1;
  const call: Call = { id: `c${serial}`, customerId: caller.id, pizzas: caller.pizzas, calledAt: ctx.time.now() };
  ctx.game.notices.push({ text: `New order · ${caller.name}: "${caller.call}"`, tone: "info" });
  ctx.game.audio.play("oven_bell");
  return { ...state, serial, board: [...state.board, call], nextCallIn: interval, idaDue: caller.id === LIGHTHOUSE_KEEPER ? false : state.idaDue };
}

const splashClock = perContext(() => ({ t: 0, n: 0 }));

/** Spray off the wheels or the hull while the boxes are soaking, so the soak meter has a cause on screen. */
function splash(ctx: GameContext, soak: number, dt: number): void {
  const clock = splashClock(ctx);
  clock.t -= dt;
  if (soak <= 0 || clock.t > 0) return;
  clock.t = 0.18;
  const from = riderPosition(ctx);
  if (from === null) return;
  ctx.scene.entity.vfx({ kind: "spark", color: 0x9fe8ff, from: [from[0], from[1] + 0.2, from[2]], radius: Math.min(2.2, 0.8 + soak * 0.15) });
  clock.n += 1;
  if (clock.n % 3 === 0) ctx.game.audio.play("water_splash", from);
}

/** Every box cools; water, spray and wading soak it; the blimp's altitude chills it. */
function tickBag(ctx: GameContext, state: ShiftState, dt: number): ShiftState {
  if (state.bag.length === 0) return state;
  const kitchen = kitchenOf(pizzeriaStore.read(ctx));
  const street = streetPlayOf(ctx);
  const telemetry = street.telemetry();
  let soak = telemetry.soak;
  let altitude = false;
  if (street.drivingVehicleId() === null) {
    const at = riderPosition(ctx);
    const water = at === null ? null : waterAt(ctx, at[0], at[2]);
    soak = waterEffect("foot", water?.depth ?? 0, 0, water?.openSea === true).soakPerSecond;
  } else if (telemetry.mode === "aircraft") {
    altitude = telemetry.altitude > 15;
    soak = 0;
  }
  splash(ctx, soak, dt);
  return { ...state, bag: state.bag.map((order) => ageOrder(order, dt, { kitchen, soakPerSecond: soak, altitude })) };
}

/** A stacked bag draws a Carmine's Crust rider who shadows it and grabs the hottest box. */
function tickRival(ctx: GameContext, state: ShiftState, dt: number): ShiftState {
  const rival = ctx.scene.entity.get(RIVAL_ID);
  const at = riderPosition(ctx);
  if (at === null) return state;
  if (rival === null) {
    if (state.bag.length < 2) return { ...state, rivalIn: Math.max(state.rivalIn, 30) };
    const rivalIn = state.rivalIn - dt;
    if (rivalIn > 0) return { ...state, rivalIn };
    // They come from behind, out of a side street.
    const facing = ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.rotationY ?? 0;
    const x = at[0] - Math.sin(facing) * 34;
    const z = at[2] - Math.cos(facing) * 34;
    ctx.scene.entity.spawn("car_rival", { id: RIVAL_ID, position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: facing, role: "npc" });
    ctx.game.notices.push({ text: "A Carmine's Crust rider is on your tail. Lose them or they'll grab the hottest box!", tone: "warn" });
    return { ...state, rivalIn: 0, rivalGrip: 0 };
  }
  const distance = Math.hypot(rival.position[0] - at[0], rival.position[2] - at[2]);
  const leave = (next: ShiftState, text: string, tone: "success" | "warn") => {
    ctx.scene.entity.despawn(RIVAL_ID);
    ctx.game.notices.push({ text, tone });
    return { ...next, rivalIn: (50 + roll(next.serial + 7) * 40) * (nightRules(ctx)?.rivalScale ?? 1), rivalGrip: 0 };
  };
  if (state.bag.length === 0) return leave(state, "The Crust rider peels off. Nothing left to steal.", "success");
  if (distance > RIVAL_GIVE_UP) {
    const shop = pizzeriaStore.read(ctx);
    pizzeriaStore.write(ctx, { ...shop, shaken: (shop.shaken ?? 0) + 1 });
    return leave(state, "You lost the Carmine's Crust rider.", "success");
  }
  // Their scooter drowns in a canal just like yours.
  const water = waterAt(ctx, rival.position[0], rival.position[2]);
  const speed = water !== null && water.depth >= 0.45 && !water.openSea ? 3 : RIVAL_SPEED;
  // The rider steers straight at you, kinematically: a vehicle body has no walk speed of its own.
  if (distance > 1.6) {
    const step = Math.min(distance - 1.6, speed * dt);
    const dx = (at[0] - rival.position[0]) / distance;
    const dz = (at[2] - rival.position[2]) / distance;
    const x = rival.position[0] + dx * step;
    const z = rival.position[2] + dz * step;
    const surface = waterAt(ctx, x, z);
    const y = surface !== null && !surface.openSea ? Math.max(ctx.world.groundHeightAt(x, z), surface.surface - 0.5) : ctx.world.groundHeightAt(x, z);
    ctx.scene.entity.setPose(RIVAL_ID, { position: [x, y, z], rotationY: Math.atan2(dx, dz), dt });
  }
  if (distance > RIVAL_REACH) return { ...state, rivalGrip: Math.max(0, state.rivalGrip - dt) };
  const rivalGrip = state.rivalGrip + dt;
  if (rivalGrip < RIVAL_GRAB_SECONDS) return { ...state, rivalGrip };
  const stolen = hottest(state.bag);
  if (stolen === undefined) return state;
  const who = customerById(stolen.customerId)?.name ?? "a customer";
  const next = { ...state, bag: state.bag.filter((order) => order.id !== stolen.id), lost: state.lost + 1 };
  ctx.game.audio.play("box_snatch", at);
  return leave(next, `Carmine's Crust snatched ${who}'s box and sold it as their own!`, "warn");
}

/** Midnight: the night's tally against MegaSlice's quota; boxes still out went cold. */
function closeTheShift(ctx: GameContext, state: ShiftState): ShiftState {
  const close = closeShift(pizzeriaStore.read(ctx), state.takings);
  pizzeriaStore.write(ctx, close.state);
  ctx.scene.entity.despawn(RIVAL_ID);
  clearBeacons(ctx);
  const lost = state.lost + state.bag.length;
  const summary: ShiftSummary = {
    day: state.openDay ?? dayOf(ctx),
    delivered: state.delivered,
    takings: state.takings,
    best: state.best,
    lost,
    quota: close.quota,
    metQuota: close.metQuota,
    foreclosed: close.foreclosed,
    headline: close.headline,
  };
  ctx.game.notices.push({ text: `Last orders! ${close.headline}`, tone: close.metQuota ? "success" : "warn" });
  void ctx.game.save?.checkpoint();
  return { ...freshShift(), serial: state.serial, summary };
}

/** First-time lessons, each said once per career: what the water just did and what to do about it. */
const HINTS: Record<string, string> = {
  drowned: "Your engine drowned: wheels can't run a canal. Ride for a pink swap dock on the chart and take the jet-ski.",
  beached: "A hull on dry stone barely moves. Get back to the water, or swap to the scooter at a dock.",
  stack: "Two boxes in the bag: a stack bonus on every tip, and Carmine's Crust riders will come for the hottest one.",
  rooftop: "The water's up, so customers lean out of balconies and rooftops now. They tip extra for the climb.",
  cold: "A box is below its customer's cold limit: they'll pay the menu price and not a cent of tip.",
};

function teach(ctx: GameContext, id: keyof typeof HINTS): void {
  const shop = pizzeriaStore.read(ctx);
  const seen = shop.hints ?? [];
  if (seen.includes(id)) return;
  pizzeriaStore.write(ctx, { ...shop, hints: [...seen, id] });
  ctx.game.notices.push({ text: HINTS[id]!, tone: "info" });
}

function tickLessons(ctx: GameContext, state: ShiftState): void {
  const water = streetPlayOf(ctx).telemetry().water;
  if (water === "ENGINE DROWNED") teach(ctx, "drowned");
  if (water === "BEACHED" || water === "AGROUND") teach(ctx, "beached");
  if (state.bag.length >= 2) teach(ctx, "stack");
  if (state.bag.some((order) => order.heat < (customerById(order.customerId)?.coldLimit ?? 25))) teach(ctx, "cold");
  for (const order of state.bag) {
    const spot = customerSpot(order.customerId);
    if (spot !== null && floorAt(ctx, spot) !== "door") { teach(ctx, "rooftop"); break; }
  }
}

/** Run the night: open at dusk, take calls, age the bag, send the rival, close at midnight. */
export function tickShift(ctx: GameContext, dt: number): void {
  let state = shiftStore.read(ctx);
  const open = shiftOpen(hourOf(ctx));
  if (open && state.openDay === null) {
    const special = PIZZAS[Math.floor(roll(dayOf(ctx) * 7 + 3) * PIZZAS.length)]?.id;
    state = { ...state, openDay: dayOf(ctx), summary: null, takings: 0, delivered: 0, best: 0, lost: 0, nextCallIn: 3, idaDue: true, streak: 0, ...(special === undefined ? {} : { special }) };
    ctx.game.notices.push({ text: `Vell's is open! Tonight's special: ${pizzaById(special ?? "")?.label ?? "the house pie"}. The tide is coming in.`, tone: "success" });
  } else if (!open && state.openDay !== null) {
    shiftStore.write(ctx, closeTheShift(ctx, state));
    return;
  }
  if (open) state = tickCalls(ctx, state, dt);
  state = tickBag(ctx, state, dt);
  state = tickRival(ctx, state, dt);
  shiftStore.write(ctx, state);
  tickLessons(ctx, state);
  syncBeacons(ctx, state);
}

// --- Beacons over the doors in the bag -------------------------------------------------------

const beaconRuntime = perContext(() => ({ placed: new Map<string, number>() }));
const beaconId = (customerId: string) => `order_beacon_${customerId}`;

function clearBeacons(ctx: GameContext): void {
  const runtime = beaconRuntime(ctx);
  for (const customerId of runtime.placed.keys()) ctx.scene.object.remove(beaconId(customerId));
  runtime.placed.clear();
}

/** One beacon per door in the bag, lifted to the floor the customer leans out of. */
function syncBeacons(ctx: GameContext, state: ShiftState): void {
  const runtime = beaconRuntime(ctx);
  const wanted = new Set(state.bag.map((order) => order.customerId));
  for (const customerId of [...runtime.placed.keys()]) {
    if (wanted.has(customerId)) continue;
    ctx.scene.object.remove(beaconId(customerId));
    runtime.placed.delete(customerId);
  }
  for (const customerId of wanted) {
    const spot = customerSpot(customerId);
    if (spot === null) continue;
    const water = waterAt(ctx, spot[0], spot[1]);
    const base = water?.surface ?? ctx.world.groundHeightAt(spot[0], spot[1]);
    const y = base + FLOOR_HEIGHT[floorAt(ctx, spot)];
    const id = beaconId(customerId);
    if (ctx.scene.object.get(id) === null) {
      ctx.scene.object.place("obj_order_beacon", spot[0], y, spot[1], { instanceId: id, onExisting: "replace" });
      ctx.scene.object.setColliders(id, {});
      runtime.placed.set(customerId, y);
    } else if (Math.abs((runtime.placed.get(customerId) ?? -99) - y) > 0.05) {
      ctx.scene.object.move(id, spot[0], y, spot[1]);
      runtime.placed.set(customerId, y);
    }
  }
}

// --- Commands ----------------------------------------------------------------------------------

function nearOven(ctx: GameContext): boolean {
  return distanceTo(ctx, OVEN) < OVEN_RADIUS;
}

/** The customer in the bag whose door the rider is at, if any. */
function customerHere(ctx: GameContext, state: ShiftState): string | null {
  for (const order of state.bag) {
    const spot = customerSpot(order.customerId);
    if (spot !== null && distanceTo(ctx, spot) < DROP_RADIUS) return order.customerId;
  }
  return null;
}

function dockHere(ctx: GameContext): SwapDock | null {
  return SWAP_DOCKS.find((dock) => distanceTo(ctx, dock.position) < DOCK_RADIUS) ?? null;
}

function takeRefusal(ctx: GameContext) {
  const state = shiftStore.read(ctx);
  if (!shiftOpen(hourOf(ctx))) return { reason: "closed", message: "Vell's opens at 18:00. Rest till dusk at the oven window." };
  if (!nearOven(ctx)) return { reason: "not-at-oven", message: "Orders are loaded at Vell's oven window." };
  if (state.board.length === 0) return { reason: "no-orders", message: "No orders on the board yet. The phone will ring." };
  const room = ovenCapacity(pizzeriaStore.read(ctx)) - state.bag.length;
  if (room <= 0) return { reason: "bag-full", message: "The bag is full. Buy another oven to stack more." };
  return null;
}

function takeOrders(ctx: GameContext): void {
  const state = shiftStore.read(ctx);
  const shop = pizzeriaStore.read(ctx);
  const kitchen = kitchenOf(shop);
  const call = state.board[0]!;
  const room = ovenCapacity(shop) - state.bag.length;
  const spot = customerSpot(call.customerId) ?? OVEN;
  const par = parSeconds(Math.hypot(spot[0] - OVEN[0], spot[1] - OVEN[1]));
  let serial = state.serial;
  const taken = call.pizzas.slice(0, room).map((pizzaId): Order => {
    serial += 1;
    return { id: `o${serial}`, customerId: call.customerId, pizzaId, heat: kitchen.ovenHeat, soak: 0, age: 0, par };
  });
  const left = call.pizzas.slice(room);
  const board = left.length === 0 ? state.board.slice(1) : [{ ...call, pizzas: left }, ...state.board.slice(1)];
  const customer = customerById(call.customerId);
  shiftStore.write(ctx, { ...state, serial, board, bag: [...state.bag, ...taken], lastReceipt: null });
  ctx.game.feedback.cue("pickup", `${taken.length} hot ${taken.length === 1 ? "box" : "boxes"} for ${customer?.name ?? "a customer"}${left.length > 0 ? ` (${left.length} still in the oven)` : ""}.`);
}

function deliverRefusal(ctx: GameContext) {
  const state = shiftStore.read(ctx);
  if (state.bag.length === 0) return { reason: "empty-bag", message: "Nothing in the bag." };
  if (customerHere(ctx, state) === null) return { reason: "not-here", message: "Take the box to the customer's door." };
  const here = customerHere(ctx, state)!;
  if (customerById(here)?.waterOnly === true) {
    const driving = streetPlayOf(ctx).drivingVehicleId();
    const medium = driving === null ? null : vehicleById(ctx.scene.entity.get(driving)?.name ?? "")?.medium;
    if (medium !== "water" && medium !== "air") return { reason: "water-only", message: "The conning tower is out in the bay. Come alongside by jet-ski, gondola or blimp." };
  }
  if (streetPlayOf(ctx).carSpeedKmh() > HANDOFF_SPEED) return { reason: "moving", message: "Slow down to hand it over." };
  return null;
}

function deliverHere(ctx: GameContext): void {
  const state = shiftStore.read(ctx);
  const customerId = customerHere(ctx, state)!;
  const customer = customerById(customerId);
  const spot = customerSpot(customerId)!;
  const floor = floorAt(ctx, spot);
  const kitchen = kitchenOf(pizzeriaStore.read(ctx));
  const stack = state.bag.length;
  const handed = state.bag.filter((order) => order.customerId === customerId);
  const lines: TipLine[] = [];
  let total = 0;
  let price = 0;
  let good = 0;
  let worst: "great" | "fine" | "bad" = "great";
  for (const order of handed) {
    const settled = settleOrder(order, { kitchen, floor, stack });
    lines.push(...settled.lines);
    total += settled.total;
    price += settled.price;
    if (settled.verdict !== "bad") good += 1;
    if (settled.verdict === "bad" || (settled.verdict === "fine" && worst === "great")) worst = settled.verdict;
  }
  // Tonight's special pays a quarter of its price again on every box of it.
  const specials = handed.filter((order) => order.pizzaId === state.special);
  if (specials.length > 0) {
    const bonus = specials.reduce((sum, order) => sum + Math.round((pizzaById(order.pizzaId)?.price ?? 0) * SPECIAL_BONUS), 0);
    lines.push({ label: "Tonight's special", amount: bonus });
    total += bonus;
  }
  // A set-piece night's crowd tips on top.
  const rules = nightRules(ctx);
  if (rules !== null && rules.tipScale > 1) {
    const extra = Math.round((total - price) * (rules.tipScale - 1));
    if (extra > 0) {
      lines.push({ label: rules.tipLine, amount: extra });
      total += extra;
    }
  }
  // A hot streak of great drops lifts the tips; a bad one ends it.
  const streak = state.streak ?? 0;
  const lift = Math.round((total - price) * STREAK_STEP * Math.min(STREAK_CAP, streak));
  if (lift > 0) {
    lines.push({ label: `Hot streak ×${Math.min(STREAK_CAP, streak)}`, amount: lift });
    total += lift;
  }
  const nextStreak = worst === "great" ? streak + 1 : worst === "bad" ? 0 : streak;
  if (price > 0) earn(ctx, price, "pizza-sale", customerId);
  grantCred(ctx, good * PIZZA_CRED.happy + (handed.length - good) * PIZZA_CRED.plain);
  if (total - price > 0) earn(ctx, total - price, "pizza-tip", customerId);
  const shop = pizzeriaStore.read(ctx);
  const driving = streetPlayOf(ctx).drivingVehicleId();
  const hull = driving !== null && vehicleById(ctx.scene.entity.get(driving)?.name ?? "")?.medium === "water";
  pizzeriaStore.write(ctx, {
    ...shop,
    deliveries: shop.deliveries + handed.length,
    goodDeliveries: shop.goodDeliveries + good,
    hullDrops: (shop.hullDrops ?? 0) + (hull ? handed.length : 0),
    stackDrops: (shop.stackDrops ?? 0) + (stack >= 2 ? handed.length : 0),
    upstairsDrops: (shop.upstairsDrops ?? 0) + (floor === "door" ? 0 : 1),
  });
  scoreNight(ctx, handed.length);
  const thanks = customer?.thanks[worst] ?? "Thanks.";
  shiftStore.write(ctx, {
    ...state,
    bag: state.bag.filter((order) => order.customerId !== customerId),
    takings: state.takings + total,
    delivered: state.delivered + handed.length,
    best: Math.max(state.best, total),
    idaDue: customerId === LIGHTHOUSE_KEEPER ? true : state.idaDue,
    lastReceipt: { customerId, lines, total, thanks, floor, at: ctx.time.now() },
    streak: nextStreak,
  });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+$${total}`, kind: "loot" });
  ctx.game.audio.play("till_ring");
  // The customer's line floats up from their door, the box burst in the shop's colours.
  const top = (waterAt(ctx, spot[0], spot[1])?.surface ?? ctx.world.groundHeightAt(spot[0], spot[1])) + FLOOR_HEIGHT[floor] + 2.6;
  ctx.scene.entity.floatText({ position: [spot[0], top, spot[1]], text: `"${thanks}"`, kind: worst === "bad" ? "warn" : "info", scale: 0.8 });
  ctx.scene.entity.vfx({ kind: "spark", color: worst === "great" ? 0xffcf4a : worst === "fine" ? 0xfff1d6 : 0x7fb6d9, from: [spot[0], top - 2, spot[1]], radius: worst === "great" ? 2.4 : 1.4 });
  ctx.game.feedback.cue("objective", `${customer?.name ?? "Customer"}: "${thanks}" +$${total}`);
  void ctx.game.save?.checkpoint();
}

/** The fleet a dock keeps: a scooter for the street and a jet-ski for the canal. */
function dockVehicle(ctx: GameContext, dock: SwapDock, kind: "car_compact" | "car_sport"): string {
  const id = `${dock.id}_${kind === "car_sport" ? "boat" : "scooter"}`;
  const [x, z] = dock.position;
  const offset = kind === "car_sport" ? 3 : -3;
  if (ctx.scene.entity.get(id) === null) {
    const water = waterAt(ctx, x + offset, z);
    const y = kind === "car_sport" && water !== null ? water.surface : ctx.world.groundHeightAt(x + offset, z);
    ctx.scene.entity.spawn(kind, { id, position: [x + offset, y, z], rotationY: 0, role: "prop", meta: { owned: true } });
  }
  return id;
}

function swapRefusal(ctx: GameContext) {
  if (dockHere(ctx) === null) return { reason: "no-dock", message: "Swaps happen at a swap dock." };
  const driving = streetPlayOf(ctx).drivingVehicleId();
  const def = driving === null ? undefined : vehicleById(ctx.scene.entity.get(driving)?.name ?? "");
  if (def?.medium === "air") return { reason: "aircraft", message: "Land the blimp first." };
  if (streetPlayOf(ctx).carSpeedKmh() > 25) return { reason: "moving", message: "Ease off to swap at the dock." };
  return null;
}

/** Jump from wheels to a hull or back at a swap dock, the bag coming with you. */
function swapAtDock(ctx: GameContext): void {
  const dock = dockHere(ctx)!;
  const street = streetPlayOf(ctx);
  const driving = street.drivingVehicleId();
  const current = driving === null ? undefined : vehicleById(ctx.scene.entity.get(driving)?.name ?? "");
  let want: "car_compact" | "car_sport";
  if (current?.medium === "water") want = "car_compact";
  else if (current?.medium === "road") want = "car_sport";
  else {
    const water = waterAt(ctx, dock.position[0], dock.position[1]);
    want = water !== null && water.depth >= 0.45 ? "car_sport" : "car_compact";
  }
  const target = dockVehicle(ctx, dock, want);
  const shop = pizzeriaStore.read(ctx);
  pizzeriaStore.write(ctx, { ...shop, swaps: (shop.swaps ?? 0) + 1 });
  if (driving !== null) street.exitVehicle(ctx, true);
  street.enterVehicle(ctx, target);
  ctx.game.feedback.cue("pickup", want === "car_sport" ? "Swapped to the jet-ski. Hold on to the boxes!" : "Back on the scooter.");
}

function sleepRefusal(ctx: GameContext) {
  if (shiftOpen(hourOf(ctx))) return { reason: "open", message: "The shift is on. Orders first, sleep later." };
  // From the midnight card the rider rides home first; otherwise it is the bed upstairs from the oven.
  if (shiftStore.read(ctx).summary === null && !nearOven(ctx)) return { reason: "not-at-oven", message: "Rest at Vell's, upstairs from the oven." };
  return null;
}

/** Nap upstairs until the doors open: the clock jumps to six and the first order is minutes away. */
export function sleepTillDusk(ctx: GameContext): void {
  if (!nearOven(ctx)) {
    streetPlayOf(ctx).exitVehicle(ctx, true);
    const x = OVEN[0] + 2;
    ctx.scene.entity.setPose(ctx.player.userId, { position: [x, ctx.world.groundHeightAt(x, OVEN[1]), OVEN[1]] });
  }
  const hours = hoursUntilDusk(hourOf(ctx));
  const clock = ctx.time.snapshot();
  ctx.time.hydrate({ ...clock, now: clock.now + secondsAtHour(hours) });
  const state = shiftStore.read(ctx);
  shiftStore.write(ctx, { ...state, summary: null });
  ctx.game.notices.push({ text: `You sleep upstairs until ${DUSK_HOUR}:00. The ovens are hot.`, tone: "info" });
}

export function registerShift(ctx: GameContext): void {
  ctx.game.commands.define("pizza.take", { validate: takeRefusal, apply: takeOrders });
  ctx.game.commands.define("pizza.deliver", { validate: deliverRefusal, apply: deliverHere });
  ctx.game.commands.define("pizza.swap", { validate: swapRefusal, apply: swapAtDock });
  ctx.game.commands.define("shift.sleep", { validate: sleepRefusal, apply: sleepTillDusk });
  ctx.game.commands.define("shift.dismiss", { apply(state) { shiftStore.write(state, { ...shiftStore.read(state), summary: null }); } });
  ctx.game.commands.define("pizzeria.open", {
    validate: (state) => (nearOven(state) ? null : { reason: "not-at-oven", message: "The books are kept at the oven window." }),
    apply(state) { pizzeriaBoardStore.write(state, true); },
  });
  ctx.game.commands.define("pizzeria.close", { apply(state) { pizzeriaBoardStore.write(state, false); } });
  ctx.game.commands.define<{ kind?: string }>("pizzeria.upgrade", {
    validate(state, input) {
      const kind = input?.kind as UpgradeKind | undefined;
      if (kind !== "oven" && kind !== "toppings" && kind !== "bag") return { reason: "unknown", message: "No such upgrade." };
      const next = nextTier(pizzeriaStore.read(state), kind);
      if (next === null) return { reason: "maxed", message: "That's the best there is." };
      if (state.game.economy.balance(state.player.userId, "cash") < next.cost) return { reason: "no-cash", message: `Needs $${next.cost.toLocaleString("en-US")}.` };
      return null;
    },
    apply(state, input) {
      const kind = input!.kind as UpgradeKind;
      const next = nextTier(pizzeriaStore.read(state), kind)!;
      if (!spend(state, next.cost, "pizzeria-upgrade", kind)) return;
      pizzeriaStore.write(state, buyUpgrade(pizzeriaStore.read(state), kind));
      state.game.notices.push({ text: `${next.label} installed.`, tone: "success" });
      void state.game.save?.checkpoint();
    },
  });
  ctx.game.commands.define<{ amount?: number }>("pizzeria.pay", {
    validate(state, input) {
      const shop = pizzeriaStore.read(state);
      if (shop.debt <= 0) return { reason: "paid", message: "The note is paid. The shop is yours." };
      const amount = Math.min(shop.debt, Math.floor(input?.amount ?? 500));
      if (amount <= 0) return { reason: "nothing", message: "Pay something toward the note." };
      if (state.game.economy.balance(state.player.userId, "cash") < amount) return { reason: "no-cash", message: `Needs $${amount.toLocaleString("en-US")}.` };
      return null;
    },
    apply(state, input) {
      const shop = pizzeriaStore.read(state);
      const amount = Math.min(shop.debt, Math.floor(input?.amount ?? 500));
      if (!spend(state, amount, "pizzeria-debt")) return;
      const next = payDebt(shop, amount);
      pizzeriaStore.write(state, next);
      state.game.notices.push({
        text: next.saved && !shop.saved ? "THE NOTE IS PAID. Vell's belongs to the family again. MegaSlice can go soak." : `$${amount.toLocaleString("en-US")} off the note. $${next.debt.toLocaleString("en-US")} to go.`,
        tone: "success",
      });
      void state.game.save?.checkpoint();
    },
  });
}

/** The shop's starter scooter waits at the kerb by the oven on a new game. */
export function setupShift(ctx: GameContext): void {
  if (ctx.scene.entity.get(SHOP_SCOOTER) !== null) return;
  const x = OVEN[0] + 4;
  const z = OVEN[1] - 10;
  ctx.scene.entity.spawn("car_compact", { id: SHOP_SCOOTER, position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: Math.PI, role: "prop", meta: { owned: true } });
}

/** The shift's prompts: the oven window, each door in the bag, and the swap docks while riding. */
export function shiftPrompts(ctx: GameContext): PositionedPrompt[] {
  const state = shiftStore.read(ctx);
  const prompts: PositionedPrompt[] = [];
  const open = shiftOpen(hourOf(ctx));
  const room = ovenCapacity(pizzeriaStore.read(ctx)) - state.bag.length;
  const oven = !open ? "shift.sleep" : state.board.length > 0 && room > 0 ? "pizza.take" : "pizzeria.open";
  prompts.push({ id: `shift:${oven}`, priority: 4, position: { x: OVEN[0], z: OVEN[1] }, prompt: {
    radius: OVEN_RADIUS,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: oven, input: undefined },
  } });
  for (const customerId of new Set(state.bag.map((order) => order.customerId))) {
    const spot = customerSpot(customerId);
    if (spot === null) continue;
    prompts.push({ id: `shift:deliver:${customerId}`, priority: 5, position: { x: spot[0], z: spot[1] }, prompt: {
      radius: DROP_RADIUS,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "pizza.deliver", input: undefined },
    } });
  }
  if (streetPlayOf(ctx).drivingVehicleId() !== null) {
    for (const dock of SWAP_DOCKS) {
      prompts.push({ id: `shift:swap:${dock.id}`, priority: 3, position: { x: dock.position[0], z: dock.position[1] }, prompt: {
        radius: DOCK_RADIUS,
        display: { kind: "keybind", actionId: "interact" },
        invoke: { name: "pizza.swap", input: undefined },
      } });
    }
  }
  return prompts;
}

/** The pager's line for the shift, or null when there is nothing pizza to do. */
export interface ShiftGoal {
  title: string;
  eyebrow: string;
  target: readonly [number, number];
  hint: string;
}

export function shiftGoal(ctx: GameContext): ShiftGoal | null {
  const state = shiftStore.read(ctx);
  if (state.bag.length > 0) {
    // Lead with the box that is cooling fastest toward its customer's cold limit.
    const order = [...state.bag].sort((a, b) => (a.heat - (customerById(a.customerId)?.coldLimit ?? 25)) - (b.heat - (customerById(b.customerId)?.coldLimit ?? 25)))[0]!;
    const customer = customerById(order.customerId);
    const spot = customerSpot(order.customerId) ?? OVEN;
    const floor = floorAt(ctx, spot);
    const where = floor === "door" ? "the door" : floor === "balcony" ? "the balcony" : "the rooftop";
    return {
      eyebrow: `${state.bag.length} in the bag · ${Math.round(order.heat)}° hot · ${Math.round(order.soak)}% soggy`,
      title: `${customer?.name ?? "Customer"} · ${where}`,
      target: spot,
      hint: customer?.waterOnly === true ? "Out in the bay: only a jet-ski or the blimp gets there." : "Stop at the beacon and press E. Splashing soaks the boxes.",
    };
  }
  if (!shiftOpen(hourOf(ctx))) {
    return { eyebrow: "Vell's is closed", title: "Rest at the oven window till dusk", target: OVEN, hint: "The shop opens at 18:00 and the tide comes in with it." };
  }
  if (state.board.length > 0) {
    const call = state.board[0]!;
    const wait = Math.max(0, Math.ceil(CALL_PATIENCE - (ctx.time.now() - call.calledAt)));
    return { eyebrow: `${state.board.length} on the board · hangs up in ${wait}s`, title: `Load ${customerById(call.customerId)?.name ?? "the next order"}`, target: OVEN, hint: "Ride back to the oven window and press E. Stack more if the oven allows." };
  }
  return null;
}

/** What the action button says for a shift prompt, or null when the prompt is not the shift's. */
export function shiftPromptLabel(ctx: GameContext, id: string): string | null {
  if (!id.startsWith("shift:")) return null;
  const state = shiftStore.read(ctx);
  if (id === "shift:pizza.take") {
    const call = state.board[0];
    const name = call === undefined ? "the next order" : (customerById(call.customerId)?.name ?? "the next order");
    return `Load ${name} · ${state.bag.length}/${ovenCapacity(pizzeriaStore.read(ctx))} in the bag`;
  }
  if (id === "shift:pizzeria.open") return "Open the shop's books";
  if (id === "shift:shift.sleep") return "Sleep upstairs till dusk";
  if (id.startsWith("shift:deliver:")) return `Hand over to ${customerById(id.slice(14))?.name ?? "the customer"}`;
  if (id.startsWith("shift:swap:")) return "Swap at the dock";
  return null;
}
