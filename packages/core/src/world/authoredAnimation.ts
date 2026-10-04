import { validateAnimGraph } from "../anim/animGraph";
import type { AuthoredAnimation } from "./authoredObjects";

/** Structural marker input; immutable editor scene documents satisfy it. */
export interface AuthoredAnimationDocumentLike {
  readonly markers: readonly { readonly id: string; readonly meta?: Readonly<Record<string, unknown>> }[];
}

/** Rejected saved animation data with a document location and a repair. */
export interface AuthoredAnimationDiagnostic {
  readonly path: string;
  readonly message: string;
  readonly repair: string;
}

/** Resolved marker animation or the caller's unchanged default, with rejected-value diagnostics. */
export interface AuthoredAnimationResult {
  readonly animation: AuthoredAnimation | undefined;
  readonly diagnostics: readonly AuthoredAnimationDiagnostic[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves a caller-selected marker's animation. Authored configuration replaces game defaults;
 * omitted or malformed data retains the exact default. Partial roles remain available for editing.
 * Asset clip and rig compatibility is diagnosed by the animation renderer.
 * @capability authored-animation bind saved character animation without copying game-side validation
 */
export function readAuthoredAnimation(
  document: AuthoredAnimationDocumentLike,
  markerId: string,
  defaults?: AuthoredAnimation,
): AuthoredAnimationResult {
  const index = document.markers.findIndex((marker) => marker.id === markerId);
  const value = document.markers[index]?.meta?.animation;
  const diagnostics: AuthoredAnimationDiagnostic[] = [];
  if (value === undefined) return { animation: defaults, diagnostics };
  if (value === "auto" || value === "none") return { animation: value, diagnostics };
  const path = `markers[${index}].meta.animation`;
  const reject = (location: string, message: string, requirement: string) => {
    diagnostics.push({ path: location, message, repair: `Use ${requirement}, or remove the animation override to inherit the game setting.` });
  };
  if (!record(value)) {
    reject(path, "Animation must be an object, auto, or none", "an animation object, auto, or none");
    return { animation: defaults, diagnostics };
  }
  for (const key of ["clip"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") reject(`${path}.${key}`, `${key} must be a string`, "a clip-name string");
  }
  for (const key of ["loop", "paused"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") reject(`${path}.${key}`, `${key} must be a boolean`, "true or false");
  }
  for (const key of ["timeScale", "time"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) reject(`${path}.${key}`, `${key} must be a finite number`, "a finite number");
  }
  if (value.states !== undefined) {
    if (!record(value.states)) reject(`${path}.states`, "states must be an object", "a role-mapping object");
    else {
      for (const key of ["idle", "walk", "run"] as const) {
        if (value.states[key] !== undefined && typeof value.states[key] !== "string") reject(`${path}.states.${key}`, `${key} must be a string`, "a clip-name string");
      }
      for (const key of ["walkSpeed", "runSpeed", "fadeSec"] as const) {
        const number = value.states[key];
        if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number))) reject(`${path}.states.${key}`, `${key} must be a finite number`, "a finite number");
      }
    }
  }
  if (value.oneShots !== undefined) {
    if (!record(value.oneShots)) reject(`${path}.oneShots`, "oneShots must be an object", "an event-to-clip mapping object");
    else for (const [event, clips] of Object.entries(value.oneShots)) {
      if (typeof clips !== "string" && !(Array.isArray(clips) && clips.every((clip) => typeof clip === "string"))) reject(`${path}.oneShots[${JSON.stringify(event)}]`, "One-shot clips must be a string or an array of strings", "a clip-name string or an array of clip-name strings");
    }
  }
  let animation = value as unknown as AuthoredAnimation;
  if (value.graph !== undefined) {
    const graph = validateAnimGraph(value.graph);
    for (const diagnostic of graph.diagnostics) diagnostics.push({ ...diagnostic, path: `${path}.graph${diagnostic.path === "" ? "" : `.${diagnostic.path}`}` });
    if (graph.graph !== undefined) animation = { ...value, graph: graph.graph };
  }
  return { animation: diagnostics.length === 0 ? animation : defaults, diagnostics };
}

/**
 * Reads the latest immutable document each call, validating only when document identity changes.
 * The caller owns the marker-to-character association and its asset-specific animation defaults.
 * @capability authored-animation consume live authored character animation with bounded per-frame work
 */
export function createAuthoredAnimationReader(
  getDocument: () => AuthoredAnimationDocumentLike,
  markerId: string,
  defaults?: AuthoredAnimation,
): () => AuthoredAnimationResult {
  let previous: AuthoredAnimationDocumentLike | undefined;
  let result: AuthoredAnimationResult;
  return () => {
    const document = getDocument();
    if (document !== previous) {
      result = readAuthoredAnimation(document, markerId, defaults);
      previous = document;
    }
    return result;
  };
}
