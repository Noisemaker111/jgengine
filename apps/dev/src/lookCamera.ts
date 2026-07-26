/**
 * `?look=` / `?lookFrom=` → a detached photo camera pinned on a world point, plus
 * the readout the capture host reads back to prove where the camera actually went.
 *
 * Every rejection is a hard error rather than a dropped override: a capture that
 * silently keeps the game's own camera looks like a successful shot of the wrong
 * place, which is how a bad aim used to cost a whole round of screenshots.
 */
import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import type { WorldBounds } from "@jgengine/core/world/features";

/** Minimum clearance between the camera and the ground beneath it. Below this the shot is dirt. */
export const LOOK_GROUND_CLEARANCE = 1.5;
export const LOOK_DEFAULTS = { distance: 12, height: 5, angle: 0 } as const;

export interface LookAppliedAim {
  target: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  distance: number;
  height: number;
  angle: number;
  /** True when the requested height would have buried the camera and was raised. */
  lifted: boolean;
  /** The `@marker:`/`@entity:` token this aim came from, when it was named rather than typed. */
  subject?: string;
}

export interface LookTerrain {
  sampleHeight(x: number, z: number): number;
  bounds?: WorldBounds;
}

/** Authored markers the `@marker:<id>` form aims at, keyed by the id in `editor.scene.json`. */
export type LookMarkers = Record<string, { x: number; y: number; z: number }>;

const SUBJECT_RE = /^@([a-z]+):(.+)$/;

export type LookResolution =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "camera"; camera: GameCameraConfig; applied: LookAppliedAim };

function parseFields(flag: string, raw: string, max: number, optional: boolean): number[] | string {
  const fields = raw.split(",").map((part) => part.trim());
  if (fields.length > max) return `${flag}="${raw}" has ${fields.length} fields (at most ${max})`;
  const values: number[] = [];
  for (const [index, field] of fields.entries()) {
    if (field.length === 0 && optional) {
      values.push(Number.NaN);
      continue;
    }
    const value = Number(field);
    if (field.length === 0 || !Number.isFinite(value)) {
      return `${flag}="${raw}" field ${index + 1} is not a number ("${field}")`;
    }
    values.push(value);
  }
  return values;
}

/**
 * Resolve the aim into an observer-rig camera config. Returns `error` for anything
 * the caller must see — malformed params, an aim outside the terrain, a vantage
 * that cannot see its own target — so the runner can fail the capture handshake.
 */
export function resolveLookCamera(args: {
  look: string | null;
  lookFrom: string | null;
  terrain: LookTerrain;
  markers?: LookMarkers;
}): LookResolution {
  const { look, lookFrom, terrain, markers } = args;
  if (look === null || look.length === 0) {
    if (lookFrom !== null && lookFrom.length > 0) return { kind: "error", message: "?lookFrom= given without ?look=" };
    return { kind: "none" };
  }
  const subject = SUBJECT_RE.exec(look);
  if (subject !== null) return resolveSubject(subject[1]!, subject[2]!, lookFrom, terrain, markers);
  const point = parseFields("look", look, 3, false);
  if (typeof point === "string") return { kind: "error", message: point };
  if (point.length < 2) {
    return { kind: "error", message: `look="${look}" needs x,z or x,y,z (got ${point.length} number)` };
  }
  const vantage = lookFrom === null || lookFrom.length === 0 ? [] : parseFields("lookFrom", lookFrom, 3, true);
  if (typeof vantage === "string") return { kind: "error", message: vantage };

  const pick = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) ? value : fallback;
  const distance = pick(vantage[0], LOOK_DEFAULTS.distance);
  const angle = pick(vantage[2], LOOK_DEFAULTS.angle);
  if (distance <= 0) {
    return { kind: "error", message: `lookFrom distance must be positive (got ${distance})` };
  }

  const ground = point.length === 2;
  const x = point[0]!;
  const z = ground ? point[1]! : point[2]!;
  const bounds = terrain.bounds;
  if (bounds !== undefined && (Math.abs(x) > bounds.w / 2 || Math.abs(z) > bounds.d / 2)) {
    return {
      kind: "error",
      message:
        `look=${x},${z} is outside the world (${bounds.w}x${bounds.d}, so x within ` +
        `±${bounds.w / 2} and z within ±${bounds.d / 2}) — the camera would frame empty space`,
    };
  }
  const y = ground ? terrain.sampleHeight(x, z) : point[1]!;

  // The observer rig places the camera `distance` away on the orbit circle; sampling the
  // ground only under the *target* is what buried a camera on any slope steeper than the
  // requested height, which renders as a solid brown or black frame.
  const cameraX = x + Math.sin(angle) * distance;
  const cameraZ = z + Math.cos(angle) * distance;
  const requestedHeight = pick(vantage[1], LOOK_DEFAULTS.height);
  const clearHeight = terrain.sampleHeight(cameraX, cameraZ) + LOOK_GROUND_CLEARANCE - y;
  const height = Math.max(requestedHeight, clearHeight);

  return {
    kind: "camera",
    camera: observerCamera({ bind: { kind: "point", position: { x, y, z } }, distance, height, angle }),
    applied: {
      target: { x, y, z },
      camera: { x: cameraX, y: y + height, z: cameraZ },
      distance,
      height,
      angle,
      lifted: height > requestedHeight,
    },
  };
}

/**
 * Aim at a named thing. `@entity:` maps onto the observer rig's own entity bind, so the shot
 * tracks whatever moves; `@marker:` resolves against the authored document and then takes the
 * same terrain clearance and bounds checks as a coordinate. A missing id fails the capture
 * listing what is available, rather than quietly framing the game's own camera.
 */
function resolveSubject(
  kind: string,
  id: string,
  lookFrom: string | null,
  terrain: LookTerrain,
  markers: LookMarkers | undefined,
): LookResolution {
  if (kind === "entity") {
    const vantage = readVantage(lookFrom);
    if (typeof vantage === "string") return { kind: "error", message: vantage };
    // The entity's position is only known once the game context is live, so there is no ground
    // sample to clear here — the rig follows the entity and the requested height is taken as given.
    return {
      kind: "camera",
      camera: observerCamera({ bind: { kind: "entity", entityId: id }, ...vantage }),
      applied: {
        target: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
        camera: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
        ...vantage,
        lifted: false,
        subject: `@entity:${id}`,
      },
    };
  }
  if (kind !== "marker") {
    return { kind: "error", message: `look=@${kind}: is not a subject kind — use @marker: or @entity:` };
  }
  const position = markers?.[id];
  if (position === undefined) {
    const known = Object.keys(markers ?? {}).sort();
    const detail = known.length > 0 ? `known markers: ${known.join(", ")}` : "this scene has no authored markers";
    return { kind: "error", message: `look=@marker:${id} — no such marker (${detail})` };
  }
  const resolved = resolveLookCamera({
    look: `${position.x},${position.y},${position.z}`,
    lookFrom,
    terrain,
  });
  if (resolved.kind !== "camera") return resolved;
  return { ...resolved, applied: { ...resolved.applied, subject: `@marker:${id}` } };
}

/**
 * Confirm an `@entity:` aim actually found its entity, once the game context is live. The
 * observer rig falls back to the world origin for an unknown id, which is the same
 * plausible-shot-of-the-wrong-place failure a bad coordinate used to produce — so a typo'd
 * id has to fail the capture rather than quietly frame `0,0,0`.
 */
export function verifyLookSubject(
  look: string | null,
  hasEntity: (id: string) => boolean,
): string | null {
  const subject = look === null ? null : SUBJECT_RE.exec(look);
  if (subject === null || subject[1] !== "entity") return null;
  const id = subject[2]!;
  return hasEntity(id)
    ? null
    : `look=@entity:${id} — no such entity in the live scene, so the camera fell back to the world origin`;
}

/** One-line summary of the applied aim, published to the capture host and the console. */
export function formatAppliedAim(applied: LookAppliedAim): string {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const triple = (v: { x: number; y: number; z: number }): number[] | null =>
    Number.isFinite(v.x) ? [round(v.x), round(v.y), round(v.z)] : null;
  const { target, camera, distance, height, angle, lifted, subject } = applied;
  return JSON.stringify({
    ...(subject === undefined ? {} : { subject }),
    target: triple(target),
    camera: triple(camera),
    distance: round(distance),
    height: round(height),
    angle: round(angle),
    ...(lifted ? { lifted: true } : {}),
  });
}

function observerCamera(opts: {
  bind: { kind: "point"; position: { x: number; y: number; z: number } } | { kind: "entity"; entityId: string };
  distance: number;
  height: number;
  angle: number;
}): GameCameraConfig {
  return {
    rig: "observer",
    // A detached camera has no hands, so the first-person viewmodel and reticle would just be
    // furniture drawn over an establishing shot.
    perspective: "third",
    firstPerson: { viewmodel: false, reticle: false },
    observer: {
      bind: opts.bind,
      distance: opts.distance,
      height: opts.height,
      startAngle: opts.angle,
      orbitSpeed: 0,
    },
  };
}

/** Shared `?lookFrom=` decode for the subject forms, which skip the coordinate path. */
function readVantage(lookFrom: string | null): { distance: number; height: number; angle: number } | string {
  const vantage = lookFrom === null || lookFrom.length === 0 ? [] : parseFields("lookFrom", lookFrom, 3, true);
  if (typeof vantage === "string") return vantage;
  const pick = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) ? value : fallback;
  const distance = pick(vantage[0], LOOK_DEFAULTS.distance);
  if (distance <= 0) return `lookFrom distance must be positive (got ${distance})`;
  return { distance, height: pick(vantage[1], LOOK_DEFAULTS.height), angle: pick(vantage[2], LOOK_DEFAULTS.angle) };
}
