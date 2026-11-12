import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";
import { COURSE_KIND, courseLayoutFromMeta, coursePoseOf } from "@jgengine/core/roads/courseKind";
import { buildRouteCourse, type CourseSpanCycle } from "@jgengine/core/roads/routeCourse";
import type { CourseLayout, CourseSlot } from "@jgengine/core/roads/courseLayout";

import sceneJson from "../../editor.scene.json";
import type { PartIconId } from "../parts/catalog";
import type { TrackZone } from "../zones/catalog";
import { LATE_DROPS, OPENING_DROPS } from "./drops";
import type { HazardKind, TrackDef, TrackDressing, TrackGateDef, TrackHazardDef, TrackLandmark, TrackPickupDef } from "./types";

/**
 * A yard track's course lives in the scene (`editor.scene.json`) as a `course` marker: the road,
 * its shortcuts and its slots - zones, hazards, barricades, drops, landmarks. The track's own file
 * keeps what is not a place on the road: its name, light, ground, rules and dressing palette. This
 * module joins the two into the {@link TrackDef} the run reads.
 *
 * An authored course carries Drift Foundry's own content on each slot (`data.hazard`, a gate's
 * label and radio line, a drop's part). A generated course's slots carry only their kind and role,
 * and the theme's {@link TrackFill} says what each role becomes on this track.
 */

/** A track's theme: everything about it that is not a place on its course. */
export interface TrackTheme {
  id: string;
  label: string;
  blurb: string;
  pavedHalfWidth: number;
  bandZ: number;
  ground: TrackDef["ground"];
  fog: TrackDef["fog"];
  sky: TrackDef["sky"];
  weather?: "rain" | "snow";
  baseLevel: number;
  liquid?: NonNullable<TrackDef["liquid"]>;
  rivalTake: TrackDef["rivalTake"];
  par: number;
  /** The dressing palette; landmark placements come from the course's dressing slots. */
  dressing: Omit<TrackDressing, "landmarks">;
  /** What a generated course's slots become here. */
  fill?: TrackFill;
}

/** The content a generated course's slots are filled with, by slot role. */
export interface TrackFill {
  hazards: Readonly<Record<"timed" | "lane" | "surface", { kind: HazardKind; label: string; push?: number }>>;
  gates: { jump: readonly { label: string; radioLine: string }[]; block: readonly { label: string; radioLine: string }[] };
  zones: readonly Omit<TrackZone, "start" | "end">[];
  landmarks: readonly string[];
}

interface SceneMarker {
  id: string;
  kind: string;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  meta?: Record<string, unknown>;
}

const COURSE_MARKERS: readonly SceneMarker[] = (sceneJson.markers as readonly SceneMarker[]).filter((marker) => marker.kind === COURSE_KIND);

/** The scene's course marker for a track id. */
export function sceneCourse(id: string): SceneMarker {
  const marker = COURSE_MARKERS.find((entry) => entry.id === id);
  if (marker === undefined) throw new Error(`tracks: editor.scene.json has no course "${id}"`);
  return marker;
}

/** A course marker's layout; `seed` replaces the meta's seed (a daily course). */
export function courseLayout(marker: SceneMarker, seed?: string): CourseLayout {
  const pose = coursePoseOf(marker)!;
  return courseLayoutFromMeta(seed === undefined ? marker.meta : { ...marker.meta, seed }, pose, marker.id);
}

const text = (slot: CourseSlot, key: string): string | undefined => {
  const value = slot.data?.[key];
  return typeof value === "string" ? value : undefined;
};
const number = (slot: CourseSlot, key: string): number | undefined => {
  const value = slot.data?.[key];
  return typeof value === "number" ? value : undefined;
};
/** Run metres are read back to the millimetre, so an authored mark stays the number it was written as. */
const mm = (value: number): number => Math.round(value * 1000) / 1000;

/** Join a course layout and a theme into the track the run reads. */
export function trackDefFromCourse(theme: TrackTheme, layout: CourseLayout): TrackDef {
  const origin = layout.startLine;
  const spec = layout.spec;
  if (spec.start === undefined || spec.pieces === undefined) throw new Error(`tracks: ${theme.id}'s course needs pieces`);
  // Branch metres to run metres: the same course the track builds, without its slots.
  const bare = buildRouteCourse({ start: spec.start, halfWidth: spec.halfWidth, pieces: spec.pieces, branches: spec.branches ?? [] });
  const run = (slot: CourseSlot, at = slot.at): number => mm(bare.progressOf(slot.route ?? MAIN_ROUTE, at) - origin);
  const onMain = (slot: CourseSlot) => (slot.route ?? MAIN_ROUTE) === MAIN_ROUTE;
  const route = (slot: CourseSlot) => (onMain(slot) ? {} : { route: slot.route! });
  const fill = theme.fill;
  const slots = (kind: CourseSlot["kind"]) => layout.slots.filter((slot) => slot.kind === kind);

  const zones: TrackZone[] = slots("zone").map((slot, index) => {
    const content = fill?.zones[index % fill.zones.length];
    const surfaceId = text(slot, "surface");
    return {
      id: content?.id ?? slot.id,
      label: text(slot, "label") ?? content?.label ?? slot.id,
      radioName: text(slot, "radioName") ?? content?.radioName ?? slot.id,
      wallColor: text(slot, "wallColor") ?? content?.wallColor ?? "#cccccc",
      surface: surfaceId === undefined ? content!.surface : { id: surfaceId, label: text(slot, "surfaceLabel") ?? surfaceId, grip: number(slot, "grip") ?? 1 },
      start: run(slot),
      end: run(slot, slot.to!),
    };
  });

  const hazards: TrackHazardDef[] = slots("hazard").map((slot) => {
    const role = slot.role as keyof TrackFill["hazards"];
    const content = fill?.hazards[role];
    const kind = (text(slot, "hazard") ?? content?.kind) as HazardKind | undefined;
    if (kind === undefined) throw new Error(`tracks: ${theme.id} hazard ${slot.id} has no hazard kind`);
    const push = number(slot, "push") ?? content?.push;
    const cycle: CourseSpanCycle | undefined = slot.cycle;
    // Main-line hazards are in run metres; a branch's in its own metres, as the course spans hold them.
    const from = onMain(slot) ? mm(slot.at - origin) : slot.at;
    const to = onMain(slot) ? mm(slot.to! - origin) : slot.to!;
    return {
      id: slot.id,
      kind,
      ...route(slot),
      from,
      to,
      ...(slot.band === undefined ? {} : { offset: slot.band }),
      ...(cycle === undefined ? {} : { cycle }),
      ...(push === undefined ? {} : { push }),
      label: text(slot, "label") ?? content?.label ?? slot.id,
    };
  });

  const counter = { jump: 0, block: 0 };
  const gates: TrackGateDef[] = slots("gate").map((slot) => {
    const requirement = slot.role === "jump" ? "jump" : "plow";
    const pool = fill?.gates[slot.role === "jump" ? "jump" : "block"];
    const content = pool === undefined ? undefined : pool[counter[slot.role === "jump" ? "jump" : "block"]++ % pool.length];
    const dropsAt = number(slot, "dropsAt");
    return {
      id: slot.id,
      requirement,
      ...route(slot),
      at: run(slot),
      label: text(slot, "label") ?? content?.label ?? slot.id,
      radioLine: text(slot, "radioLine") ?? content?.radioLine ?? "",
      ...(dropsAt === undefined ? {} : { dropsAt }),
    };
  });

  // The opening drops hand out the opening parts in order; the rest the late parts, first to last.
  const drops = slots("drop");
  const opening = drops.filter((slot) => slot.role === "opening");
  const late = drops.filter((slot) => slot.role !== "opening").sort((a, b) => run(a) - run(b));
  const pickups: TrackPickupDef[] = [
    ...opening.map((slot, index) => ({ slot, part: (text(slot, "part") ?? OPENING_DROPS[index]?.partId) as PartIconId | undefined })),
    ...late.map((slot, index) => ({ slot, part: (text(slot, "part") ?? LATE_DROPS[index]) as PartIconId | undefined })),
  ].map(({ slot, part }) => {
    if (part === undefined) throw new Error(`tracks: ${theme.id} has more drop slots than parts`);
    return { partId: part, at: run(slot), lane: slot.offset ?? 0, ...route(slot) };
  });

  let mark = 0;
  const landmarks: TrackLandmark[] = slots("dressing").map((slot) => {
    const object = text(slot, "object") ?? fill?.landmarks[mark++ % fill.landmarks.length];
    if (object === undefined) throw new Error(`tracks: ${theme.id} landmark ${slot.id} has no object`);
    const rotation = number(slot, "rotation");
    if (slot.position !== undefined) return { object, at: slot.position, rotation: rotation ?? 0 };
    return { object, at: run(slot), side: slot.offset ?? 0, ...(rotation === undefined ? {} : { rotation }) };
  });

  const { dressing, fill: _fill, ...look } = theme;
  return {
    ...look,
    origin,
    start: spec.start,
    halfWidth: spec.halfWidth,
    pieces: spec.pieces,
    branches: (spec.branches ?? []).map((branch) => ({
      id: branch.id,
      from: mm(branch.from - origin),
      to: mm(branch.to - origin),
      ...(branch.via === undefined ? {} : { via: branch.via }),
      halfWidth: branch.halfWidth ?? spec.halfWidth,
      label: typeof branch.data?.["label"] === "string" ? branch.data["label"] : branch.id.toUpperCase(),
    })),
    hazards,
    gates,
    pickups,
    exitAt: mm(layout.finish - origin),
    zones,
    dressing: { ...dressing, landmarks },
  };
}
