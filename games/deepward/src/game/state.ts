import { createSessionLoop, type SessionLoopState } from "@jgengine/core/run/sessionLoop";
import { createItemLedger, type ItemLedgerState } from "@jgengine/core/loot/salvage";
import type { Point, Zone } from "../world";
import { completeSets, defOf, ITEMS, itemValue, kindOf, rollItem, SETS, type Item, type ItemKind, type SetId } from "./loot";
import { LITTLES, type LittleId } from "./littles";
import { bankHaul, canCarry, loseHaul } from "./haul";
import { clockOf, collectionOf, packOf, STARTING_ZONES, unlockedLittles, UPGRADE_IDS, wellFed, type Milestones, type UpgradeId } from "./burrow";
import { ROOT, depthOf, planRoom, seedFor, twistOf, type PlannedLoot, type RoomPlan, type RunSeed } from "./runGen";
import type { ThreatState } from "./threats";

export { ITEMS, type Item, type ItemKind } from "./loot";

export interface PackedItem extends Item { x: number; y: number; rotated: boolean }
/** The night: a run starts at 3 a.m.; dawn is six minutes later on the run clock; half an hour of game time after that, the family is up. */
export const NIGHT_SECONDS = 360;
export const GRACE_SECONDS = 60;
export const NIGHT_START_MINUTE = 180;
export const NIGHT_MINUTES = 180;

export interface Result {
  kind: "extracted" | "lost"; run: number; count: number | null; reason: string;
  caps?: number; sets?: SetId[]; depth?: number; via?: string;
}
export interface Home {
  version: 1; revision: number; nextRun: number; extractions: number; caught: number;
  activeRun: number | null; last: Result | null;
  /** A lost run waits on its acknowledgement before the next one. */
  caughtPending: boolean;
  /** The burrow's own name, if the player gave it one. */
  callsign?: string;
  stash: Item[]; caps: number;
  little: LittleId;
  upgrades: Record<UpgradeId, number>;
  zones: Zone[];
  /** Sets banked at least once. */
  sets: SetId[];
  /** What the kid took off you, kept in the toy box until a Little gets it back. */
  kidsBox: Item[];
  milestones: Milestones;
  /** Gear chosen at the stash to take on the next run (at risk until extracted). */
  bring: string[];
  /** Instances traded away: never banked, packed or paid again. */
  ledger: ItemLedgerState;
  session?: SessionLoopState;
}

export interface Channel { kind: "search" | "disarm" | "cross" | "exit" | "toybox"; id: string; remaining: number; total: number; anchor: Point }
export interface Run {
  id: number; seed: string; little: LittleId; zones: Zone[];
  elapsed: number; nightSeconds: number;
  health: number; maxHealth: number;
  pack: PackedItem[]; packW: number; packH: number; capacity: number;
  room: string; visited: string[]; deepest: number;
  taken: string[]; sprung: string[]; dead: string[];
  dropped: { id: string; item: Item; at: Point; room: string }[];
  kidTook: Item[];
  channel: Channel | null;
  hurt: number; flash: number;
  /** The button shield is ready again in each new room. */
  shield: boolean;
  /** Live hunters in the current room. */
  threats: ThreatState[];
  sling: number;
  /** The last thing that hurt you, for the caught screen. */
  cause: string;
}

export function newHome(): Home {
  return {
    version: 1, revision: 0, nextRun: 1, extractions: 0, caught: 0, activeRun: null, last: null, caughtPending: false,
    stash: [], caps: 0, little: "pip",
    upgrades: { workbench: 1, larder: 0, mapRoom: 0, satchel: 0, trophies: 0, slippers: 0, clock: 0, herbs: 0 },
    zones: [...STARTING_ZONES], sets: [], kidsBox: [],
    milestones: { mapRoom: 0, bulkyBanked: 0, setsBanked: 0, deepestExtraction: 0, cellarBanked: 0 },
    bring: [], ledger: {},
  };
}
export function ledgerOf(home: Home) { return createItemLedger(home.ledger); }
export const littlesOf = (home: Home) => unlockedLittles({ ...home.milestones, mapRoom: home.upgrades.mapRoom });
export const runSeedOf = (run: Pick<Run, "seed" | "little" | "zones">): RunSeed => ({ seed: run.seed, little: run.little, zones: run.zones });
export const roomOf = (run: Pick<Run, "seed" | "little" | "zones" | "room">): RoomPlan => planRoom(runSeedOf(run), run.room);

function runLoop(home: Home) {
  const loop = createSessionLoop<never, { home: Home; run: Pick<Run, "id" | "pack" | "kidTook" | "deepest">; kind: Result["kind"]; reason: string; via: string }, Home>({
    kind: "run",
    settle: ({ input }) => settleRun(input.home, input.run, input.kind, input.reason, input.via),
  });
  if (home.session !== undefined) loop.restore(home.session);
  return loop;
}

/** Leave the burrow: the brought gear leaves the stash and rides in the pack, at risk. */
export function depart(home: Home): Home {
  if (home.caughtPending) throw new Error("Shake it off at the burrow before the next run");
  if (home.activeRun !== null) throw new Error("A run is already outstanding");
  for (const uid of home.bring) {
    if (!ledgerOf(home).canUse(uid)) throw new Error("That gear was traded away");
    if (!home.stash.some(item => item.id === uid)) throw new Error("That gear is no longer in the stash");
  }
  if (!littlesOf(home).includes(home.little)) throw new Error("That Little has not moved in yet");
  const loop = runLoop(home);
  const offer = loop.start();
  // The larder feeds you from the stash's cheapest food before you go.
  const food = home.upgrades.larder > 0 ? home.stash.filter(item => defOf(item).category === "food").sort((a, b) => itemValue(a) - itemValue(b))[0] : undefined;
  const stash = home.stash.filter(item => !home.bring.includes(item.id) && item.id !== food?.id);
  return { ...home, stash, revision: home.revision + 1, session: loop.snapshot(), activeRun: offer.session, nextRun: offer.session + 1 };
}
/** Whether this departure eats from the larder: the same rule `depart` uses, read before it runs. */
export function larderMeal(home: Home): Item | null {
  if (home.upgrades.larder <= 0) return null;
  return home.stash.filter(item => defOf(item).category === "food").sort((a, b) => itemValue(a) - itemValue(b))[0] ?? null;
}

export function newRun(id: number, home: Home, before: Home = home): Run {
  const little = LITTLES[home.little];
  const pack = packOf(home.upgrades.satchel);
  const brought = before.stash.filter(item => before.bring.includes(item.id));
  const fed = larderMeal(before) === null ? 0 : wellFed(home.upgrades.larder);
  const collection = collectionOf(home.sets.length);
  const maxHealth = 100 + fed + collection.health;
  let packed: PackedItem[] = [];
  for (const item of brought) { const slot = fitInto(packed, item, pack.w, pack.h); if (slot !== null) packed = [...packed, slot]; }
  const seed = seedFor(id, home.revision), twist = twistOf(seed);
  return {
    id, seed, little: home.little, zones: [...home.zones],
    elapsed: 0, nightSeconds: NIGHT_SECONDS + little.extraNight + twist.seconds + clockOf(home.upgrades.clock),
    health: maxHealth, maxHealth,
    pack: packed, packW: pack.w, packH: pack.h, capacity: Math.round((pack.weight * little.carry + twist.carry + collection.carry) * 10) / 10,
    room: ROOT, visited: [ROOT], deepest: 0,
    taken: [], sprung: [], dead: [], dropped: [], kidTook: [],
    channel: null, hurt: 0, flash: 0, shield: true, threats: [], sling: 0, cause: "",
  };
}

export function footprint(item: Pick<PackedItem, "baseId" | "rotated">): { w: number; h: number } {
  const { w, h } = ITEMS[kindOf(item)];
  return item.rotated ? { w: h, h: w } : { w, h };
}
export function fits(pack: readonly PackedItem[], item: PackedItem, w: number, h: number): boolean {
  const a = footprint(item);
  return item.x >= 0 && item.y >= 0 && item.x + a.w <= w && item.y + a.h <= h && pack.every(other => {
    if (other.id === item.id) return true;
    const b = footprint(other);
    return item.x + a.w <= other.x || other.x + b.w <= item.x || item.y + a.h <= other.y || other.y + b.h <= item.y;
  });
}
export function fitInto(pack: readonly PackedItem[], item: Item, w: number, h: number): PackedItem | null {
  for (const rotated of [false, true]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const candidate = { ...item, x, y, rotated };
    if (fits(pack, candidate, w, h)) return candidate;
  }
  return null;
}
export const pack = (run: Pick<Run, "pack" | "packW" | "packH">, item: Item) => fitInto(run.pack, item, run.packW, run.packH);

export type LootRefusal = "taken" | "over-capacity" | "pack-full";
export type Looted = { ok: true; run: Run; item: Item } | { ok: false; reason: LootRefusal; message: string };
/** The instance a spot holds this run; the pre-search check and the search roll the same one. */
export function peekLoot(run: Pick<Run, "id" | "seed">, planned: Pick<PlannedLoot, "key" | "kind" | "level">): Item {
  if (planned.kind === "toybox") throw new Error("The toy box holds what the kid took, not a roll");
  return rollItem(planned.kind, planned.level, `crumb:${run.seed}:${planned.key}`, `${run.id}:${planned.kind}~${planned.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
}
/** Put a find in the pack: weight first, then a square that fits. */
export function carry(run: Run, item: Item, key: string): Looted {
  if (run.taken.includes(key)) return { ok: false, reason: "taken", message: "Nothing left there." };
  if (run.health <= 0) return { ok: false, reason: "taken", message: "This run is over." };
  const weight = canCarry(run.pack, item, run.capacity, LITTLES[run.little]);
  if (!weight.ok) return { ok: false, reason: weight.reason === "over-capacity" ? "over-capacity" : "pack-full", message: weight.message };
  const slot = pack(run, item);
  if (slot === null) return { ok: false, reason: "pack-full", message: `No room in your pack for the ${defOf(item).name.toLowerCase()}. Tab to repack, or leave something behind.` };
  return { ok: true, item, run: { ...run, pack: [...run.pack, slot], taken: [...run.taken, key], channel: null } };
}

/** Resolve the run once, against its durable id. */
export function settle(home: Home, run: Pick<Run, "id" | "pack" | "kidTook" | "deepest">, kind: Result["kind"], reason: string, via = ""): Home {
  const loop = runLoop(home);
  if (loop.phase() !== "open" || loop.snapshot().session !== run.id) throw new Error("Run already settled or superseded");
  loop.carry(run.pack.length);
  const settlement = loop.settle({ home, run, kind, reason, via });
  return { ...settlement.result, session: loop.snapshot() };
}

/** Bottle caps become the purse; sets pay their bonus; everything else goes on the stash shelves. */
function settleRun(home: Home, run: Pick<Run, "id" | "pack" | "kidTook" | "deepest">, kind: Result["kind"], reason: string, via: string): Home {
  const carried: Item[] = run.pack.map(({ x: _x, y: _y, rotated: _r, ...item }) => item);
  const kidsBox = [...home.kidsBox, ...run.kidTook].slice(-12);
  if (kind === "lost") {
    loseHaul(carried);
    return { ...home, revision: home.revision + 1, activeRun: null, nextRun: run.id + 1, caughtPending: true, caught: home.caught + 1, kidsBox, bring: [],
      last: { kind, run: run.id, count: carried.length, reason, depth: run.deepest } };
  }
  const caps = carried.filter(item => kindOf(item) === "bottle-cap");
  const goods = carried.filter(item => kindOf(item) !== "bottle-cap");
  const moved = bankHaul(goods, home.stash);
  const sets = completeSets(goods);
  const setBonus = sets.reduce((sum, id) => sum + SETS[id].bonus * (home.upgrades.trophies > 0 ? 2 : 1), 0);
  const capsEarned = caps.reduce((sum, item) => sum + itemValue(item), 0) + setBonus;
  const bulky = goods.filter(item => defOf(item).bulky === true).length;
  const cellar = goods.filter(item => defOf(item).zones?.includes("basement") === true).length;
  const allSets = [...new Set([...home.sets, ...sets])];
  return { ...home, revision: home.revision + 1, activeRun: null, nextRun: run.id + 1, extractions: home.extractions + 1, kidsBox, bring: [],
    stash: [...home.stash, ...moved.banked], caps: home.caps + capsEarned, sets: allSets,
    milestones: { ...home.milestones, cellarBanked: home.milestones.cellarBanked + cellar, bulkyBanked: home.milestones.bulkyBanked + bulky, setsBanked: allSets.length, deepestExtraction: Math.max(home.milestones.deepestExtraction, run.deepest), mapRoom: home.upgrades.mapRoom },
    last: { kind, run: run.id, count: carried.length, reason, caps: capsEarned, sets, depth: run.deepest, via } };
}

export function recoverInterrupted(home: Home): Home {
  if (home.activeRun === null) return home;
  const lost = settle(home, { id: home.activeRun, pack: [], kidTook: [], deepest: 0 }, "lost", "The night ended while you were away. Whatever you carried stayed in the house.");
  return { ...lost, last: { ...lost.last!, count: null } };
}
export function acknowledgeCaught(home: Home): Home {
  if (!home.caughtPending || home.activeRun !== null) throw new Error("Nothing to shake off");
  return { ...home, revision: home.revision + 1, caughtPending: false };
}

/** The night's clock as the HUD prints it: "4:12 AM". */
export function clockText(run: Pick<Run, "elapsed" | "nightSeconds">): string {
  const minute = Math.floor(NIGHT_START_MINUTE + Math.min(run.elapsed, run.nightSeconds + GRACE_SECONDS) / run.nightSeconds * NIGHT_MINUTES);
  const h = Math.floor(minute / 60), m = minute % 60;
  return `${h}:${String(m).padStart(2, "0")} AM`;
}
/** The minute of the night, for the room's lights. */
export const nightMinute = (run: Pick<Run, "elapsed" | "nightSeconds">) => NIGHT_START_MINUTE + run.elapsed / run.nightSeconds * NIGHT_MINUTES;
export const isDawn = (run: Pick<Run, "elapsed" | "nightSeconds">) => run.elapsed >= run.nightSeconds;
export const familyUp = (run: Pick<Run, "elapsed" | "nightSeconds">) => run.elapsed >= run.nightSeconds + GRACE_SECONDS;
/** Whether the room's light is on: someone up for water, or the family awake at dawn. */
export function lightsOn(run: Pick<Run, "elapsed" | "nightSeconds">, plan: Pick<RoomPlan, "lightsAt">): boolean {
  if (isDawn(run)) return true;
  if (plan.lightsAt === null) return false;
  const minute = nightMinute(run);
  return minute >= plan.lightsAt && minute < plan.lightsAt + 25;
}
export const roomDepth = (run: Pick<Run, "room">) => depthOf(run.room);
export function age(run: Run, dt: number, damage = 0): Run {
  if (!(dt > 0) || !Number.isFinite(dt)) return run;
  const health = Math.max(0, run.health - damage);
  return { ...run, elapsed: run.elapsed + dt, health, flash: Math.max(0, run.flash - dt), sling: Math.max(0, run.sling - dt), hurt: health < run.health ? 0.4 : Math.max(0, run.hurt - dt) };
}
/** Whether the Little is carrying something that needs both arms. */
export const twoHanded = (run: Pick<Run, "pack" | "little">) => !LITTLES[run.little].bulkyFree && run.pack.some(item => defOf(item).bulky === true);
/** Gear in the pack works for you; the effect is on while it is carried. */
export const hasGear = (run: Pick<Run, "pack">, effect: NonNullable<ReturnType<typeof defOf>["gear"]>) => run.pack.some(item => defOf(item).gear === effect);
export { UPGRADE_IDS };
