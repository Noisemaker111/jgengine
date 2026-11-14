import { TRAIL_FLOOR, TRAIL_MAX } from "./tuning";

/**
 * Pheromone trails — LAWN ORDER's signature mechanic, as pure data.
 *
 * The yard is a grid of scent cells. Hauling workers lay scent on every cell they walk, and the
 * commander can paint a Pheromone Line between two points. Scent fades on its own (rain makes it fade
 * far faster), the sprinkler's jet washes it out where it lands, and every red ant walks faster on a
 * strong trail. Nothing here touches the scene or the renderer: `units.ts` reads strength for speed,
 * `systems.ts` lays, decays and washes, and `world/PheromoneTrails.draw.ts` paints the cells.
 */

export interface TrailBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface TrailField {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  /** Scent per cell, row-major, 0..TRAIL_MAX. */
  readonly scent: Float32Array;
  /** Bumped on every change so a renderer can skip unchanged frames. */
  version: number;
}

export function createTrailField(bounds: TrailBounds, cell: number): TrailField {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  return { cell, cols, rows, minX: bounds.minX, minZ: bounds.minZ, scent: new Float32Array(cols * rows), version: 0 };
}

function cellIndex(field: TrailField, x: number, z: number): number {
  const col = Math.floor((x - field.minX) / field.cell);
  const row = Math.floor((z - field.minZ) / field.cell);
  if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) return -1;
  return row * field.cols + col;
}

/** The world centre of cell `index`. */
export function cellCentre(field: TrailField, index: number): { x: number; z: number } {
  const col = index % field.cols;
  const row = Math.floor(index / field.cols);
  return { x: field.minX + (col + 0.5) * field.cell, z: field.minZ + (row + 0.5) * field.cell };
}

/** Scent at a world point (0 off the grid). */
export function scentAt(field: TrailField, x: number, z: number): number {
  const i = cellIndex(field, x, z);
  return i < 0 ? 0 : field.scent[i]!;
}

/** Add scent to the cell under a point, capped at TRAIL_MAX. */
export function deposit(field: TrailField, x: number, z: number, amount: number): void {
  const i = cellIndex(field, x, z);
  if (i < 0 || amount <= 0) return;
  const next = Math.min(TRAIL_MAX, field.scent[i]! + amount);
  if (next === field.scent[i]) return;
  field.scent[i] = next;
  field.version += 1;
}

/**
 * Paint a straight line of scent from A to B, at least `strength` on every cell it crosses. Returns
 * how many cells it touched, so a caller can refuse an empty line. The line is clipped to `maxLength`
 * from A, so one order cannot scent the whole yard.
 */
export function paintLine(field: TrailField, ax: number, az: number, bx: number, bz: number, strength: number, maxLength = Infinity): number {
  let dx = bx - ax;
  let dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length > maxLength) {
    dx *= maxLength / length;
    dz *= maxLength / length;
  }
  const span = Math.min(length, maxLength);
  const steps = Math.max(1, Math.ceil(span / (field.cell * 0.5)));
  const touched = new Set<number>();
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const i = cellIndex(field, ax + dx * t, az + dz * t);
    if (i < 0) continue;
    touched.add(i);
    if (field.scent[i]! < strength) field.scent[i] = Math.min(TRAIL_MAX, strength);
  }
  if (touched.size > 0) field.version += 1;
  return touched.size;
}

/** Fade every cell: scent halves every `halfLife / multiplier` seconds and clears below the floor. */
export function decayTrails(field: TrailField, dt: number, halfLife: number, multiplier = 1): void {
  if (dt <= 0) return;
  const keep = Math.pow(0.5, (dt * multiplier) / halfLife);
  let changed = false;
  for (let i = 0; i < field.scent.length; i += 1) {
    const value = field.scent[i]!;
    if (value === 0) continue;
    const next = value * keep;
    field.scent[i] = next < TRAIL_FLOOR ? 0 : next;
    changed = true;
  }
  if (changed) field.version += 1;
}

/** Clear every cell whose centre `wet` says is under water. Returns how many cells were washed. */
export function washTrails(field: TrailField, wet: (x: number, z: number) => boolean): number {
  let washed = 0;
  for (let i = 0; i < field.scent.length; i += 1) {
    if (field.scent[i] === 0) continue;
    const { x, z } = cellCentre(field, i);
    if (!wet(x, z)) continue;
    field.scent[i] = 0;
    washed += 1;
  }
  if (washed > 0) field.version += 1;
  return washed;
}

/** Every scented cell, for the renderer and the minimap. */
export function scentedCells(field: TrailField): { x: number; z: number; scent: number }[] {
  const out: { x: number; z: number; scent: number }[] = [];
  for (let i = 0; i < field.scent.length; i += 1) {
    const scent = field.scent[i]!;
    if (scent <= 0) continue;
    out.push({ ...cellCentre(field, i), scent });
  }
  return out;
}

/** Speed multiplier a red ant gets from the scent under it: 1 on bare ground up to 1 + bonus. */
export function trailSpeedFactor(scent: number, bonus: number): number {
  return 1 + Math.max(0, Math.min(TRAIL_MAX, scent)) * bonus;
}

/**
 * Alarm pheromone: when a red ant dies it bursts a cloud of alarm scent, and every red ant inside it
 * bites harder for a few seconds — the colony gets angry where it bleeds. Pure records with an expiry
 * on the battle clock; the death handler raises them, `units.ts` reads them, the overlay draws rings.
 */
export interface AlarmPulse {
  x: number;
  z: number;
  /** Battle second it was raised, and when it fades. */
  at: number;
  until: number;
}

export const ALARM_RADIUS = 9;
export const ALARM_SECONDS = 5;
export const ALARM_DAMAGE_BONUS = 0.25;
/** At most this many clouds live at once; the oldest drops first. */
export const ALARM_CAP = 24;

export function raiseAlarm(alarms: AlarmPulse[], x: number, z: number, now: number): void {
  alarms.push({ x, z, at: now, until: now + ALARM_SECONDS });
  while (alarms.length > ALARM_CAP) alarms.shift();
}

/** Drop the clouds that have faded by `now`. */
export function pruneAlarms(alarms: AlarmPulse[], now: number): void {
  for (let i = alarms.length - 1; i >= 0; i -= 1) if (alarms[i]!.until <= now) alarms.splice(i, 1);
}

/** Damage multiplier a red ant at a point gets from live alarm clouds (they do not stack). */
export function alarmDamageFactor(alarms: readonly AlarmPulse[], x: number, z: number, now: number): number {
  for (const alarm of alarms) {
    if (alarm.until > now && Math.hypot(alarm.x - x, alarm.z - z) <= ALARM_RADIUS) return 1 + ALARM_DAMAGE_BONUS;
  }
  return 1;
}
