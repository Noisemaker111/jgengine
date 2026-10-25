import { createSessionLoop, type SessionLoopState } from "@jgengine/core/run/sessionLoop";
import { spawnFauna, type Creature } from "./fauna";
import { isStratum, type Stratum } from "./strata";
import { PRINT_SPAWN, type Point } from "../world";
import { FITTER_HEALTH, reserveOf } from "./combat";
import { openScripBooks, settleEconomy } from "./counter";
import { bankHaul, canCache, loseHaul } from "./haul";
import { ITEMS, kindOf, rollItem, type Item, type ItemKind } from "./items";
import { createItemLedger, type ItemLedgerState } from "@jgengine/core/loot/salvage";
import type { CareerBankState } from "@jgengine/core/progression/careerBank";
import type { StandingState } from "@jgengine/core/progression/standing";
import type { LedgerState } from "@jgengine/core/economy/transactionLedger";

export { ITEMS, type Item, type ItemKind } from "./items";

export interface PackedItem extends Item { x: number; y: number; rotated: boolean }
export const CACHE = { w: 4, h: 3 };
export const TANK_SECONDS = 110;
export interface Result { kind: "extracted" | "lost"; dive: number; count: number | null; reason: string; scrip?: number }
export interface Home {
  version: 5; refits: ("tank" | "reserve")[]; reprintPending: boolean; revision: number; nextDive: number; life: number;
  activeDive: number | null; stash: Item[]; extractions: number; deaths: number; last: Result | null;
  /** Career scrip: what the counter keeps, and what a Life's haul becomes. */
  bank: CareerBankState;
  /** Marrow's standing, moved by returning and by dying. */
  standing: StandingState;
  /** Instances that left play; a broken-down item can never be equipped or paid again. */
  ledger: ItemLedgerState;
  /** The counter's books: every scrip movement with its reason and the balance it produced. */
  books: LedgerState;
  /** The dive session loop's own state, so a reload resumes the run that was outstanding. */
  session?: SessionLoopState;
}
export interface Dive {
  id: number; elapsed: number; tankSeconds: number; oxygen: number; health: number; cache: PackedItem[];
  collected: string[]; hand: "sidearm" | "service-rifle";
  /** Rounds the refit issued for this dive's one reserve; the held weapon's magazine draws from it. */
  reservePool: number;
  flash: number; hurt: number;
  print: { at: Point; health: number; mode: "route" | "calling" | "winding"; attack: number; cooldown: number; drop: Point | null };
  channel: { id: string; remaining: number; anchor: Point; kind?: ChannelKind; total?: number } | null;
  /** The stratum the diver stands in; receiving is the rail's floor. */
  stratum: Stratum;
  /** Headlamp: lights the dark strata, and lights the diver up for anything that hunts by sight. */
  lamp: boolean;
  /** Food, water and lures carried on the belt; food and water ride home into Marrow's galley. */
  belt: { ration: number; water: number; lure: number };
  /** Every creature in Bellwether this Life, by id. A creature put down stays down for the dive. */
  fauna: Record<string, Creature>;
  /** Times each resource node has been worked this Life. */
  harvested: Record<string, number>;
  /** Lures on the floor: where each landed and how long its blood keeps calling. */
  thrown: { id: string; at: Point; remaining: number }[];
  /** Seconds of ink still on the suit: a courier can smell it. */
  inked: number;
}
/** What a held E (or C) is doing: searching a locker, working a node, scanning, or taking a supply. */
export type ChannelKind = "search" | "harvest" | "scan" | "supply" | "creature" | "zero";
/** What the dive starts with beyond the refits: the base's air, carried lures and the crawler's landing. */
export interface DiveStart { airBonus?: number; lures?: number; stratum?: Stratum }
export function newHome(): Home {
  return {
    version: 5, refits: [], reprintPending: false, revision: 0, nextDive: 1, life: 1, activeDive: null, stash: [], extractions: 0, deaths: 0, last: null,
    bank: { banked: 0, haul: 0, deposited: 0, lost: 0, bestHaul: 0, runs: 0 },
    standing: { records: {} }, ledger: {}, books: openScripBooks(0),
  };
}
export function ledgerOf(home: Home) { return createItemLedger(home.ledger); }
/**
 * A dive is a session on the shared loop: it opens at departure, carries the haul it packed, and its
 * boundary is the game's own bank-or-lose rule. The loop is rebuilt from the home it is asked about,
 * so a pure `Home` value stays the only storage and a reload resumes the outstanding run.
 */
function diveLoop(home: Home) {
  const loop = createSessionLoop<never, { home: Home; dive: Pick<Dive, "id" | "cache">; kind: Result["kind"]; reason: string }, Home>({
    kind: "run",
    settle: ({ input }) => settleDive(input.home, input.dive, input.kind, input.reason),
  });
  if (home.session !== undefined) loop.restore(home.session);
  return loop;
}
export function depart(home: Home, rifleUid: string | null = null): Home {
  if (home.reprintPending) throw new Error("Acknowledge the reprint before departing");
  if (home.activeDive !== null) throw new Error("A dive is already outstanding");
  if (rifleUid !== null) {
    if (!ledgerOf(home).canUse(rifleUid)) throw new Error("That rifle was broken down at the counter");
    if (!home.stash.some(item => item.id === rifleUid && kindOf(item) === "service-rifle")) throw new Error("That service rifle is no longer banked");
  }
  const loop = diveLoop(home);
  const offer = loop.start();
  return { ...home, stash: rifleUid === null ? home.stash : home.stash.filter(item => item.id !== rifleUid), revision: home.revision + 1, session: loop.snapshot(), activeDive: offer.session, nextDive: offer.session + 1 };
}
export function newDive(id: number, home: Pick<Home, "refits"> = { refits: [] }, rifle: Item | null = null, start: DiveStart = {}): Dive {
  if (rifle !== null && kindOf(rifle) !== "service-rifle") throw new Error("Only a service rifle can be prepared for departure");
  const tankSeconds = (home.refits.includes("tank") ? 145 : TANK_SECONDS) + (start.airBonus ?? 0);
  return { id, elapsed: 0, tankSeconds, oxygen: tankSeconds, health: 100, cache: rifle === null ? [] : [pack([], rifle)!], collected: [], hand: rifle === null ? "sidearm" : "service-rifle",
    reservePool: reserveOf(home.refits), flash: 0, hurt: 0,
    print: { at: PRINT_SPAWN, health: FITTER_HEALTH, mode: "route", attack: 0, cooldown: 0, drop: null }, channel: null,
    stratum: start.stratum ?? "vault", lamp: false, belt: { ration: 0, water: 0, lure: start.lures ?? 0 }, fauna: spawnFauna(), harvested: {}, thrown: [], inked: 0 };
}
export function footprint(item: Pick<PackedItem, "baseId" | "rotated">): { w: number; h: number } {
  const { w, h } = ITEMS[kindOf(item)];
  return item.rotated ? { w: h, h: w } : { w, h };
}
export function fits(cache: readonly PackedItem[], item: PackedItem): boolean {
  const a = footprint(item);
  return item.x >= 0 && item.y >= 0 && item.x + a.w <= CACHE.w && item.y + a.h <= CACHE.h && cache.every(other => {
    if (other.id === item.id) return true;
    const b = footprint(other);
    return item.x + a.w <= other.x || other.x + b.w <= item.x || item.y + a.h <= other.y || other.y + b.h <= item.y;
  });
}
export function pack(cache: readonly PackedItem[], item: Item): PackedItem | null {
  for (const rotated of [false, true]) for (let y = 0; y < CACHE.h; y++) for (let x = 0; x < CACHE.w; x++) {
    const candidate = { ...item, x, y, rotated };
    if (fits(cache, candidate)) return candidate;
  }
  return null;
}
/** What an empty square, the weight gate or an already-searched source refused, in the player's words. */
export type LootRefusal = "taken" | "over-capacity" | "grid-full";
export type Looted = { ok: true; dive: Dive } | { ok: false; reason: LootRefusal; message: string };
/** The instance a source would yield in this Life; extraction and the pre-search check roll the same one. */
export function peekLoot(dive: Dive, source: string, kind: ItemKind, depth = 1): Item {
  return rollItem(kind, depth, `deepward:${dive.id}:${source}`, `${dive.id}:${source}`);
}
/** Item level is the room's depth, so the same source in the same Life always rolls the same instance. */
export function takeLoot(dive: Dive, source: string, kind: ItemKind, depth = 1): Looted {
  if (dive.collected.includes(source)) return { ok: false, reason: "taken", message: "That source is already empty." };
  if (dive.health <= 0) return { ok: false, reason: "taken", message: "This Life is over." };
  const item = peekLoot(dive, source, kind, depth);
  const weight = canCache(dive.cache, item);
  if (!weight.ok) return { ok: false, reason: weight.reason === "over-capacity" ? "over-capacity" : "grid-full", message: weight.message };
  const packed = pack(dive.cache, item);
  if (packed === null) return { ok: false, reason: "grid-full", message: `The cache grid has no room for ${ITEMS[kind].name}. Tab to repack or leave something behind.` };
  return { ok: true, dive: { ...dive, cache: [...dive.cache, packed], collected: [...dive.collected, source], channel: null } };
}
/** Resolve once against the durable departure id. Cache coordinates never enter home storage. */
export function settle(home: Home, dive: Pick<Dive, "id" | "cache">, kind: Result["kind"], reason: string): Home {
  const loop = diveLoop(home);
  if (loop.phase() !== "open" || loop.snapshot().session !== dive.id) throw new Error("Dive already settled or superseded");
  // The run carries the instances it packed; its boundary hands them to the shared haul rules.
  loop.carry(dive.cache.length);
  const settlement = loop.settle({ home, dive, kind, reason });
  return { ...settlement.result, session: loop.snapshot() };
}

/** The boundary's own rule: the shared haul banks what the stash takes or loses it with the Life. */
function settleDive(home: Home, dive: Pick<Dive, "id" | "cache">, kind: Result["kind"], reason: string): Home {
  const carried: Item[] = dive.cache.map(({ x: _x, y: _y, rotated: _rotated, ...item }) => item);
  const moved = kind === "extracted" ? bankHaul(carried, home.stash) : { banked: [], refused: loseHaul(carried) };
  const economy = settleEconomy(home, carried, kind, dive.id);
  return { ...home, revision: home.revision + 1, activeDive: null, nextDive: dive.id + 1, reprintPending: kind === "lost",
    stash: [...home.stash, ...moved.banked], extractions: home.extractions + (kind === "extracted" ? 1 : 0),
    deaths: home.deaths + (kind === "lost" ? 1 : 0), life: home.life + (kind === "lost" ? 1 : 0),
    bank: economy.bank, standing: economy.standing, books: economy.books,
    last: { kind, dive: dive.id, count: dive.cache.length, reason, scrip: economy.scrip } };
}
export function recoverInterrupted(home: Home): Home {
  if (home.activeDive === null) return home;
  const lost = settle(home, { id: home.activeDive, cache: [] }, "lost", "Radio lost during a dive. The Life ended; its carried haul stayed in Bellwether.");
  return { ...lost, last: { ...lost.last!, count: null } }; // Carried instances were never persisted mid-dive.
}
/** What else is wearing on the diver this tick: crush, hunger, thirst, and how hard the air works. */
export interface Wear { damage?: number; airRate?: number }
export function ageDive(dive: Dive, dt: number, steam: boolean, wear: Wear = {}): Dive {
  if (!(dt > 0) || !Number.isFinite(dt)) return dive;
  const breath = dt * (wear.airRate ?? 1);
  const oxygen = Math.max(0, dive.oxygen - breath);
  const suffocation = Math.max(0, breath - dive.oxygen) / (wear.airRate ?? 1) * 12;
  const health = Math.max(0, dive.health - suffocation - (steam ? 18 * dt : 0) - (wear.damage ?? 0) * dt);
  return { ...dive, elapsed: dive.elapsed + dt, oxygen, health,
    flash: Math.max(0, dive.flash - dt),
    hurt: health < dive.health ? 0.35 : Math.max(0, dive.hurt - dt) };
}

export function acknowledgeReprint(home: Home): Home {
  if (!home.reprintPending || home.activeDive !== null) throw new Error("No reprint awaiting acknowledgement");
  return { ...home, revision: home.revision + 1, reprintPending: false };
}

/** A dive saved before the strata existed resumes in receiving with an empty belt and fresh fauna. */
export function normalizeDive(dive: Dive): Dive {
  const saved = dive as Partial<Dive> & Pick<Dive, "id">;
  return { ...dive,
    stratum: isStratum(saved.stratum) ? saved.stratum : "vault",
    lamp: saved.lamp === true,
    belt: saved.belt ?? { ration: 0, water: 0, lure: 0 },
    fauna: saved.fauna ?? spawnFauna(),
    harvested: saved.harvested ?? {},
    thrown: saved.thrown ?? [],
    inked: typeof saved.inked === "number" ? saved.inked : 0 };
}
