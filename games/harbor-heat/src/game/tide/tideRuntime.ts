import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { DISTRICTS } from "../world/districts";
import { nightRules } from "../pizza/nights";
import { upgradeRank } from "../progression/upgrades";
import { objectById } from "../objects/catalog";
import { districtDepth, MAX_DEPTH, minutesToNextStage, shiftOpen, stageAt, tideLevelAt, type TideStage, type TideStageId } from "./tide";

/**
 * The tide in the running city: the level read off the world clock, the flood sheets that rise with
 * it over each district, the water a vehicle or a rider is standing in, and the notice when a new
 * stage arrives. The model's numbers live in `tide.ts`; this file only reads the clock and the scene.
 */

/** The bay's resting surface (`world.ts` ocean level): past the beach a hull floats whatever the tide. */
export const OCEAN_LEVEL = -0.4;

/**
 * Each flooding district's sheet, as an ellipse that stays on its own side of the shore so the city's
 * flood never hangs over the bay. Centres and radii follow the authored district volumes.
 */
export interface FloodSheet {
  district: string;
  center: readonly [number, number];
  rx: number;
  rz: number;
}

function sheetFor(id: string, clipWest?: number): FloodSheet | null {
  const district = DISTRICTS.find((d) => d.id === id);
  if (district === undefined) return null;
  const [cx, cz] = district.center;
  if (clipWest === undefined || cx - district.radius >= clipWest) return { district: id, center: [cx, cz], rx: district.radius, rz: district.radius };
  const east = cx + district.radius * 0.55;
  const rx = (east - clipWest) / 2;
  return { district: id, center: [clipWest + rx, cz], rx, rz: district.radius };
}

/** The beach line the boulevard's flood stops at; west of it is the bay. */
const SHORE_CLIP = -207;

export const FLOOD_SHEETS: readonly FloodSheet[] = [
  sheetFor("port_carmine"),
  sheetFor("mainsail_boulevard", SHORE_CLIP),
  sheetFor("downtown"),
].filter((sheet): sheet is FloodSheet => sheet !== null);

export interface TideSnapshot {
  level: number;
  stage: TideStageId;
  stageIndex: number;
  stageLabel: string;
  note: string;
  hour: number;
  minute: number;
  open: boolean;
  /** Depth over each flooding district's streets, by district id. */
  depths: Record<string, number>;
  /** The next stage and the game minutes until it, while the water is still rising. */
  next: { label: string; minutes: number } | null;
}

/** HUD mirror of the tide; derived from the clock every tick, so it never needs saving. */
export const tideStore = defineStore<TideSnapshot | null>("harbor.tide", null);

interface TideRuntime {
  /** The stage the ten-minute warning was last given for. */
  warned: TideStageId | null;
  level: number;
  stage: TideStageId | null;
  /** Ground height under each sheet's centre: the flood starts from the district's own floor. */
  floors: Map<string, number>;
  /** The y each sheet was last placed at, so it only moves when the water does. */
  placed: Map<string, number>;
}

const runtimes = perContext((): TideRuntime => ({ warned: null, level: 0, stage: null, floors: new Map(), placed: new Map() }));

const sheetId = (district: string) => `tide_sheet_${district}`;

function floorOf(ctx: GameContext, sheet: FloodSheet): number {
  const runtime = runtimes(ctx);
  let floor = runtime.floors.get(sheet.district);
  if (floor === undefined) {
    floor = ctx.world.groundHeightAt(sheet.center[0], sheet.center[1]);
    runtime.floors.set(sheet.district, floor);
  }
  return floor;
}

/** The sheet's outline is a squircle, |x|^4 + |z|^4 = 1 (`tide-water.glb`), so its edges follow the street grid. */
export const SHEET_POWER = 4;

function insideSheet(sheet: FloodSheet, x: number, z: number): boolean {
  const dx = (x - sheet.center[0]) / sheet.rx;
  const dz = (z - sheet.center[1]) / sheet.rz;
  return Math.pow(Math.abs(dx), SHEET_POWER) + Math.pow(Math.abs(dz), SHEET_POWER) <= 1;
}

/** Points around a sheet's outline, for the chart. */
export function sheetOutline(sheet: FloodSheet, segments = 32): [number, number][] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    return [sheet.center[0] + Math.sign(c) * Math.pow(Math.abs(c), 2 / SHEET_POWER) * sheet.rx, sheet.center[1] + Math.sign(s) * Math.pow(Math.abs(s), 2 / SHEET_POWER) * sheet.rz];
  });
}

/** The water level now, in metres above the city floor. */
export function tideLevel(ctx: GameContext): number {
  return runtimes(ctx).level;
}

export interface WaterHere {
  /** World y of the water surface. */
  surface: number;
  /** Water over the ground at this point. */
  depth: number;
  /** The bay past the beach, not a flooded street. */
  openSea: boolean;
}

/** The water at a point, or null on dry ground: the bay below the beach, or a district's flood. */
export function waterAt(ctx: GameContext, x: number, z: number): WaterHere | null {
  const ground = ctx.world.groundHeightAt(x, z);
  if (ground < OCEAN_LEVEL - 0.05) return { surface: OCEAN_LEVEL, depth: OCEAN_LEVEL - ground, openSea: true };
  const level = runtimes(ctx).level;
  let best: WaterHere | null = null;
  for (const sheet of FLOOD_SHEETS) {
    if (!insideSheet(sheet, x, z)) continue;
    const depth = districtDepth(sheet.district, level);
    if (depth <= 0) continue;
    const surface = floorOf(ctx, sheet) + depth;
    if (surface <= ground) continue;
    if (best === null || surface > best.surface) best = { surface, depth: surface - ground, openSea: false };
  }
  return best;
}

/** Place, lift or take away each district's flood sheet; it only moves when the water has. */
function syncSheets(ctx: GameContext, level: number): void {
  const runtime = runtimes(ctx);
  for (const sheet of FLOOD_SHEETS) {
    const depth = districtDepth(sheet.district, level);
    const id = sheetId(sheet.district);
    const existing = ctx.scene.object.get(id);
    if (depth < 0.02) {
      if (existing !== null) ctx.scene.object.remove(id);
      runtime.placed.delete(sheet.district);
      continue;
    }
    const y = floorOf(ctx, sheet) + Math.min(MAX_DEPTH, depth);
    if (existing === null) {
      ctx.scene.object.place("obj_tide_water", sheet.center[0], y, sheet.center[1], {
        instanceId: id,
        onExisting: "replace",
        visual: { scale: [sheet.rx, 1, sheet.rz] },
      });
      ctx.scene.object.setColliders(id, {});
      runtime.placed.set(sheet.district, y);
    } else if (Math.abs((runtime.placed.get(sheet.district) ?? -99) - y) > 0.015) {
      ctx.scene.object.move(id, sheet.center[0], y, sheet.center[1]);
      runtime.placed.set(sheet.district, y);
    }
  }
}

/** Read the clock, raise the water, and say so when the night reaches a new stage; returns that stage, else null. */
export function tickTide(ctx: GameContext): TideStage | null {
  const runtime = runtimes(ctx);
  const calendar = ctx.time.calendar();
  const hour = calendar.hour + calendar.minute / 60;
  // A storm surge runs the water higher all night; it comes in with the evening tide.
  const level = tideLevelAt(hour) + (tideLevelAt(hour) > 0 ? (nightRules(ctx)?.surge ?? 0) : 0);
  runtime.level = level;
  syncSheets(ctx, level);
  const stage = stageAt(level);
  const rose = runtime.stage !== null && runtime.stage !== stage.id && stage.index > 0;
  if (rose) ctx.game.audio.play("tide_bell");
  if (rose) ctx.game.notices.push({ text: `${stage.label.toUpperCase()} · ${stage.note}`, tone: stage.index >= 3 ? "warn" : "info" });
  runtime.stage = stage.id;
  // The tell: ten game minutes before the water reaches a stage that closes roads, the city says so.
  const next = minutesToNextStage(hour, nightRules(ctx)?.surge ?? 0);
  const lead = upgradeRank(ctx, "house_wire") > 0 ? 25 : 10;
  if (next !== null && next.stage.index >= 2 && next.minutes <= lead && runtime.warned !== next.stage.id) {
    runtime.warned = next.stage.id;
    ctx.game.notices.push({ text: `The tide reaches ${next.stage.label} in ${next.minutes} minutes. ${next.stage.note}`, tone: "warn" });
  }
  tideStore.write(ctx, {
    level,
    stage: stage.id,
    stageIndex: stage.index,
    stageLabel: stage.label,
    note: stage.note,
    hour: calendar.hour,
    minute: calendar.minute,
    open: shiftOpen(hour),
    depths: Object.fromEntries(FLOOD_SHEETS.map((sheet) => [sheet.district, districtDepth(sheet.district, level)])),
    next: next === null ? null : { label: next.stage.label, minutes: next.minutes },
  });
  return rose ? stage : null;
}

const rippleClock = perContext(() => ({ t: 0, n: 0 }));
/** Seconds between ripple rings, and how far from the rider they land. */
const RIPPLE_EVERY = 0.22;
const RIPPLE_REACH = 26;

/**
 * Life on the flood: rain rings and lapping rings on the water around the rider, most of them where
 * the water meets something standing in it (a wall, a post, a parked car), so the sheet reads as
 * moving water around the kerbs instead of one flat plane.
 */
export function tickRipples(ctx: GameContext, dt: number): void {
  const clock = rippleClock(ctx);
  clock.t -= dt;
  if (clock.t > 0 || runtimes(ctx).level <= 0.05) return;
  clock.t = RIPPLE_EVERY;
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  clock.n += 1;
  const a = Math.sin(clock.n * 12.9898) * 43758.5453;
  const angle = (a - Math.floor(a)) * Math.PI * 2;
  const b = Math.sin(clock.n * 78.233) * 12543.123;
  const reach = 4 + (b - Math.floor(b)) * RIPPLE_REACH;
  let x = player.position[0] + Math.cos(angle) * reach;
  let z = player.position[2] + Math.sin(angle) * reach;
  let radius = 0.9;
  // Lap against the nearest thing standing in the water, at its edge.
  for (const object of ctx.scene.object.inBox([x - 6, -5, z - 6], [x + 6, 30, z + 6])) {
    const def = objectById(object.catalogId);
    if (def === undefined || !def.solid) continue;
    const scale = (object as { visual?: { scale?: readonly number[] } }).visual?.scale;
    const hw = (def.footprint.w / 2) * (scale?.[0] ?? 1);
    const hd = (def.footprint.d / 2) * (scale?.[2] ?? 1);
    const ex = Math.max(-hw, Math.min(hw, x - object.position[0]));
    const ez = Math.max(-hd, Math.min(hd, z - object.position[2]));
    x = object.position[0] + ex + Math.sign(x - object.position[0] - ex || 1) * 0.4;
    z = object.position[2] + ez + Math.sign(z - object.position[2] - ez || 1) * 0.4;
    radius = 1.6;
    break;
  }
  const water = waterAt(ctx, x, z);
  if (water === null || water.openSea || water.depth < 0.2) return;
  ctx.scene.entity.vfx({ kind: "nova", color: 0xbff4ee, from: [x, water.surface + 0.03, z], radius });
}

/** Forget the sheet bookkeeping after a reload: the next tick re-places them from the clock. */
export function resetTide(ctx: GameContext): void {
  const runtime = runtimes(ctx);
  runtime.placed.clear();
  runtime.stage = null;
}
