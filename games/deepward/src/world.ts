import { environment } from "@jgengine/core/world/features";
import type { EditorDocument, EditorMarker, EditorVolume } from "@jgengine/core/editor/types";
import authored from "./editor.scene.json";
import { isStratum, type Stratum } from "./game/strata";
import { clutterFootprint, planFloorDressing, type FloorDressing, type FloorRect } from "./game/interiorPlan";

export type Point = readonly [number, number, number];
/** Marrow, or one stratum of Bellwether. Each is its own authored floor plan in the one scene. */
export type Place = "home" | Stratum;
export function isPlace(value: unknown): value is Place { return value === "home" || isStratum(value); }
export interface Room { id: string; name: string; x: number; z: number; w: number; d: number; place: Place }

// This document is the verbatim export of the official editor RPC session.
// Stable IDs link gameplay to it; no second set of placement coordinates exists here.
export const editorLayers = authored as unknown as EditorDocument;
if (editorLayers.version !== 1) throw new Error("Deepward scene has an unsupported editor version");
const ids = [...editorLayers.markers, ...editorLayers.volumes].map(entry => entry.id);
if (new Set(ids).size !== ids.length) throw new Error("Deepward scene has duplicate stable IDs");
if (!editorLayers.terrain) throw new Error("Deepward scene is missing its authored terrain");
export const WORLD_BOUNDS = editorLayers.terrain.bounds;
if (!Object.values(WORLD_BOUNDS).every(Number.isFinite) || WORLD_BOUNDS.minX >= WORLD_BOUNDS.maxX || WORLD_BOUNDS.minZ >= WORLD_BOUNDS.maxZ) throw new Error("Deepward scene has invalid terrain bounds");
export const DECOR = editorLayers.markers.filter(entry => entry.kind === "deepward-decor");
export function decorPoint(id: string): [number, number, number] { return [...point(marker(id))]; }
function marker(id: string): EditorMarker {
  const entry = editorLayers.markers.find(item => item.id === id);
  if (!entry || !Object.values(entry.position).every(Number.isFinite)) throw new Error(`Deepward scene missing valid marker: ${id}`);
  return entry;
}
function point(entry: EditorMarker): Point { return [entry.position.x, entry.position.y, entry.position.z]; }
function footprint(entry: EditorVolume) {
  const half = entry.halfExtents;
  if (entry.shape !== "box" || !half || !Object.values(half).every(value => Number.isFinite(value) && value > 0) || !Object.values(entry.center).every(Number.isFinite)) throw new Error(`Deepward requires an authored box: ${entry.id}`);
  return { id: entry.id, x: entry.center.x, z: entry.center.z, w: half.x * 2, d: half.z * 2 };
}
export const ROOMS: readonly Room[] = editorLayers.volumes.filter(entry => entry.kind === "deepward-room").map(entry => {
  const place = entry.meta?.place;
  if (!isPlace(place)) throw new Error(`Deepward room missing place: ${entry.id}`);
  return { ...footprint(entry), name: entry.label ?? entry.id, place };
});
if (ROOMS.length === 0) throw new Error("Deepward has no authored rooms");
export const HOME_SPAWN = point(marker("spawn-marrow"));
export const VAULT_SPAWN = point(marker("spawn-bellwether"));
export const GARAGE = point(marker("rail-garage"));
export const STASH = point(marker("stash-marrow"));
export const EXIT = point(marker("rail-extraction"));
function reach(id: string): number {
  const value = marker(id).meta?.reach;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Deepward anchor lacks an interaction reach: ${id}`);
  return value;
}
export const GARAGE_REACH = reach("rail-garage");
export const STASH_REACH = reach("stash-marrow");
export const EXIT_REACH = reach("rail-extraction");
export const RETURN_SPINE = ROOMS.find(room => room.id === "room-return-spine");
if (!RETURN_SPINE) throw new Error("Deepward scene is missing the return spine");
const receiving = ROOMS.find(room => room.id === "room-rail-receiving");
if (!receiving) throw new Error("Deepward scene is missing rail receiving");
export const RECEIVING_BACK_Z = receiving.z - receiving.d / 2;
const printMarker = marker("spawn-bellwether-fitter");
if (typeof printMarker.meta?.entityId !== "string") throw new Error("Deepward printer spawn lacks its entity ID");
export const PRINT_ID = printMarker.meta.entityId;
export const PRINT_SPAWN = point(printMarker);
const steamVolume = editorLayers.volumes.find(entry => entry.id === "hazard-steam-printhouse");
if (!steamVolume) throw new Error("Deepward scene is missing steam volume");
export const STEAM = footprint(steamVolume);
export type SalvageKind = "wire" | "polymer" | "cells" | "ink";
const isSalvage = (kind: unknown): kind is SalvageKind => kind === "wire" || kind === "polymer" || kind === "cells" || kind === "ink";
/** Where an entry stands; entries authored before the strata existed are in receiving. */
function placeOf(entry: { id: string; meta?: Record<string, unknown> }, fallback: Place = "vault"): Place {
  const place = entry.meta?.place ?? fallback;
  if (!isPlace(place)) throw new Error(`Deepward entry names an unknown place: ${entry.id}`);
  return place;
}
export const SALVAGE = editorLayers.markers.filter(entry => entry.kind === "deepward-loot").map(entry => {
  const id = entry.meta?.sourceId, kind = entry.meta?.itemId;
  if (typeof id !== "string" || !isSalvage(kind)) throw new Error(`Deepward loot has unknown acquisition identity: ${entry.id}`);
  return { id, kind, at: point(entry), label: entry.label ?? entry.id, place: placeOf(entry) };
});
if (new Set(SALVAGE.map(entry => entry.id)).size !== SALVAGE.length) throw new Error("Deepward loot source IDs must be unique");
/** Bearing columns and cabinets are solid only where the editor says so. */
export const STATION_SOLIDS = editorLayers.volumes.filter(entry => entry.kind === "deepward-structure" && entry.meta?.solid === true).map(entry => ({ ...footprint(entry), place: entry.meta?.place }));
export const PROPS = editorLayers.volumes.filter(entry => entry.kind === "deepward-machine").map(footprint);

const slug = /^[a-z0-9][a-z0-9-]*$/;
function stratumOf(entry: EditorMarker | EditorVolume): Stratum {
  const place = placeOf(entry);
  if (place === "home") throw new Error(`Deepward ${entry.kind} must stand in Bellwether: ${entry.id}`);
  return place;
}
function idOf(entry: EditorMarker, field: string): string {
  const value = entry.meta?.[field];
  if (typeof value !== "string" || !slug.test(value)) throw new Error(`Deepward ${entry.kind} needs a lowercase ${field}: ${entry.id}`);
  return value;
}
function anchors(role: string): EditorMarker[] { return editorLayers.markers.filter(entry => entry.kind === "deepward-anchor" && entry.meta?.role === role); }
function unique<T extends { id: string }>(entries: readonly T[], what: string): readonly T[] {
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error(`Deepward ${what} IDs must be unique`);
  return entries;
}

/** A descent lift: where it stands, which stratum it serves and where it goes. */
export interface Lift { id: string; place: Stratum; to: Stratum; at: Point; reach: number }
export const LIFTS: readonly Lift[] = anchors("lift").map(entry => {
  const to = entry.meta?.to;
  if (!isStratum(to)) throw new Error(`Deepward lift goes nowhere: ${entry.id}`);
  return { id: entry.id, place: stratumOf(entry), to, at: point(entry), reach: reach(entry.id) };
});
/** Where the diver steps off a lift into each stratum below receiving. */
export const STRATUM_SPAWNS: Readonly<Partial<Record<Stratum, Point>>> = Object.fromEntries(anchors("stratum-spawn").map(entry => [stratumOf(entry), point(entry)]));

/** A harvestable seam, cable run or scrap heap: what it yields, how many times, and the tool it takes. */
export type Tool = "hands" | "cutter" | "drill";
export interface ResourceNode { id: string; place: Stratum; at: Point; yields: SalvageKind; tool: Tool; amount: number; label: string }
export const NODES: readonly ResourceNode[] = unique(editorLayers.markers.filter(entry => entry.kind === "deepward-node").map(entry => {
  const yields = entry.meta?.yields, tool = entry.meta?.tool, amount = entry.meta?.amount ?? 1;
  if (!isSalvage(yields) || (tool !== "hands" && tool !== "cutter" && tool !== "drill") || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) throw new Error(`Deepward node is malformed: ${entry.id}`);
  return { id: idOf(entry, "nodeId"), place: stratumOf(entry), at: point(entry), yields, tool, amount, label: entry.label ?? entry.id };
}), "node");

/** Food and water on the shelves: onto the belt, eaten on the dive or carried home to Marrow's galley. */
export type Supply = "ration" | "water";
export interface SupplyCache { id: string; place: Stratum; at: Point; gives: Supply; amount: number; label: string }
export const SUPPLIES: readonly SupplyCache[] = unique(editorLayers.markers.filter(entry => entry.kind === "deepward-supply").map(entry => {
  const gives = entry.meta?.gives, amount = entry.meta?.amount ?? 1;
  if ((gives !== "ration" && gives !== "water") || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) throw new Error(`Deepward supply is malformed: ${entry.id}`);
  return { id: idOf(entry, "supplyId"), place: stratumOf(entry), at: point(entry), gives, amount, label: entry.label ?? entry.id };
}), "supply");

/** Something the scanner reads: a wreck that teaches a fragment of a blueprint, or a log that tells the story. */
export interface Scannable { id: string; place: Stratum; at: Point; entry: string; label: string }
export const FRAGMENTS: readonly Scannable[] = unique(editorLayers.markers.filter(entry => entry.kind === "deepward-fragment").map(entry => ({
  id: idOf(entry, "fragmentId"), place: stratumOf(entry), at: point(entry), entry: idOf(entry, "entry"), label: entry.label ?? entry.id,
})), "fragment");

/** Where a creature dens, and which species it is. */
export interface FaunaSpawn { id: string; place: Stratum; at: Point; species: string }
export const FAUNA: readonly FaunaSpawn[] = unique(editorLayers.markers.filter(entry => entry.kind === "deepward-fauna").map(entry => ({
  id: idOf(entry, "creatureId"), place: stratumOf(entry), at: point(entry), species: idOf(entry, "species"),
})), "creature");

/** Steam, frost and ink: floor patches that cost the body something while you stand in them. */
export type HazardKind = "steam" | "frost" | "ink";
export interface Hazard { id: string; place: Stratum; hazard: HazardKind; x: number; z: number; w: number; d: number }
export const HAZARDS: readonly Hazard[] = editorLayers.volumes.filter(entry => entry.kind === "deepward-hazard").map(entry => {
  const hazard = entry.meta?.hazard ?? "steam";
  if (hazard !== "steam" && hazard !== "frost" && hazard !== "ink") throw new Error(`Deepward hazard is unknown: ${entry.id}`);
  return { ...footprint(entry), place: stratumOf(entry), hazard };
});

/** Marrow's bays: the floor spots a base module can be built on. */
export const BAYS: readonly { id: string; at: Point; turn: number }[] = anchors("bay").map(entry => ({ id: entry.id, at: point(entry), turn: entry.rotationY ?? 0 }));
export const FABRICATOR = point(marker("fabricator-marrow"));
export const FABRICATOR_REACH = reach("fabricator-marrow");
/** Printer Zero's core at the bottom of the Choir: the end of the story. */
export const PRINTER_ZERO = point(marker("printer-zero"));
export const PRINTER_ZERO_REACH = reach("printer-zero");

/** The floor and ceiling heights of a place's rooms, from their authored volumes. */
export function placeElevation(place: Place): { floorY: number; ceilingY: number } {
  const volume = editorLayers.volumes.find(entry => entry.kind === "deepward-room" && entry.meta?.place === place);
  if (volume?.shape !== "box" || !volume.halfExtents) throw new Error(`Deepward has no authored room elevation for ${place}`);
  return { floorY: volume.center.y - volume.halfExtents.y, ceilingY: volume.center.y + volume.halfExtents.y };
}
const dressings = new Map<Stratum, FloorDressing>();
/**
 * A stratum's derived interior dressing: trims, pipes, cables, stains, wall lamps and clutter props
 * planned from the authored room footprints. Nothing covers a lift, pickup, spawn, hazard or
 * authored structure, and the plan is the same every run.
 */
export function floorDressing(stratum: Stratum): FloorDressing {
  const known = dressings.get(stratum);
  if (known !== undefined) return known;
  const { floorY, ceilingY } = placeElevation(stratum);
  const near = (at: Point, radius: number) => ({ x: at[0], z: at[2], radius });
  const keepClear = [
    ...LIFTS.filter(lift => lift.place === stratum).map(lift => ({ ...near(lift.at, 2.2), mark: true })),
    ...NODES.filter(node => node.place === stratum).map(node => near(node.at, 1.4)),
    ...SUPPLIES.filter(supply => supply.place === stratum).map(supply => near(supply.at, 1.2)),
    ...FRAGMENTS.filter(fragment => fragment.place === stratum).map(fragment => near(fragment.at, 1.4)),
    ...FAUNA.filter(spawn => spawn.place === stratum).map(spawn => near(spawn.at, 1.2)),
    ...SALVAGE.filter(salvage => salvage.place === stratum).map(salvage => near(salvage.at, 1.4)),
    ...(STRATUM_SPAWNS[stratum] === undefined ? [] : [near(STRATUM_SPAWNS[stratum]!, 1.8)]),
    ...(stratum === "vault" ? [near(VAULT_SPAWN, 1.8), near(EXIT, 2.4), near(PRINT_SPAWN, 1.4)] : []),
    ...(stratum === "choir" ? [near(PRINTER_ZERO, 3.5)] : []),
  ];
  const blocks: FloorRect[] = [
    ...editorLayers.volumes.filter(entry => entry.kind === "deepward-structure" && entry.meta?.place === stratum && entry.center.y - (entry.halfExtents?.y ?? (entry.height ?? 0) / 2) < floorY + 2).map(entry => entry.shape === "box" && entry.halfExtents
      ? { x: entry.center.x, z: entry.center.z, w: entry.halfExtents.x * 2, d: entry.halfExtents.z * 2 }
      : { x: entry.center.x, z: entry.center.z, w: (entry.radius ?? 0.5) * 2, d: (entry.radius ?? 0.5) * 2 }),
    ...HAZARDS.filter(hazard => hazard.place === stratum),
    ...(stratum === "vault" ? PROPS : []),
  ];
  const dressing = planFloorDressing(stratum, ROOMS.filter(room => room.place === stratum), floorY, ceilingY, keepClear, blocks);
  dressings.set(stratum, dressing);
  return dressing;
}
const clutterSolids = new Map<Stratum, FloorRect[]>();
function clutterAt(place: Place): readonly FloorRect[] {
  if (place === "home") return [];
  let solids = clutterSolids.get(place);
  if (solids === undefined) {
    // A prop stands a little inside its slot, so the solid is its slot pulled in by a hand's width.
    solids = floorDressing(place).props.map(({ slot }) => { const box = clutterFootprint(slot); return { ...box, w: box.w * 0.8, d: box.d * 0.8 }; });
    clutterSolids.set(place, solids);
  }
  return solids;
}
export function distance(a: Point, b: Point): number { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
export function inside(x: number, z: number, r: { x: number; z: number; w: number; d: number }): boolean {
  return Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
}
export function floorAt(x: number, z: number, place: Place): boolean {
  return ROOMS.some(r => r.place === place && inside(x, z, r));
}
export function walkable(x: number, z: number, place: Place, radius = 0.28): boolean {
  if (![[radius, radius], [-radius, radius], [radius, -radius], [-radius, -radius]].every(([dx, dz]) => floorAt(x + dx!, z + dz!, place))) return false;
  if (STATION_SOLIDS.some(r => r.place === place && inside(x, z, { ...r, w: r.w + radius * 2, d: r.d + radius * 2 }))) return false;
  if (clutterAt(place).some(r => inside(x, z, { ...r, w: r.w + radius * 2, d: r.d + radius * 2 }))) return false;
  return place !== "vault" || !PROPS.some(r => inside(x, z, { ...r, w: r.w + radius * 2, d: r.d + radius * 2 }));
}
/** Segment checks cover interior walls and machinery, also used for firing and looting. */
export function lineOfSight(a: Point, b: Point, place: Place = "vault"): boolean {
  const steps = Math.ceil(distance(a, b) / 0.18);
  for (let n = 1; n < steps; n++) {
    const t = n / steps;
    if (!walkable(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, place, 0)) return false;
  }
  return true;
}
export function roomAt(p: Point, place: Place): string {
  return [...ROOMS].reverse().find(r => r.place === place && inside(p[0], p[2], r))?.name ?? "Rail threshold";
}
/** A room's authored depth ("01 / rail receiving" is 1). Item level reads this, so deeper loot rolls higher. */
function roomDepth(room: Room): number {
  const match = /^(\d+)\s*\//.exec(room.name);
  return match === null ? 1 : Math.max(1, Number(match[1]));
}
/** How deep the room holding this point is; an unnumbered or unmapped spot counts as the entrance. */
export function depthAt(p: Point, place: Place): number {
  const room = [...ROOMS].reverse().find(r => r.place === place && inside(p[0], p[2], r));
  return room === undefined ? 1 : roomDepth(room);
}
/** Boundary tiles are generated from the authored footprints, never from a second collision map. */
export function wallTiles(place: Place): { x: number; z: number }[] {
  const walls: { x: number; z: number }[] = [];
  for (let x = WORLD_BOUNDS.minX + 0.5; x < WORLD_BOUNDS.maxX; x++) for (let z = WORLD_BOUNDS.minZ + 0.5; z < WORLD_BOUNDS.maxZ; z++) {
    if (floorAt(x, z, place)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => floorAt(x + dx!, z + dz!, place))) walls.push({ x, z });
  }
  return walls;
}
export const world = environment({ sculpt: editorLayers.terrain });
export const physics = { gravity: -30 };
