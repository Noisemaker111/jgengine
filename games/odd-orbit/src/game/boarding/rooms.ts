import {
  CLIMATES, GRAVITIES, LIGHTS, SPECIES, type Atmosphere, type Climate, type FactorWant, type Gravity, type Light, type SpeciesDef, type SpeciesId,
} from "./species";

/**
 * The boarding house as a grid of bolted-on modules. Each room has its own air, pull, warmth and
 * light; what a tenant puts out (swamp gas, chitter, rock-heat, mist-chill) leaks into the rooms
 * beside theirs unless the wall is sealed. Comfort is read off the effective room, never stored, so
 * moving one tenant reshuffles everybody's evening. Pure model: no scene, no rendering.
 */

/** Two decks of four: slot `i` sits at column `i % 4` of deck `floor(i / 4)`. */
export const ROOM_COLUMNS = 4;
export const ROOM_SLOTS = 8;
/** The modules bolted on when the house opens. */
export const STARTING_ROOMS = 4;

export interface RoomSettings {
  atmosphere: Atmosphere;
  gravity: Gravity;
  climate: Climate;
  light: Light;
}
export type RoomFactor = keyof RoomSettings;
export const ROOM_FACTORS: readonly RoomFactor[] = ["atmosphere", "gravity", "climate", "light"];

export interface RoomState {
  /** `room:<slot>`. */
  id: string;
  slot: number;
  settings: RoomSettings;
  /** A gasket kit: nothing leaks in or out through this room's walls. */
  sealed: boolean;
  /** Flare shutters: a solar flare does not reach this room. */
  shuttered: boolean;
  tenantId: string | null;
  /** What sort of module this is; absent means standard (and every room from before module types). */
  kind?: ModuleKind;
}

/** The modules the station will dock, each a different bargain. */
export const MODULE_KINDS = ["standard", "suite", "capsule", "bunker"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];
export interface ModuleKindDef {
  id: ModuleKind;
  name: string;
  blurb: string;
  /** Multiplier on the berth's price. */
  price: number;
  /** Multiplier on the tenant's cheque. */
  rent: number;
  /** Extra nightly draw on top of the module fee. */
  running: number;
  /** Comfort added (or taken) for the module itself. */
  comfort: number;
}
export const MODULE_KIND: Record<ModuleKind, ModuleKindDef> = {
  standard: { id: "standard", name: "Standard module", blurb: "The plain berth. Nothing to love, nothing to hate.", price: 1, rent: 1, running: 0, comfort: 0 },
  suite: { id: "suite", name: "Luxury suite", blurb: "Velvet curtains and a bigger porthole: comfort +10 and rent ×1.4, but it draws 12 more a night.", price: 1.5, rent: 1.4, running: 12, comfort: 10 },
  capsule: { id: "capsule", name: "Capsule pod", blurb: "Cheap and cheerful: costs 60%, rent ×0.75, and the walls are so thin the neighbours sound half as loud again.", price: 0.6, rent: 0.75, running: -4, comfort: 0 },
  bunker: { id: "bunker", name: "Shielded bunker", blurb: "Sealed and shuttered from the start: nothing leaks or flares in. No porthole, so comfort -6.", price: 1.25, rent: 1, running: 6, comfort: -6 },
};
export function moduleKindOf(room: Pick<RoomState, "kind">): ModuleKindDef {
  return MODULE_KIND[room.kind ?? "standard"];
}

export const DEFAULT_SETTINGS: RoomSettings = { atmosphere: "oxygen", gravity: "standard", climate: "temperate", light: "dim" };

/** What each change costs to make, in credits. */
export const SETTING_COST: Record<RoomFactor, number> = { atmosphere: 40, gravity: 50, climate: 20, light: 10 };
export const SEAL_COST = 60;
export const SHUTTER_COST = 30;

/** A module's price and the reputation the station wants before it docks one more, by slot. */
export const MODULE_PRICE = [0, 0, 0, 0, 320, 420, 540, 680] as const;
export const MODULE_REPUTATION = [0, 0, 0, 0, 30, 45, 60, 75] as const;

/** Nightly running cost of one room: the module's docking fee plus what its settings draw. */
export function roomRunningCost(room: RoomState): number {
  const s = room.settings;
  return 22 + moduleKindOf(room).running
    + (s.gravity === "standard" ? 0 : 4)
    + (s.climate === "temperate" ? 0 : 2)
    + (s.atmosphere === "methane" ? 2 : 0);
}

export function roomId(slot: number): string {
  return `room:${slot}`;
}

export function createRoom(slot: number, settings: Partial<RoomSettings> = {}): RoomState {
  return { id: roomId(slot), slot, settings: { ...DEFAULT_SETTINGS, ...settings }, sealed: false, shuttered: false, tenantId: null };
}

/** Rooms sharing a wall: left and right on the same deck, and the room straight above or below. */
export function neighbourSlots(slot: number): number[] {
  const col = slot % ROOM_COLUMNS;
  const deck = Math.floor(slot / ROOM_COLUMNS);
  const out: number[] = [];
  if (col > 0) out.push(slot - 1);
  if (col < ROOM_COLUMNS - 1) out.push(slot + 1);
  const other = (1 - deck) * ROOM_COLUMNS + col;
  if (other >= 0 && other < ROOM_SLOTS) out.push(other);
  return out;
}

/** Built neighbours of a room. */
export function neighboursOf(rooms: readonly RoomState[], room: RoomState): RoomState[] {
  const slots = neighbourSlots(room.slot);
  return rooms.filter((r) => slots.includes(r.slot));
}

/** The tenant-facing view of the house: who lives where, and their species. */
export interface HouseView {
  rooms: readonly RoomState[];
  speciesOf: (tenantId: string) => SpeciesId | null;
  /** Rooms a solar flare is beating on right now. */
  flare?: boolean;
  /** Extra noise a feud or a fresh egg clutch is putting into a room. */
  extraNoise?: (roomId: string) => number;
}

export interface EffectiveRoom {
  settings: RoomSettings;
  /** 0 silent · 1 quiet · 2 chatter · 3 loud · 4 racket. */
  noise: number;
  /** Air seeping in from the other side of a wall that this room does not have. */
  leakIn: Atmosphere[];
  /** Neighbours whose output reaches this room (for blame in the comfort lines). */
  sources: { tenantId: string; what: "leak" | "noise" | "heat" | "chill" | "glow" | "pull" | "spores" }[];
  /** Spores drifting in from a fungal neighbour. */
  spores?: boolean;
}

const NOISE_WORDS = ["silent", "quiet", "chatter", "loud", "racket"] as const;
export function noiseWord(level: number): string {
  return NOISE_WORDS[Math.max(0, Math.min(4, Math.round(level)))]!;
}

function shiftClimate(climate: Climate, by: number): Climate {
  const i = Math.max(0, Math.min(CLIMATES.length - 1, CLIMATES.indexOf(climate) + by));
  return CLIMATES[i]!;
}

/** What a room actually is tonight, after the walls have had their say. */
export function effectiveRoom(house: HouseView, room: RoomState): EffectiveRoom {
  const settings: RoomSettings = { ...room.settings };
  const sources: EffectiveRoom["sources"] = [];
  const leakIn: Atmosphere[] = [];
  const own = room.tenantId === null ? null : house.speciesOf(room.tenantId);
  // A tenant does not keep itself awake: only what eats noise counts in its own room.
  let noise = own === null ? 0 : Math.min(0, SPECIES[own].emits.noise);
  let heat = 0;
  let glow = 0;
  let pull = 0;
  let spores = false;
  for (const n of neighboursOf(house.rooms, room)) {
    const nSpecies = n.tenantId === null ? null : house.speciesOf(n.tenantId);
    if (nSpecies !== null) {
      const def = SPECIES[nSpecies];
      if (def.emits.noise > 0) {
        if (!room.sealed) { noise += def.emits.noise * 0.5; sources.push({ tenantId: n.tenantId!, what: "noise" }); }
      } else if (def.emits.noise < 0 && def.driftsThroughWalls) {
        noise += def.emits.noise * 0.5;
      }
      if (def.emits.glow === true && !room.shuttered) { glow = 1; sources.push({ tenantId: n.tenantId!, what: "glow" }); }
      if (def.emits.pull === true) { pull = 1; sources.push({ tenantId: n.tenantId!, what: "pull" }); }
      if (def.emits.spores === true && !room.sealed && !n.sealed) { spores = true; sources.push({ tenantId: n.tenantId!, what: "spores" }); }
      if (def.emits.glow === true && !room.shuttered) { glow = 1; sources.push({ tenantId: n.tenantId!, what: "glow" }); }
      if (def.emits.pull === true) { pull = 1; sources.push({ tenantId: n.tenantId!, what: "pull" }); }
      if (def.emits.spores === true && !room.sealed && !n.sealed) { spores = true; sources.push({ tenantId: n.tenantId!, what: "spores" }); }
      if (def.emits.heat !== undefined && def.emits.heat !== 0 && !room.sealed) {
        heat += def.emits.heat;
        sources.push({ tenantId: n.tenantId!, what: def.emits.heat > 0 ? "heat" : "chill" });
      }
    }
    // Air crosses a shared wall unless either side is sealed; vacuum has nothing to give.
    if (!room.sealed && !n.sealed && n.settings.atmosphere !== "vacuum" && n.settings.atmosphere !== room.settings.atmosphere && !leakIn.includes(n.settings.atmosphere)) {
      leakIn.push(n.settings.atmosphere);
      if (n.tenantId !== null) sources.push({ tenantId: n.tenantId, what: "leak" });
    }
  }
  noise += house.extraNoise?.(room.id) ?? 0;
  if (house.flare === true && !room.shuttered) {
    settings.light = "bright";
    heat += 1;
  }
  settings.climate = shiftClimate(settings.climate, Math.max(-1, Math.min(1, heat)));
  if (glow > 0) settings.light = LIGHTS[Math.min(LIGHTS.length - 1, LIGHTS.indexOf(settings.light) + 1)]!;
  if (pull > 0) settings.gravity = GRAVITIES[Math.min(GRAVITIES.length - 1, GRAVITIES.indexOf(settings.gravity) + 1)]!;
  // Capsule modules have thin walls: everything next door is half as loud again.
  if (room.kind === "capsule") noise *= 1.5;
  return { settings, noise: Math.max(0, Math.min(4, Math.round(noise * 2) / 2)), leakIn, sources, spores };
}

export interface ComfortReason {
  factor: RoomFactor | "noise" | "leak" | "spores" | "module";
  penalty: number;
  text: string;
}

export interface Comfort {
  score: number;
  reasons: ComfortReason[];
  /** For two-headed tenants: the second head's score (it signs the second cheque). */
  second?: number;
}

function factorPenalty<T extends string>(want: FactorWant<T>, value: T): number {
  if (want.likes.includes(value)) return 0;
  if (want.tolerates?.includes(value)) return Math.round(want.penalty * 0.35);
  return want.penalty;
}

/** How a species likes a room as it effectively is, with the reasons in its own words. */
export function comfortIn(species: SpeciesDef, room: EffectiveRoom): Comfort {
  const reasons: ComfortReason[] = [];
  const add = (factor: ComfortReason["factor"], penalty: number, text: string) => { if (penalty > 0) reasons.push({ factor, penalty, text }); };
  const s = room.settings;
  add("atmosphere", factorPenalty(species.air, s.atmosphere), species.lines.complaint.air);
  add("gravity", factorPenalty(species.gravity, s.gravity), species.lines.complaint.gravity);
  add("climate", factorPenalty(species.climate, s.climate), species.lines.complaint.climate);
  const lightPenalty = factorPenalty(species.light, s.light);
  add("light", lightPenalty, species.lines.complaint.light);
  if (room.noise > species.quiet) add("noise", Math.round((room.noise - species.quiet) * species.noisePenalty), species.lines.complaint.noise);
  // A whiff of the wrong air through the wall: a breather minds it, a rock or a robot does not.
  const badLeak = room.leakIn.some((air) => !species.air.likes.includes(air) && species.air.penalty > 0);
  if (badLeak) add("leak", Math.round(species.air.penalty * 0.4), species.lines.complaint.leak);
  if (room.spores === true && species.fungal !== true && species.air.penalty > 0) add("spores", 12, "Achoo! Something mushroomy is drifting through the wall.");
  if (room.spores === true && species.fungal !== true && species.air.penalty > 0) add("spores", 12, "Achoo! Something mushroomy is drifting through the wall.");
  const total = reasons.reduce((sum, r) => sum + r.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - total));
  if (species.secondHeadLight === undefined) return { score, reasons };
  const second = Math.max(0, Math.min(100, score + lightPenalty - factorPenalty(species.secondHeadLight, s.light)));
  return { score, reasons, second };
}

export function comfortWord(score: number): string {
  if (score >= 80) return "Delighted";
  if (score >= 55) return "Comfortable";
  if (score >= 30) return "Grumbling";
  return "Miserable";
}

/** Stars a tenant would write tonight, 1–5. */
export function starsFor(score: number): number {
  return score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : 1;
}

/** Share of the cheque a tenant pays at this comfort: a tip when delighted, almost nothing when miserable. */
export function rentShare(score: number): number {
  return score >= 80 ? 1.15 : score >= 55 ? 1 : score >= 30 ? 0.6 : 0.25;
}

/** The settings a species would pick for itself, cheapest acceptable where it does not care. */
export function idealSettings(species: SpeciesDef): RoomSettings {
  const pick = <T extends string>(want: FactorWant<T>, fallback: T): T => (want.likes.includes(fallback) ? fallback : want.likes[0]!);
  return {
    atmosphere: pick(species.air, "oxygen"),
    gravity: pick(species.gravity, "standard"),
    climate: pick(species.climate, "temperate"),
    light: pick(species.light, "dim"),
  };
}

/** Pairs of tenants sharing a wall where one of them is hurt by what the other puts out. */
export function wallFriction(house: HouseView, a: RoomState, b: RoomState): number {
  if (a.tenantId === null || b.tenantId === null) return 0;
  let friction = 0;
  for (const [mine, theirs] of [[a, b], [b, a]] as const) {
    const species = house.speciesOf(mine.tenantId!);
    if (species === null) continue;
    const def = SPECIES[species];
    const room = effectiveRoom(house, mine);
    const blamed = room.sources.filter((s) => s.tenantId === theirs.tenantId);
    for (const source of blamed) {
      if (source.what === "leak" && !def.air.likes.includes(theirs.settings.atmosphere) && def.air.penalty > 0) friction += 1;
      if (source.what === "noise" && room.noise > def.quiet) friction += 1;
      if (source.what === "heat" && !def.climate.likes.includes(room.settings.climate)) friction += 0.5;
      if (source.what === "chill" && !def.climate.likes.includes(room.settings.climate)) friction += 0.5;
    }
  }
  return friction;
}
