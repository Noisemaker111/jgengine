/**
 * The tide clock: Mainsail floods every night. This is the model only (no scene, no browser): what the
 * water level is at an hour, which stage of the night that is, how deep each district sits under it,
 * and what that depth means for a rider, a boat, a blimp and the customer's door.
 *
 * The level is metres above the city floor (the districts are flattened to one floor height). A
 * district's sill is how high the water must climb before its streets start to wet: the docks sit
 * lowest and drown first, the beach boulevard next, downtown last, and Palm Heights is a hill the
 * water never reaches. Depth at a point is the level less its district's sill.
 */

/** When the pizzeria takes orders: dusk to midnight. */
export const SHIFT_START_HOUR = 18;
export const SHIFT_END_HOUR = 24;
/** The clock the "sleep till dusk" skip lands on: the minute the doors open. */
export const DUSK_HOUR = 18;

/** The tide curve as (hour, level) knots; between knots the level runs linearly. */
const TIDE_KNOTS: readonly (readonly [number, number])[] = [
  [0, 2.0],
  [3, 0],
  [17.5, 0],
  [18, 0.15],
  [19.5, 0.62],
  [21, 1.18],
  [22.5, 1.72],
  [24, 2.0],
];

/** Water level in metres above the city floor at `hour` (0–24, fractional). */
export function tideLevelAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < TIDE_KNOTS.length; i += 1) {
    const [h1, l1] = TIDE_KNOTS[i]!;
    const [h0, l0] = TIDE_KNOTS[i - 1]!;
    if (h <= h1) return l0 + ((l1 - l0) * (h - h0)) / Math.max(1e-6, h1 - h0);
  }
  return TIDE_KNOTS.at(-1)![1];
}

export type TideStageId = "low" | "wet" | "canal" | "high" | "king";

export interface TideStage {
  id: TideStageId;
  index: number;
  label: string;
  /** Level (m) the stage starts at. */
  from: number;
  /** The one line the radio and the pager say when the water reaches it. */
  note: string;
}

export const TIDE_STAGES: readonly TideStage[] = [
  { id: "low", index: 0, label: "Low tide", from: -1, note: "The streets are dry. Scooter weather." },
  { id: "wet", index: 1, label: "Wet feet", from: 0.1, note: "The docks are wetting. Splashing soaks the boxes." },
  { id: "canal", index: 2, label: "Canal hour", from: 0.45, note: "Port Carmine is a canal now. Scooters stall there; boats float." },
  { id: "high", index: 3, label: "High water", from: 1.1, note: "The boulevard has gone under. Swap to a boat at the docks." },
  { id: "king", index: 4, label: "King tide", from: 1.65, note: "Everything but the Heights is water. Boats, bridges and the blimp line only." },
];

export function stageAt(level: number): TideStage {
  let stage = TIDE_STAGES[0]!;
  for (const candidate of TIDE_STAGES) if (level >= candidate.from) stage = candidate;
  return stage;
}

/** Where the water climbs first. Districts not listed (Palm Heights) never flood. */
export const FLOOD_SILLS: Readonly<Record<string, number>> = {
  port_carmine: 0,
  mainsail_boulevard: 0.55,
  downtown: 1.1,
};

/** The deepest a flooded street gets: the canal's own floor, whatever the tide does past it. */
export const MAX_DEPTH = 1.6;

/** Water depth (m) over a district's streets at `level`; 0 for a district that never floods or none at all. */
export function districtDepth(districtId: string | null, level: number): number {
  if (districtId === null) return 0;
  const sill = FLOOD_SILLS[districtId];
  if (sill === undefined) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, level - sill));
}

/** What a depth means for the street. */
export type StreetState = "dry" | "splash" | "canal";
/** Ankle water: a scooter still runs but every splash soaks the boxes. */
export const SPLASH_DEPTH = 0.12;
/** Past this a road engine drowns and a hull floats. */
export const CANAL_DEPTH = 0.45;

export function streetState(depth: number): StreetState {
  if (depth >= CANAL_DEPTH) return "canal";
  if (depth >= SPLASH_DEPTH) return "splash";
  return "dry";
}

/** How a vehicle meets the water: wheels on the street, a hull on the water, or a gondola car in the air. */
export type VehicleClass = "road" | "water" | "air" | "foot";

export interface WaterEffect {
  /** Fraction of speed kept per second (1 = no drag). */
  keepPerSecond: number;
  /** The engine is drowned or the hull is aground: the pager says so. */
  stuck: boolean;
  /** Soak added to every box carried, per second, at the speed given. */
  soakPerSecond: number;
  /** A one-word reason the dash shows. */
  label: string;
}

/**
 * What the water at `depth` does to a vehicle class moving at `speedKmh`. `openSea` is the bay past the
 * beach, where a hull floats whatever the tide and a road vehicle has no business being.
 */
export function waterEffect(kind: VehicleClass, depth: number, speedKmh: number, openSea = false): WaterEffect {
  const state = openSea ? "canal" : streetState(depth);
  const fast = Math.max(0, speedKmh - 15) / 30;
  if (kind === "air") return { keepPerSecond: 1, stuck: false, soakPerSecond: 0, label: "" };
  if (kind === "water") {
    if (state === "canal") return { keepPerSecond: 1, stuck: false, soakPerSecond: Math.max(0, speedKmh - 30) * 0.06, label: "" };
    // A hull on a wet street grinds; on dry stone it barely moves.
    return state === "splash"
      ? { keepPerSecond: 0.35, stuck: true, soakPerSecond: 0, label: "AGROUND" }
      : { keepPerSecond: 0.08, stuck: true, soakPerSecond: 0, label: "BEACHED" };
  }
  if (kind === "foot") {
    if (state === "dry") return { keepPerSecond: 1, stuck: false, soakPerSecond: 0, label: "" };
    return { keepPerSecond: 1, stuck: false, soakPerSecond: state === "canal" ? 4 : 1.5, label: state === "canal" ? "WADING" : "" };
  }
  if (state === "canal") return { keepPerSecond: 0.12, stuck: true, soakPerSecond: 3 + fast * 4, label: "ENGINE DROWNED" };
  if (state === "splash") return { keepPerSecond: 0.82, stuck: false, soakPerSecond: fast * 6, label: "SPLASHING" };
  return { keepPerSecond: 1, stuck: false, soakPerSecond: 0, label: "" };
}

/** Where the customer takes the box: as the water climbs, deliveries move upstairs. */
export type DropFloor = "door" | "balcony" | "rooftop";

export function dropFloor(depth: number): DropFloor {
  if (depth >= 0.9) return "rooftop";
  if (depth >= SPLASH_DEPTH) return "balcony";
  return "door";
}

/** How far above the street the customer leans out to take the box, for the drop beacon. */
export const FLOOR_HEIGHT: Readonly<Record<DropFloor, number>> = { door: 0, balcony: 3.4, rooftop: 9 };

/** The extra the customer adds for coming up to meet them. */
export const FLOOR_TIP: Readonly<Record<DropFloor, number>> = { door: 0, balcony: 0.1, rooftop: 0.25 };

/** Whether a shift is running at `hour`. */
export function shiftOpen(hour: number): boolean {
  return hour >= SHIFT_START_HOUR && hour < SHIFT_END_HOUR;
}

/** Game hours from `hour` until the doors next open (a whole day when they just did). */
export function hoursUntilDusk(hour: number): number {
  const ahead = (DUSK_HOUR - hour + 24) % 24;
  return ahead < 0.05 ? 24 : ahead;
}
