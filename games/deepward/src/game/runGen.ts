import { hashUnit } from "@jgengine/core/random/rng";
import { ROOM_TEMPLATES, type ConnectorKind, type DoorSlot, type ExitKind, type ExitSlot, type RoomTemplate, type Spot, type ThreatKind, type ThreatSlot, type Zone } from "../world";
import { ITEMS, ITEM_KINDS, type Category, type ItemKind } from "./loot";
import { LITTLES, type LittleId } from "./littles";

/**
 * The house is different every night. A run is a seed; every room is a path from the baseboard
 * crack ("0", then "0-1" for the second door out of it, and so on), and everything about a room
 * (which authored template it is, what lies on each spot, which hunters are home, which exits are
 * open) is a pure function of the seed and that path. Nothing is generated ahead or stored: a
 * reload regenerates the same house from the saved seed, and only what you changed (taken, sprung,
 * dropped) lives in the run's save.
 *
 * This is game-local because it is the first room-chain generator in the engine; the seam is
 * "seeded template graph over editor-authored rooms" and a second adopter should lift it upstream.
 */
export interface RunSeed { seed: string; little: LittleId; zones: readonly Zone[] }
export interface Forward { slot: DoorSlot; kind: ConnectorKind; to: string; template: RoomTemplate; threats: readonly ThreatKind[] }
export interface PlannedLoot { key: string; spot: Spot; kind: ItemKind | "toybox"; level: number }
export interface PlannedThreat { key: string; slot: ThreatSlot; kind: ThreatKind }
export interface PlannedExit { key: string; kind: ExitKind; at: readonly [number, number, number]; label: string; slot: ExitSlot | null }
export interface RoomPlan {
  path: string; depth: number; template: RoomTemplate;
  /** How you came in, and the slot you arrive at. The root's entry is the crack home. */
  entry: { slot: DoorSlot; kind: ConnectorKind };
  forwards: readonly Forward[];
  loot: readonly PlannedLoot[];
  threats: readonly PlannedThreat[];
  exits: readonly PlannedExit[];
  /** Minute of the night the room's light snaps on, if someone gets up; it stays on 25 minutes. */
  lightsAt: number | null;
}

/**
 * What kind of night it is. Every seed rolls one, so two runs feel different before the first door:
 * a storm masks your footsteps, a party left food everywhere, the family is away, the cat is restless.
 */
export type NightKind = "quiet" | "storm" | "party" | "away" | "restless" | "spring-clean" | "full-moon";
export interface NightDef { name: string; line: string; noise: number; seconds: number; finds: Partial<Record<Category, number>>; threats: Partial<Record<ThreatKind, number>>; light: number }
export const NIGHTS: Record<NightKind, NightDef> = {
  quiet: { name: "A quiet night", line: "Nothing unusual. The house ticks and hums.", noise: 1, seconds: 0, finds: {}, threats: {}, light: 1 },
  storm: { name: "Thunderstorm", line: "Rain on the windows covers your footsteps: hunters hear you half as far.", noise: 0.5, seconds: 0, finds: {}, threats: { lights: 0.5 }, light: 0.9 },
  party: { name: "After the party", line: "Crumbs, sweets and dropped coins everywhere, and the cat is stuffed and sleepy.", noise: 1, seconds: 0, finds: { food: 1.8, curio: 1.3 }, threats: { cat: 0.6 }, light: 1 },
  away: { name: "Family's away", line: "The family is out for the night: a longer night, no kid, no lights. Something feeds the cat, though.", noise: 1, seconds: 90, finds: {}, threats: { kid: 0, lights: 0 }, light: 1 },
  restless: { name: "Restless cat", line: "The cat can't sleep. It prowls in far more rooms tonight.", noise: 1, seconds: 0, finds: { curio: 1.2 }, threats: { cat: 1.9 }, light: 1 },
  "spring-clean": { name: "Spring clean", line: "Someone set traps and the Roomba is on a mission. Parts left out everywhere.", noise: 1, seconds: 0, finds: { part: 1.8 }, threats: { trap: 1.7, roomba: 1.8 }, light: 1 },
  "full-moon": { name: "Full moon", line: "Moonlight floods the rooms: you see further, and so does everything else.", noise: 1, seconds: 0, finds: { curio: 1.5 }, threats: {}, light: 1.35 },
};
const NIGHT_KINDS = Object.keys(NIGHTS) as NightKind[];
/** The night a seed rolls; the very first run of a burrow is always quiet. */
export function nightOf(seed: string): NightKind {
  if (seed.startsWith("night-1-")) return "quiet";
  return NIGHT_KINDS[Math.floor(hashUnit(`${seed}|night`) * NIGHT_KINDS.length)] ?? "quiet";
}

export const ROOT = "0";
export const depthOf = (path: string): number => path.split("-").length - 1;
export const parentOf = (path: string): string | null => path === ROOT ? null : path.slice(0, path.lastIndexOf("-"));
const roll = (run: RunSeed, path: string, what: string): number => hashUnit(`${run.seed}|${path}|${what}`);

function weighted<T>(entries: readonly (readonly [T, number])[], unit: number): T | null {
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (!(total > 0)) return null;
  let at = unit * total;
  for (const [value, w] of entries) { at -= Math.max(0, w); if (at < 0) return value; }
  return entries[entries.length - 1]![0];
}

/** Which authored template a room is: the root is a baseboard room; every other room fits the door that leads to it. */
function templateFor(run: RunSeed, path: string, via: DoorSlot | null, parent: RoomTemplate | null): { template: RoomTemplate; kind: ConnectorKind } {
  const depth = depthOf(path);
  const open = ROOM_TEMPLATES.filter(t => t.zone !== "burrow" && run.zones.includes(t.zone as Zone));
  if (via === null || parent === null) {
    const roots = open.filter(t => t.root);
    const template = weighted(roots.map(t => [t, t.weight] as const), roll(run, path, "template")) ?? ROOM_TEMPLATES.find(t => t.root)!;
    return { template, kind: "crack" };
  }
  const entryOf = (t: RoomTemplate) => t.doors.find(d => d.role === "entry")!;
  const fits = open.filter(t => t.minDepth <= depth && t.id !== parent.id && entryOf(t).kinds.some(k => via.kinds.includes(k)));
  // Deeper rooms lean toward the zones you have not seen near the crack.
  const pool = fits.length > 0 ? fits : open.filter(t => t.minDepth <= depth && t.id !== parent.id);
  const template = weighted(pool.map(t => [t, t.weight * (t.zone === parent.zone ? 0.8 : 1.2) * (1 + Math.max(0, t.minDepth) * 0.15)] as const), roll(run, path, "template")) ?? parent;
  const kinds = via.kinds.filter(k => entryOf(template).kinds.includes(k));
  const choices = kinds.length > 0 ? kinds : via.kinds;
  const kind = choices[Math.floor(roll(run, path, "connector") * choices.length)] ?? choices[0]!;
  return { template, kind };
}

const BASE_CATEGORY: Record<Category, number> = { food: 3, part: 2.2, curio: 2, gear: 0.35, cap: 1.5 };
const SPOT_CHANCE = { open: 0.5, tucked: 0.68, cache: 0.9 } as const;

function lootFor(run: RunSeed, path: string, depth: number, template: RoomTemplate): PlannedLoot[] {
  const little = LITTLES[run.little];
  const zone = template.zone as Zone;
  const out: PlannedLoot[] = [];
  let foodBonus = little.foodSense ? 1 : 0;
  for (const spot of template.spots) {
    const key = `${path}:${spot.id}`;
    if (spot.toybox) { out.push({ key, spot, kind: "toybox", level: depth + 1 }); continue; }
    const chance = Math.min(0.97, SPOT_CHANCE[spot.tier] + depth * 0.03);
    let forced: Category | null = null;
    if (roll(run, key, "present") >= chance) {
      if (foodBonus === 0) continue;
      foodBonus -= 1; forced = "food";
    }
    const categories = (Object.keys(BASE_CATEGORY) as Category[]).map(c => {
      let w = BASE_CATEGORY[c] * (little.finds[c] ?? 1) * (NIGHTS[nightOf(run.seed)].finds[c] ?? 1);
      if (c === "gear") w += depth * 0.08;
      if (spot.bias === c) w *= 2.5;
      if (spot.tier === "cache" && (c === "curio" || c === "gear")) w *= 1.6;
      return [c, w] as const;
    });
    const category = forced ?? weighted(categories, roll(run, key, "category")) ?? "food";
    const kinds = ITEM_KINDS.filter(k => ITEMS[k].category === category && (ITEMS[k].minDepth ?? 0) <= depth && (ITEMS[k].weight ?? 1) > 0)
      .map(k => [k, (ITEMS[k].weight ?? 1) * (ITEMS[k].zones === undefined || ITEMS[k].zones!.includes(zone) ? 1 : 0.25)] as const);
    const kind = weighted(kinds, roll(run, key, "kind"));
    if (kind === null) continue;
    const level = depth + 1 + (spot.tier === "cache" ? 1 : 0) + (little.shinySense && category === "curio" ? 1 : 0);
    out.push({ key, spot, kind, level });
  }
  return out;
}

/** How likely a hunter is home: rarer near the crack, near-certain deep in the house. */
export function threatChance(kind: ThreatKind, depth: number, minDepth: number): number {
  if (depth < minDepth) return 0;
  if (kind === "kid") return 1;
  const base = kind === "trap" ? 0.55 : kind === "lights" ? 0.35 : 0.32;
  const chance = base + (depth - minDepth) * 0.16;
  return Math.min(depth === 0 ? 0.22 : 0.92, chance);
}

function threatsFor(run: RunSeed, path: string, depth: number, template: RoomTemplate): PlannedThreat[] {
  const night = NIGHTS[nightOf(run.seed)];
  return template.threats.filter(slot => roll(run, `${path}:${slot.id}`, "home") < Math.min(0.97, threatChance(slot.kind, depth, slot.minDepth) * (night.threats[slot.kind] ?? 1)))
    .map(slot => ({ key: `${path}:${slot.id}`, slot, kind: slot.kind }));
}

function exitsFor(run: RunSeed, path: string, depth: number, template: RoomTemplate, entry: DoorSlot): PlannedExit[] {
  const out: PlannedExit[] = [];
  if (path === ROOT) out.push({ key: `${path}:crack`, kind: "crack", at: entry.at, label: "the crack home", slot: null });
  if (depth >= 1) for (const slot of template.exits) if (roll(run, `${path}:${slot.id}`, "open") < 0.6) out.push({ key: `${path}:${slot.id}`, kind: slot.kind, at: slot.at, label: slot.label, slot });
  return out;
}

const cache = new Map<string, RoomPlan>();
/** The room at `path` in this run, the same every time it is asked. */
export function planRoom(run: RunSeed, path: string): RoomPlan {
  const id = `${run.seed}|${run.little}|${run.zones.join(",")}|${path}`;
  const known = cache.get(id);
  if (known !== undefined) return known;
  const parentPath = parentOf(path);
  const parent = parentPath === null ? null : planRoom(run, parentPath);
  const index = parentPath === null ? 0 : Number(path.slice(path.lastIndexOf("-") + 1));
  const via = parent === null ? null : parent.template.doors.filter(d => d.role === "forward")[index] ?? null;
  const { template, kind } = templateFor(run, path, via, parent?.template ?? null);
  const depth = depthOf(path);
  const entrySlot = template.doors.find(d => d.role === "entry")!;
  const threats = threatsFor(run, path, depth, template);
  const lights = threats.find(t => t.kind === "lights");
  const plan: RoomPlan = {
    path, depth, template,
    entry: { slot: entrySlot, kind },
    forwards: [],
    loot: lootFor(run, path, depth, template),
    threats,
    exits: exitsFor(run, path, depth, template, entrySlot),
    lightsAt: lights === undefined ? null : 200 + Math.floor(roll(run, path, "lights") * 140),
  };
  cache.set(id, plan);
  // Forward doors are resolved after the room is cached, so a child can read its parent.
  const forwards = template.doors.filter(d => d.role === "forward").map((slot, i): Forward => {
    const to = `${path}-${i}`;
    const child = templateFor(run, to, slot, template);
    return { slot, kind: child.kind, to, template: child.template, threats: threatsFor(run, to, depth + 1, child.template).map(t => t.kind) };
  });
  const complete: RoomPlan = { ...plan, forwards };
  cache.set(id, complete);
  if (cache.size > 4000) cache.clear();
  return complete;
}

/** A fresh run seed: the run's id and the burrow's revision make it, so two nights never match. */
export function seedFor(runId: number, revision: number, salt = ""): string {
  return `night-${runId}-${revision}${salt === "" ? "" : `-${salt}`}`;
}
