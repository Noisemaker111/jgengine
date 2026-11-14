import { hashUnit } from "@jgengine/core/random/rng";
import { groundDistance, inside, lineOfSight, walkable, type Point, type RoomTemplate, type ThreatKind } from "../world";
import type { PlannedThreat } from "./runGen";

/**
 * The house's hunters, as pure state and one tick. Every number is in world units (about 1.5 cm)
 * and seconds. A room's threats are rebuilt from its plan when you walk in and forget you when you
 * leave; what they do in between is this file.
 *
 * - The Cat prowls, listens, stalks what it heard, crouches with a wiggle you can hear, and pounces
 *   at where you stood. Cover (a towel, a sock, a magazine) hides you; moving sideways dodges.
 * - The Roomba sweeps the floor in lanes on a schedule, swallowing whatever it rolls over, you included.
 * - The Spider waits in its web, which drags at you, and bites what lingers; a torch keeps it off.
 * - A Mousetrap snaps once. Disarmed, it gives up its spring.
 * - The Kid sleeps, but a restless kid sits up and looks; held in their sight, they pick you up and
 *   keep your pack.
 * - The Dog sleeps until it hears you, then barks (waking every cat in the room) and lumbers after you.
 */
export interface ThreatState {
  key: string; kind: ThreatKind; at: Point; home: Point;
  mode: "idle" | "prowl" | "listen" | "stalk" | "crouch" | "pounce" | "groom" | "sweep" | "dock" | "lurk" | "bite" | "armed" | "sprung" | "asleep" | "looking" | "awake" | "fled" | "dead";
  timer: number; facing: number; target: Point | null; cooldown: number; stunned: number;
  /** Spider wounds, kid sight build-up, roomba lane index. */
  hits: number; seen: number; lane: number;
}

export const CAT = { prowl: 3.2, stalk: 5.2, sight: 18, cone: 150, crouch: 1.15, pounceTime: 0.45, reach: 3.4, damage: 42, groom: 3.5, stalkTo: 11 } as const;
export const ROOMBA = { speed: 3.8, radius: 7.5, cycle: 64, active: 28, damage: 12, laneGap: 7 } as const;
export const SPIDER = { web: 5.5, reach: 1.6, speed: 2.6, leash: 9, windup: 0.6, damage: 18, cooldown: 1.6, slow: 0.45 } as const;
export const TRAP = { trigger: 1.15, damage: 50 } as const;
export const KID = { sight: 34, cycle: 16, look: 6, grab: 1.1 } as const;
export const DOG = { speed: 3.4, hear: 0.8, sight: 13, reach: 5.5, damage: 14, bark: 2.2, calm: 10 } as const;

export function spawnThreat(planned: PlannedThreat): ThreatState {
  const at: Point = [planned.slot.at[0], 0, planned.slot.at[2]];
  const mode: ThreatState["mode"] = planned.kind === "cat" ? "prowl" : planned.kind === "roomba" ? "dock" : planned.kind === "spider" ? "lurk" : planned.kind === "trap" ? "armed" : planned.kind === "kid" || planned.kind === "dog" ? "asleep" : "idle";
  return { key: planned.key, kind: planned.kind, at, home: at, mode, timer: hashUnit(planned.key) * 4, facing: hashUnit(`${planned.key}:f`) * Math.PI * 2, target: null, cooldown: 0, stunned: 0, hits: 0, seen: 0, lane: 0 };
}

/** What the tick needs to know about the Little. */
export interface Senses {
  at: Point;
  /** How far the Little's sound carries this tick, in units. */
  noise: number;
  /** Multiple on every hunter's sight distance: lights, torch, dark room, sneaking, stillness. */
  visibility: number;
  covered: boolean;
  torch: boolean;
  /** Seconds since the run began: the roomba's schedule and the kid's restlessness run on it. */
  clock: number;
  restless: boolean;
  /** A pebble that landed this tick, from the slingshot. */
  pebble: Point | null;
}
export type ThreatEvent =
  | { type: "hurt"; damage: number; by: ThreatKind; text: string }
  | { type: "vacuum"; at: Point }
  | { type: "grab" }
  | { type: "bark"; at: Point }
  | { type: "cue"; sound: "wiggle" | "snap" | "hiss" | "bark" | "whirr" | "yelp"; at: Point };

const toward = (from: Point, to: Point) => Math.atan2(to[0] - from[0], to[2] - from[2]);
function angleBetween(a: number, b: number): number { const d = Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d; }
/** Step toward a point, sliding along solids, kept inside the room. */
function stepToward(template: RoomTemplate, from: Point, to: Point, speed: number, dt: number, radius: number): Point {
  const dx = to[0] - from[0], dz = to[2] - from[2], len = Math.hypot(dx, dz);
  if (len < 1e-3) return from;
  const step = Math.min(len, speed * dt), nx = from[0] + dx / len * step, nz = from[2] + dz / len * step;
  if (walkable(template, nx, nz, radius)) return [nx, 0, nz];
  if (walkable(template, nx, from[2], radius)) return [nx, 0, from[2]];
  if (walkable(template, from[0], nz, radius)) return [from[0], 0, nz];
  return from;
}
function wanderPoint(template: RoomTemplate, s: ThreatState, salt: number, spread: number): Point {
  const a = template.area;
  const x = Math.max(a.x - a.w / 2 + 3, Math.min(a.x + a.w / 2 - 3, s.home[0] + (hashUnit(`${s.key}:wx${salt}`) - 0.5) * spread));
  const z = Math.max(a.z - a.d / 2 + 3, Math.min(a.z + a.d / 2 - 3, s.home[2] + (hashUnit(`${s.key}:wz${salt}`) - 0.5) * spread));
  return [x, 0, z];
}
function sees(template: RoomTemplate, s: ThreatState, senses: Senses, range: number, cone: number): boolean {
  if (senses.covered) return false;
  const d = groundDistance(s.at, senses.at);
  if (d > range * senses.visibility) return false;
  if (cone < 360 && angleBetween(s.facing, toward(s.at, senses.at)) > (cone / 2) * Math.PI / 180) return false;
  return lineOfSight(template, s.at, senses.at);
}
const hears = (s: ThreatState, senses: Senses, factor = 1) => senses.noise > 0 && groundDistance(s.at, senses.at) <= senses.noise * factor;

/** The roomba's lanes across the room: back and forth, a lane-width apart. */
export function roombaLane(template: RoomTemplate, lane: number): { from: Point; to: Point } {
  const a = template.area, lanes = Math.max(1, Math.floor((a.d - 6) / ROOMBA.laneGap));
  const index = lane % (lanes * 2), row = index < lanes ? index : lanes * 2 - 1 - index;
  const z = a.z - a.d / 2 + 3 + row * ROOMBA.laneGap + ROOMBA.laneGap / 2;
  const left: Point = [a.x - a.w / 2 + 4, 0, z], right: Point = [a.x + a.w / 2 - 4, 0, z];
  return lane % 2 === 0 ? { from: left, to: right } : { from: right, to: left };
}
export function roombaActive(s: Pick<ThreatState, "key">, clock: number): boolean {
  const phase = (clock + hashUnit(`${s.key}:phase`) * ROOMBA.cycle) % ROOMBA.cycle;
  return phase < ROOMBA.active;
}
export function kidLooking(s: Pick<ThreatState, "key">, clock: number, restless: boolean): boolean {
  if (!restless) return false;
  const phase = (clock + hashUnit(`${s.key}:look`) * KID.cycle) % KID.cycle;
  return phase > KID.cycle - KID.look;
}
/** How much a spider web drags at the Little: 1 is free, lower is stuck. */
export function webDrag(states: readonly ThreatState[], at: Point): number {
  return states.some(s => s.kind === "spider" && s.mode !== "dead" && groundDistance(s.home, at) < SPIDER.web) ? SPIDER.slow : 1;
}

export function tickThreats(template: RoomTemplate, states: readonly ThreatState[], senses: Senses, dt: number): { states: ThreatState[]; events: ThreatEvent[] } {
  const events: ThreatEvent[] = [];
  const barks: Point[] = [];
  const next = states.map(state => {
    const s: ThreatState = { ...state, timer: state.timer - dt, cooldown: Math.max(0, state.cooldown - dt), stunned: Math.max(0, state.stunned - dt) };
    if (s.mode === "dead" || s.mode === "sprung") return s;
    if (senses.pebble !== null && (s.kind === "cat" || s.kind === "dog") && groundDistance(s.at, senses.pebble) < 26) {
      s.target = senses.pebble;
      if (s.kind === "cat" && s.mode !== "pounce") { s.mode = "stalk"; s.timer = 6; }
      if (s.kind === "dog" && s.mode === "asleep") { s.mode = "awake"; s.timer = DOG.calm; }
    }
    switch (s.kind) {
      case "cat": return tickCat(template, s, senses, dt, events);
      case "roomba": return tickRoomba(template, s, senses, dt, events);
      case "spider": return tickSpider(template, s, senses, dt, events);
      case "trap": return tickTrap(s, senses, events);
      case "kid": return tickKid(template, s, senses, dt, events);
      case "dog": return tickDog(template, s, senses, dt, events, barks);
      default: return s;
    }
  });
  // A bark wakes every cat in the room and sends it to the noise.
  if (barks.length > 0) for (const s of next) if (s.kind === "cat" && s.mode !== "pounce" && s.mode !== "crouch" && s.stunned <= 0) { s.mode = "stalk"; s.target = senses.at; s.timer = 6; }
  return { states: next, events };
}

function tickCat(template: RoomTemplate, s: ThreatState, senses: Senses, dt: number, events: ThreatEvent[]): ThreatState {
  if (s.stunned > 0) { s.mode = "fled"; s.at = stepToward(template, s.at, s.home, CAT.stalk, dt, 2); return s; }
  if (s.mode === "fled") { s.mode = "prowl"; s.timer = 2; }
  const spotted = sees(template, s, senses, CAT.sight, CAT.cone);
  if (s.mode === "pounce") {
    if (s.target !== null) {
      s.at = stepToward(template, s.at, s.target, groundDistance(s.at, s.target) / Math.max(0.05, s.timer + dt), dt, 0.5);
      s.facing = toward(s.at, s.target);
    }
    if (s.timer <= 0) {
      if (s.target !== null && groundDistance(senses.at, s.target) < CAT.reach && !senses.covered) events.push({ type: "hurt", damage: CAT.damage, by: "cat", text: "The Cat's paw came down on you." });
      s.mode = "groom"; s.timer = CAT.groom; s.target = null;
    }
    return s;
  }
  if (s.mode === "crouch") {
    if (senses.covered) { s.mode = "prowl"; s.timer = 2; s.target = null; return s; }
    if (spotted) { s.target = senses.at; s.facing = toward(s.at, senses.at); }
    if (s.timer <= 0) { s.mode = "pounce"; s.timer = CAT.pounceTime; }
    return s;
  }
  if (s.mode === "groom") { if (s.timer <= 0) { s.mode = "prowl"; s.timer = 3; } return s; }
  if (spotted) {
    s.target = senses.at; s.facing = toward(s.at, senses.at);
    if (groundDistance(s.at, senses.at) <= CAT.stalkTo) { s.mode = "crouch"; s.timer = CAT.crouch; events.push({ type: "cue", sound: "wiggle", at: s.at }); return s; }
    s.mode = "stalk"; s.timer = 5;
  } else if (hears(s, senses)) {
    if (s.mode === "prowl") { s.mode = "listen"; s.timer = 0.8; }
    s.target = senses.at;
  }
  if (s.mode === "listen") { if (s.target !== null) s.facing = toward(s.at, s.target); if (s.timer <= 0) { s.mode = "stalk"; s.timer = 6; } return s; }
  if (s.mode === "stalk" && s.target !== null) {
    s.facing = toward(s.at, s.target);
    s.at = stepToward(template, s.at, s.target, CAT.stalk, dt, 2);
    if (groundDistance(s.at, s.target) < 2 || s.timer <= 0) { s.mode = "prowl"; s.target = null; s.timer = 2; }
    return s;
  }
  // Prowl: amble between points around its spot.
  if (s.target === null || s.timer <= 0 || groundDistance(s.at, s.target) < 1.5) { s.target = wanderPoint(template, s, Math.floor(senses.clock / 5), 30); s.timer = 6; }
  s.facing = toward(s.at, s.target);
  s.at = stepToward(template, s.at, s.target, CAT.prowl, dt, 2);
  s.mode = "prowl";
  return s;
}

function tickRoomba(template: RoomTemplate, s: ThreatState, senses: Senses, dt: number, events: ThreatEvent[]): ThreatState {
  if (s.stunned > 0) return s;
  if (!roombaActive(s, senses.clock)) {
    s.mode = "dock";
    s.at = stepToward(template, s.at, s.home, ROOMBA.speed, dt, 0.5);
    return s;
  }
  if (s.mode === "dock") events.push({ type: "cue", sound: "whirr", at: s.at });
  s.mode = "sweep";
  const lane = roombaLane(template, s.lane);
  // Head for the lane's start, then drive it to the end, then take the next lane back.
  const target = s.target ?? lane.from;
  s.facing = toward(s.at, target);
  const moved = stepToward(template, s.at, target, ROOMBA.speed, dt, 0.5);
  const stuck = moved[0] === s.at[0] && moved[2] === s.at[2];
  if (groundDistance(moved, target) < 0.6 || stuck) {
    if (s.target === null && !stuck) s.target = lane.to;
    else { s.lane += 1; s.target = null; }
  }
  s.at = moved;
  events.push({ type: "vacuum", at: s.at });
  if (groundDistance(s.at, senses.at) < ROOMBA.radius && s.cooldown <= 0) {
    events.push({ type: "hurt", damage: ROOMBA.damage, by: "roomba", text: "The Roomba bowled you over and swallowed something from your pack." });
    s.cooldown = 3;
  }
  return s;
}

function tickSpider(template: RoomTemplate, s: ThreatState, senses: Senses, dt: number, events: ThreatEvent[]): ThreatState {
  if (s.stunned > 0) { s.at = stepToward(template, s.at, s.home, SPIDER.speed * 1.4, dt, 0.3); return s; }
  const d = groundDistance(s.at, senses.at), fromHome = groundDistance(s.home, senses.at);
  if (senses.torch && d < 6) {
    s.mode = "lurk"; s.at = stepToward(template, s.at, s.home, SPIDER.speed * 1.5, dt, 0.3);
    if (s.cooldown <= 0) { events.push({ type: "cue", sound: "hiss", at: s.at }); s.cooldown = 3; }
    return s;
  }
  if (s.mode === "bite") {
    if (s.timer <= 0) {
      if (d < SPIDER.reach + 0.6) events.push({ type: "hurt", damage: SPIDER.damage, by: "spider", text: "The spider bit you." });
      s.mode = "lurk"; s.cooldown = SPIDER.cooldown;
    }
    return s;
  }
  if (fromHome < SPIDER.leash && (inside(senses.at[0], senses.at[2], { x: s.home[0], z: s.home[2], w: SPIDER.leash * 2, d: SPIDER.leash * 2 }))) {
    s.facing = toward(s.at, senses.at);
    if (d <= SPIDER.reach && s.cooldown <= 0) { s.mode = "bite"; s.timer = SPIDER.windup; return s; }
    s.at = stepToward(template, s.at, senses.at, SPIDER.speed, dt, 0.3);
    s.mode = "lurk";
    return s;
  }
  s.at = stepToward(template, s.at, s.home, SPIDER.speed * 0.6, dt, 0.3);
  s.mode = "lurk";
  return s;
}

function tickTrap(s: ThreatState, senses: Senses, events: ThreatEvent[]): ThreatState {
  if (s.mode === "armed" && groundDistance(s.at, senses.at) < TRAP.trigger) {
    events.push({ type: "hurt", damage: TRAP.damage, by: "trap", text: "SNAP. A mousetrap caught your heel." }, { type: "cue", sound: "snap", at: s.at });
    s.mode = "sprung";
  }
  return s;
}

function tickKid(template: RoomTemplate, s: ThreatState, senses: Senses, dt: number, events: ThreatEvent[]): ThreatState {
  const looking = kidLooking(s, senses.clock, senses.restless);
  s.mode = looking ? "looking" : "asleep";
  if (!looking || s.cooldown > 0) { s.seen = Math.max(0, s.seen - dt); return s; }
  s.facing = toward(s.at, senses.at);
  const visible = !senses.covered && groundDistance(s.at, senses.at) < KID.sight * senses.visibility && lineOfSight(template, s.at, senses.at);
  s.seen = visible ? s.seen + dt : Math.max(0, s.seen - dt * 0.5);
  if (s.seen >= KID.grab) { events.push({ type: "grab" }); s.seen = 0; s.cooldown = 12; }
  return s;
}

function tickDog(template: RoomTemplate, s: ThreatState, senses: Senses, dt: number, events: ThreatEvent[], barks: Point[]): ThreatState {
  if (s.stunned > 0) { s.mode = "fled"; s.at = stepToward(template, s.at, s.home, DOG.speed, dt, 3); return s; }
  const heard = hears(s, senses, DOG.hear), spotted = sees(template, s, senses, DOG.sight, 200);
  if (s.mode === "asleep" || s.mode === "fled") {
    if (heard || spotted) { s.mode = "awake"; s.timer = DOG.calm; s.target = senses.at; s.seen = DOG.bark; } else return s;
  }
  if (heard || spotted) { s.timer = DOG.calm; s.target = senses.at; }
  if (s.timer <= 0) { s.mode = "asleep"; s.target = null; s.at = s.home; return s; }
  s.seen += dt;
  if (s.seen >= DOG.bark) { s.seen = 0; events.push({ type: "bark", at: s.at }, { type: "cue", sound: "bark", at: s.at }); barks.push(s.at); }
  if (s.target !== null) {
    s.facing = toward(s.at, s.target);
    // Clumsy: it overshoots and blunders, never quite where you are.
    s.at = stepToward(template, s.at, s.target, DOG.speed, dt, 3);
  }
  if (groundDistance(s.at, senses.at) < DOG.reach && s.cooldown <= 0) {
    events.push({ type: "hurt", damage: DOG.damage, by: "dog", text: "The dog's nose knocked you flat." });
    s.cooldown = 2.4;
  }
  return s;
}

/** F with the needle: the nearest spider, cat or dog in reach is stung. Returns the change and what happened. */
export function jab(states: readonly ThreatState[], at: Point): { states: ThreatState[]; text: string | null; silk: Point | null } {
  let text: string | null = null, silk: Point | null = null;
  const reach = (s: ThreatState) => s.kind === "spider" ? 2.8 : s.kind === "cat" ? CAT.reach + 3 : s.kind === "dog" ? DOG.reach + 1.5 : 0;
  const target = states.filter(s => s.mode !== "dead" && reach(s) > 0 && groundDistance(s.at, at) < reach(s)).sort((a, b) => groundDistance(a.at, at) - groundDistance(b.at, at))[0];
  if (target === undefined) return { states: [...states], text: null, silk: null };
  const next = states.map(s => {
    if (s.key !== target.key) return s;
    if (s.kind === "spider") {
      const hits = s.hits + 1;
      if (hits >= 2) { text = "The spider curls up for good. It left its silk."; silk = s.at; return { ...s, hits, mode: "dead" as const }; }
      text = "You jab the spider. It scuttles back to its web."; return { ...s, hits, stunned: 3 };
    }
    text = s.kind === "cat" ? "The needle finds the Cat's nose. It hisses and backs off." : "The dog yelps at the needle and backs away.";
    return { ...s, stunned: 4, mode: "fled" as const, target: null };
  });
  return { states: next, text, silk };
}
