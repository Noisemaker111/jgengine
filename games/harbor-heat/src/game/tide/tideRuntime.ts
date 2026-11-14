import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { DISTRICTS } from "../world/districts";
import { districtDepth, MAX_DEPTH, shiftOpen, stageAt, tideLevelAt, type TideStage, type TideStageId } from "./tide";

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
}

/** HUD mirror of the tide; derived from the clock every tick, so it never needs saving. */
export const tideStore = defineStore<TideSnapshot | null>("harbor.tide", null);

interface TideRuntime {
  level: number;
  stage: TideStageId | null;
  /** Ground height under each sheet's centre: the flood starts from the district's own floor. */
  floors: Map<string, number>;
  /** The y each sheet was last placed at, so it only moves when the water does. */
  placed: Map<string, number>;
}

const runtimes = perContext((): TideRuntime => ({ level: 0, stage: null, floors: new Map(), placed: new Map() }));

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

function insideSheet(sheet: FloodSheet, x: number, z: number): boolean {
  const dx = (x - sheet.center[0]) / sheet.rx;
  const dz = (z - sheet.center[1]) / sheet.rz;
  return dx * dx + dz * dz <= 1;
}

/** The water level now, in metres above the city floor. */
export function tideLevel(ctx: GameContext): number {
  return tideLevelAt(ctx.time.calendar().hour + ctx.time.calendar().minute / 60);
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
  const level = tideLevelAt(hour);
  runtime.level = level;
  syncSheets(ctx, level);
  const stage = stageAt(level);
  const rose = runtime.stage !== null && runtime.stage !== stage.id && stage.index > 0;
  if (rose) ctx.game.audio.play("tide_bell");
  if (rose) ctx.game.notices.push({ text: `${stage.label.toUpperCase()} · ${stage.note}`, tone: stage.index >= 3 ? "warn" : "info" });
  runtime.stage = stage.id;
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
  });
  return rose ? stage : null;
}

/** Forget the sheet bookkeeping after a reload: the next tick re-places them from the clock. */
export function resetTide(ctx: GameContext): void {
  const runtime = runtimes(ctx);
  runtime.placed.clear();
  runtime.stage = null;
}
