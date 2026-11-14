import { environment } from "@jgengine/core/world/features";
import type { EditorDocument, EditorMarker, EditorVolume } from "@jgengine/core/editor/types";
import authored from "./editor.scene.json";

/**
 * The giant house as the editor authored it: a yard of room templates and the burrow. Runtime reads
 * only this export (`scripts/author-house.ts` rebuilds it through the editor session); the run
 * generator chains templates, and every room places its loot, threats, doors and exits on the
 * spots authored here. Coordinates are world units, about 1.5 cm each.
 */
export type Point = readonly [number, number, number];
export type Zone = "kitchen" | "living" | "kidroom" | "garage" | "attic";
export const ZONES: readonly Zone[] = ["kitchen", "living", "kidroom", "garage", "attic"];
export const ZONE_NAME: Record<Zone, string> = { kitchen: "Kitchen", living: "Living room", kidroom: "Kid's bedroom", garage: "Garage", attic: "Attic" };
export function isZone(value: unknown): value is Zone { return typeof value === "string" && (ZONES as readonly string[]).includes(value); }

export type ConnectorKind = "crack" | "climb" | "drop" | "cable" | "train" | "vent";
const CONNECTORS: readonly ConnectorKind[] = ["crack", "climb", "drop", "cable", "train", "vent"];
export type ExitKind = "crack" | "mail" | "vent" | "dogdoor";
export type ThreatKind = "cat" | "roomba" | "spider" | "trap" | "kid" | "dog" | "lights";
const THREATS: readonly ThreatKind[] = ["cat", "roomba", "spider", "trap", "kid", "dog", "lights"];
export type SpotTier = "open" | "tucked" | "cache";
export type LootBias = "food" | "part" | "curio";

export interface Rect { x: number; z: number; w: number; d: number }
export interface Solid extends Rect { cover: boolean }
export interface DoorSlot { id: string; role: "entry" | "forward"; at: Point; kinds: readonly ConnectorKind[]; label: string }
export interface Spot { id: string; at: Point; tier: SpotTier; bias: LootBias | null; toybox: boolean; label: string }
export interface ThreatSlot { id: string; kind: ThreatKind; at: Point; minDepth: number; label: string }
export interface ExitSlot { id: string; kind: ExitKind; at: Point; label: string }
export interface LampSlot { id: string; at: Point; color: string; intensity: number; distance: number }
export interface Station { id: string; role: "depart" | "stash" | "workbench" | "nook" | "spawn"; at: Point; reach: number; label: string }
export interface RoomTemplate {
  id: string; name: string; zone: Zone | "burrow"; minDepth: number; flavor: string;
  root: boolean; dark: boolean; elevated: number; ceiling: number; weight: number; mood: string;
  floor: string; floorColor: string;
  /** The walkable floor. */
  area: Rect;
  solids: readonly Solid[];
  doors: readonly DoorSlot[];
  spots: readonly Spot[];
  threats: readonly ThreatSlot[];
  exits: readonly ExitSlot[];
  lamps: readonly LampSlot[];
  props: readonly EditorVolume[];
}

export const editorLayers = authored as unknown as EditorDocument;
if (editorLayers.version !== 1) throw new Error("Crumb Run scene has an unsupported editor version");
{
  const ids = [...editorLayers.markers, ...editorLayers.volumes].map(entry => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error("Crumb Run scene has duplicate stable IDs");
}
if (!editorLayers.terrain) throw new Error("Crumb Run scene is missing its authored terrain");

const text = (meta: Record<string, unknown> | undefined, key: string, fallback = ""): string => typeof meta?.[key] === "string" ? meta[key] as string : fallback;
const num = (meta: Record<string, unknown> | undefined, key: string, fallback = 0): number => typeof meta?.[key] === "number" && Number.isFinite(meta[key]) ? meta[key] as number : fallback;
const point = (entry: EditorMarker): Point => [entry.position.x, entry.position.y, entry.position.z];
function rectOf(entry: EditorVolume): Rect {
  if (entry.shape === "box" && entry.halfExtents) return { x: entry.center.x, z: entry.center.z, w: entry.halfExtents.x * 2, d: entry.halfExtents.z * 2 };
  const r = entry.radius ?? 1;
  return { x: entry.center.x, z: entry.center.z, w: r * 2, d: r * 2 };
}
/** The footprint a turned box covers on the floor: its axis-aligned bounds, pulled in a little so diagonal props stay passable. */
function footprintOf(entry: EditorVolume): Rect {
  const base = rectOf(entry), turn = num(entry.meta, "turn");
  if (entry.shape !== "box" || turn === 0) return base;
  const c = Math.abs(Math.cos(turn)), s = Math.abs(Math.sin(turn));
  return { x: base.x, z: base.z, w: (base.w * c + base.d * s) * 0.86, d: (base.w * s + base.d * c) * 0.86 };
}

function readTemplates(): Record<string, RoomTemplate> {
  const out: Record<string, RoomTemplate> = {};
  const of = (entry: { meta?: Record<string, unknown> }) => text(entry.meta, "template");
  for (const room of editorLayers.volumes.filter(v => v.kind === "crumb-room")) {
    const id = of(room), meta = room.meta, zone = text(meta, "zone");
    if (id === "" || (zone !== "burrow" && !isZone(zone))) throw new Error(`Crumb Run room template is malformed: ${room.id}`);
    const markers = editorLayers.markers.filter(m => of(m) === id);
    const props = editorLayers.volumes.filter(v => v.kind === "crumb-prop" && of(v) === id);
    const doors: DoorSlot[] = markers.filter(m => m.kind === "crumb-door").map(m => {
      const role = text(m.meta, "role"), kinds = (Array.isArray(m.meta?.["kinds"]) ? m.meta["kinds"] : []) as unknown[];
      if ((role !== "entry" && role !== "forward") || kinds.length === 0 || !kinds.every(k => (CONNECTORS as readonly unknown[]).includes(k))) throw new Error(`Crumb Run door is malformed: ${m.id}`);
      return { id: m.id, role, at: point(m), kinds: kinds as ConnectorKind[], label: m.label ?? m.id };
    });
    const spots: Spot[] = markers.filter(m => m.kind === "crumb-spot").map(m => {
      const tier = text(m.meta, "tier"), bias = text(m.meta, "bias");
      if (tier !== "open" && tier !== "tucked" && tier !== "cache") throw new Error(`Crumb Run spot is malformed: ${m.id}`);
      return { id: m.id, at: point(m), tier, bias: bias === "food" || bias === "part" || bias === "curio" ? bias : null, toybox: m.meta?.["toybox"] === true, label: m.label ?? m.id };
    });
    const threats: ThreatSlot[] = markers.filter(m => m.kind === "crumb-threat").map(m => {
      const kind = text(m.meta, "threat");
      if (!(THREATS as readonly string[]).includes(kind)) throw new Error(`Crumb Run threat is malformed: ${m.id}`);
      return { id: m.id, kind: kind as ThreatKind, at: point(m), minDepth: num(m.meta, "minDepth"), label: m.label ?? m.id };
    });
    const exits: ExitSlot[] = markers.filter(m => m.kind === "crumb-exit").map(m => {
      const kind = text(m.meta, "exit");
      if (kind !== "mail" && kind !== "vent" && kind !== "dogdoor" && kind !== "crack") throw new Error(`Crumb Run exit is malformed: ${m.id}`);
      return { id: m.id, kind, at: point(m), label: m.label ?? m.id };
    });
    const lamps: LampSlot[] = markers.filter(m => m.kind === "crumb-lamp").map(m => ({ id: m.id, at: point(m), color: text(m.meta, "color", "#ffffff"), intensity: num(m.meta, "intensity", 4), distance: num(m.meta, "distance", 30) }));
    const solids: Solid[] = props.filter(p => p.meta?.["solid"] === true || p.meta?.["cover"] === true)
      .filter(p => p.center.y - (p.halfExtents?.y ?? (p.height ?? 0) / 2) < 3)
      .map(p => ({ ...footprintOf(p), cover: p.meta?.["cover"] === true && p.meta?.["solid"] !== true }));
    if (zone !== "burrow" && (!doors.some(d => d.role === "entry") || !doors.some(d => d.role === "forward"))) throw new Error(`Crumb Run room needs an entry and a forward door: ${id}`);
    out[id] = {
      id, name: room.label ?? id, zone: zone as Zone | "burrow", minDepth: num(meta, "minDepth"), flavor: text(meta, "flavor"),
      root: meta?.["root"] === true, dark: meta?.["dark"] === true, elevated: num(meta, "elevated"), ceiling: num(meta, "ceiling"), weight: num(meta, "weight", 1), mood: text(meta, "mood", "night"),
      floor: text(meta, "floor", "wood"), floorColor: text(meta, "floorColor", "#8c5a33"),
      area: rectOf(room), solids, doors, spots, threats, exits, lamps, props,
    };
  }
  return out;
}
export const TEMPLATES: Readonly<Record<string, RoomTemplate>> = readTemplates();
export const ROOM_TEMPLATES: readonly RoomTemplate[] = Object.values(TEMPLATES).filter(t => t.zone !== "burrow");
export const BURROW = TEMPLATES["burrow"]!;
if (BURROW === undefined) throw new Error("Crumb Run scene is missing the burrow");
export const STATIONS: readonly Station[] = editorLayers.markers.filter(m => m.kind === "crumb-station").map(m => {
  const role = text(m.meta, "role");
  if (role !== "depart" && role !== "stash" && role !== "workbench" && role !== "nook" && role !== "spawn") throw new Error(`Crumb Run station is malformed: ${m.id}`);
  return { id: m.id, role, at: point(m), reach: num(m.meta, "reach", 2.5), label: m.label ?? m.id };
});
function station(role: Station["role"]): Station {
  const found = STATIONS.find(s => s.role === role);
  if (found === undefined) throw new Error(`Crumb Run burrow is missing its ${role}`);
  return found;
}
export const HOME_SPAWN = station("spawn").at;
export const DEPART = station("depart");
export const STASH = station("stash");
export const WORKBENCH = station("workbench");
export const NOOK = station("nook");

export function groundDistance(a: Point, b: Point): number { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
export function inside(x: number, z: number, r: Rect, grow = 0): boolean {
  return Math.abs(x - r.x) < r.w / 2 + grow && Math.abs(z - r.z) < r.d / 2 + grow;
}
/** Whether a Little of `radius` can stand here in `template`: on its floor and clear of every solid. Cover is walkable. */
export function walkable(template: RoomTemplate, x: number, z: number, radius = 0.35): boolean {
  const a = template.area;
  if (Math.abs(x - a.x) > a.w / 2 - radius || Math.abs(z - a.z) > a.d / 2 - radius) return false;
  for (const s of template.solids) if (!s.cover && inside(x, z, s, radius)) return false;
  return true;
}
/** Under something low: a tea towel, a sock, a magazine. The big hunters cannot see in. */
export function inCover(template: RoomTemplate, at: Point): boolean {
  return template.solids.some(s => s.cover && inside(at[0], at[2], s));
}
/** Sight between two floor points, blocked by solids (a cat cannot see through the bread heel). */
export function lineOfSight(template: RoomTemplate, a: Point, b: Point): boolean {
  const steps = Math.ceil(groundDistance(a, b) / 0.6);
  for (let n = 1; n < steps; n++) {
    const t = n / steps, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    for (const s of template.solids) if (!s.cover && inside(x, z, s, -0.2)) return false;
  }
  return true;
}
/** The flat world the rooms stand on; nothing walks it outside a room. */
export const world = environment({ sculpt: editorLayers.terrain });
export const physics = { gravity: -30 };
