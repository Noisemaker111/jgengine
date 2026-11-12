/**
 * The `course` scene kind: a race course that lives in the scene document as one marker. The marker
 * stands where the course starts (its rotation is the heading, its height the start elevation) and
 * its `meta` holds either the {@link COURSE_GENERATOR} dials and seed (a generated course, with
 * `pins` moving, removing or adding set-piece slots over what the generator laid) or an authored
 * course: `pieces`, `branches`, `slots`, `startLine` and `finish` written out in full. Either way the
 * kind resolves to a {@link CourseLayout} in world space, which a game builds with
 * `buildCourseLayout` and fills slot by slot.
 *
 * Authored pieces are compact: `{ "straight": 60 }` or `{ "turn": 90, "radius": 40 }` (degrees, left
 * positive), each with optional `rise`, `halfWidth` and `tag`. Branch `via` points are course-local
 * `[x, z]` (x left of the start heading, z ahead of it), and so is a slot's fixed `position`, so
 * moving or turning the marker carries them along.
 *
 * @capability course-kind editor-placeable race course in the scene: generated from seed and dials with pinned set-pieces, or fully authored
 */
import { registerGenerator, runGenerator } from "../generator/generator";
import { defineParamSchema, type ParamField } from "../generator/paramSchema";
import { registerSceneKind, type SceneKindObject } from "../scene/sceneKinds";
import { COURSE_GENERATOR, COURSE_SCHEMA } from "./courseGenerator";
import { applyCoursePins, checkCoursePlayability, COURSE_SLOT_KINDS, type CourseLayout, type CoursePin, type CourseSlot } from "./courseLayout";
import { type CourseBranchSpec, type CoursePiece, type CourseVec2 } from "./routeCourse";

/** The scene kind id. */
export const COURSE_KIND = "course";

/** One authored piece as the scene stores it: degrees, left positive. */
export type CoursePieceData =
  | { straight: number; rise?: number; halfWidth?: number; tag?: string }
  | { turn: number; radius: number; rise?: number; halfWidth?: number; tag?: string };

/** One authored branch as the scene stores it: main-line metres, course-local `via`. */
export interface CourseBranchData {
  id: string;
  from: number;
  to: number;
  via?: readonly CourseVec2[];
  halfWidth?: number;
  tag?: string;
  data?: Readonly<Record<string, string | number | boolean>>;
}

/** The `course` kind's inspector: the generator's dials, and whether the kind draws a plain road itself. */
export const COURSE_KIND_SCHEMA = defineParamSchema({
  presetKey: COURSE_SCHEMA.presetKey!,
  presets: COURSE_SCHEMA.presets!,
  groups: [...COURSE_SCHEMA.groups!, { id: "display", label: "Display" }],
  fields: [
    ...COURSE_SCHEMA.fields,
    { type: "bool", key: "drawRoad", label: "draw road", group: "display", default: true },
  ] as const satisfies readonly ParamField[],
});

const DEG = Math.PI / 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pieceExtras(raw: Record<string, unknown>): { rise?: number; halfWidth?: number; tag?: string } {
  const rise = num(raw["rise"]);
  const halfWidth = num(raw["halfWidth"]);
  const tag = typeof raw["tag"] === "string" ? raw["tag"] : undefined;
  return { ...(rise === undefined ? {} : { rise }), ...(halfWidth === undefined ? {} : { halfWidth }), ...(tag === undefined ? {} : { tag }) };
}

/** An authored piece list from `meta.pieces`, or null when there is none (the course is generated). */
export function coursePiecesFromData(raw: unknown): CoursePiece[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`course: piece ${index} is not an object`);
    const straight = num(entry["straight"]);
    if (straight !== undefined) return { kind: "straight", length: straight, ...pieceExtras(entry) };
    const turn = num(entry["turn"]);
    const radius = num(entry["radius"]);
    if (turn !== undefined && radius !== undefined) return { kind: "turn", angle: turn * DEG, radius, ...pieceExtras(entry) };
    throw new Error(`course: piece ${index} needs "straight" or "turn" and "radius"`);
  });
}

/** Pieces as the scene stores them: the inverse of {@link coursePiecesFromData}. */
export function coursePiecesToData(pieces: readonly CoursePiece[]): CoursePieceData[] {
  return pieces.map((piece) => {
    const extras = { ...(piece.rise === undefined ? {} : { rise: piece.rise }), ...(piece.halfWidth === undefined ? {} : { halfWidth: piece.halfWidth }), ...(piece.tag === undefined ? {} : { tag: piece.tag }) };
    return piece.kind === "straight" ? { straight: piece.length, ...extras } : { turn: Math.round((piece.angle / DEG) * 1e6) / 1e6, radius: piece.radius, ...extras };
  });
}

/** Where a course marker stands: its start pose in world space. */
export interface CoursePose {
  x: number;
  z: number;
  heading: number;
  elevation: number;
}

/** A course-local `[x, z]` (x left of the heading, z ahead) in world space. */
export function courseLocalToWorld(pose: CoursePose, point: CourseVec2): CourseVec2 {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return [pose.x + point[0] * c + point[1] * s, pose.z - point[0] * s + point[1] * c];
}

function slotsFromData(raw: unknown): CourseSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((entry) => {
    const kind = entry["kind"];
    if (typeof entry["id"] !== "string" || typeof kind !== "string" || !COURSE_SLOT_KINDS.includes(kind as CourseSlot["kind"]) || num(entry["at"]) === undefined) {
      throw new Error(`course: slot ${JSON.stringify(entry["id"])} needs an id, a slot kind and an at`);
    }
    // type-escape: the fields were checked above; the rest are optional plain data the slot type describes.
    return { role: "", ...entry } as unknown as CourseSlot;
  });
}

function pinsFromData(raw: unknown): CoursePin[] {
  if (!Array.isArray(raw)) return [];
  // type-escape: pins are plain partial slots; applyCoursePins checks the new ones it adds.
  return raw.filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry["id"] === "string") as unknown as CoursePin[];
}

/**
 * A course `meta` bag at a start pose, as a world-space {@link CourseLayout}: the authored course
 * when `meta.pieces` is set, else the generator's from its dials and seed (`fallbackSeed` when the
 * meta has none), with `meta.pins` applied either way.
 */
export function courseLayoutFromMeta(meta: Readonly<Record<string, unknown>> | undefined, pose: CoursePose, fallbackSeed: string): CourseLayout {
  const pieces = coursePiecesFromData(meta?.["pieces"]);
  const start = { x: pose.x, z: pose.z, heading: pose.heading, elevation: pose.elevation };
  let layout: CourseLayout;
  if (pieces !== null) {
    const branches: CourseBranchSpec[] = (Array.isArray(meta?.["branches"]) ? (meta!["branches"] as unknown[]) : []).filter(isRecord).map((entry) => {
      const branch = entry as unknown as CourseBranchData;
      return {
        id: branch.id,
        from: branch.from,
        to: branch.to,
        ...(branch.via === undefined ? {} : { via: branch.via.map((point) => courseLocalToWorld(pose, point)) }),
        ...(branch.halfWidth === undefined ? {} : { halfWidth: branch.halfWidth }),
        ...(branch.tag === undefined ? {} : { tag: branch.tag }),
        ...(branch.data === undefined ? {} : { data: branch.data }),
      };
    });
    const halfWidth = num(meta?.["halfWidth"]) ?? 9;
    const length = pieces.reduce((sum, piece) => sum + (piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius), 0);
    layout = {
      spec: { start, halfWidth, pieces, branches, ...(meta?.["closed"] === true ? { closed: true } : {}) },
      startLine: num(meta?.["startLine"]) ?? 0,
      finish: num(meta?.["finish"]) ?? length,
      slots: slotsFromData(meta?.["slots"]).map((slot) => (slot.position === undefined ? slot : { ...slot, position: courseLocalToWorld(pose, slot.position) })),
    };
  } else {
    const generated = runGenerator(COURSE_GENERATOR, meta, { fallbackSeed });
    layout = { ...generated, spec: { ...generated.spec, start } };
  }
  return applyCoursePins(layout, pinsFromData(meta?.["pins"]));
}

/** The pose a course marker stands at. */
export function coursePoseOf(object: Pick<SceneKindObject, "position" | "center" | "rotationY">): CoursePose | null {
  const at = object.position ?? object.center;
  if (at === undefined) return null;
  return { x: at.x, z: at.z, heading: object.rotationY ?? 0, elevation: at.y };
}

/**
 * The `course` kind's resolve: the marker's course as a world-space layout, or null without a position.
 *
 * @capability course-kind editor-placeable race course in the scene: generated from seed and dials with pinned set-pieces, or fully authored
 */
export function resolveCourseObject(object: SceneKindObject): CourseLayout | null {
  const pose = coursePoseOf(object);
  return pose === null ? null : courseLayoutFromMeta(object.meta, pose, object.id);
}

let registered = false;

/** Registers {@link COURSE_GENERATOR} and the `course` scene kind. Loaded on demand (`ON_DEMAND_SCENE_KINDS`). @internal */
export function registerCourseKind(): void {
  if (registered) return;
  registered = true;
  registerGenerator(COURSE_GENERATOR);
  registerSceneKind<CourseLayout | null>({
    kind: COURSE_KIND,
    generator: COURSE_GENERATOR.id,
    target: "marker",
    label: "Race course",
    addCategory: "Studios",
    accent: "#e0763a",
    schema: COURSE_KIND_SCHEMA,
    resolve: (object) => resolveCourseObject(object),
    note: (object) => {
      let layout: CourseLayout | null;
      try {
        layout = resolveCourseObject(object);
      } catch (error) {
        return `Course does not build: ${(error as Error).message}`;
      }
      if (layout === null) return "Place the marker where the course starts.";
      const source = Array.isArray(object.meta?.["pieces"]) ? "authored" : "generated";
      const check = checkCoursePlayability(layout, { shortcutRisk: source === "generated" });
      const count = (kind: CourseSlot["kind"]) => layout.slots.filter((slot) => slot.kind === kind).length;
      const head = `${source} · ${Math.round(layout.finish - layout.startLine)} m · ${(layout.spec.branches ?? []).length} shortcuts · ${count("gate")} gates · ${count("hazard")} hazards`;
      return check.ok ? `${head} · playable, ${check.time.toFixed(1)} s` : `${head} · ${check.issues[0]}`;
    },
  });
}
