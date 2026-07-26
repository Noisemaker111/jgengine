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
}

export interface LookTerrain {
  sampleHeight(x: number, z: number): number;
  bounds?: WorldBounds;
}

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
}): LookResolution {
  const { look, lookFrom, terrain } = args;
  if (look === null || look.length === 0) {
    if (lookFrom !== null && lookFrom.length > 0) return { kind: "error", message: "?lookFrom= given without ?look=" };
    return { kind: "none" };
  }
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
    camera: {
      rig: "observer",
      // A detached camera has no hands, so the first-person viewmodel and reticle would just be
      // furniture drawn over an establishing shot.
      perspective: "third",
      firstPerson: { viewmodel: false, reticle: false },
      observer: {
        bind: { kind: "point", position: { x, y, z } },
        distance,
        height,
        startAngle: angle,
        orbitSpeed: 0,
      },
    },
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

/** One-line summary of the applied aim, published to the capture host and the console. */
export function formatAppliedAim(applied: LookAppliedAim): string {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const { target, camera, distance, height, angle, lifted } = applied;
  return JSON.stringify({
    target: [round(target.x), round(target.y), round(target.z)],
    camera: [round(camera.x), round(camera.y), round(camera.z)],
    distance: round(distance),
    height: round(height),
    angle: round(angle),
    ...(lifted ? { lifted: true } : {}),
  });
}
