import type { MovementFeelConfig, PlayerMovementConfig } from "../game/playableGame";
import type { PhysicsConfig } from "../game/defineGame";
import type { ParamSchema } from "../scene/sceneKinds";
import type { EditorCatalogData } from "./types";

/** Numeric character controls a game elects to author through its own named catalog rows. */
export interface AuthoredMovementValues {
  walkSpeed?: number;
  gravity?: number;
  jumpVelocity?: number;
  stepHeight?: number;
  /** Optional positive heightfield collision span from feet; independent of model and camera scale. */
  collisionHeight?: number;
  /** Optional heightfield rise/run limit; omitted controls retain the game's movement policy. */
  maxClimbGrade?: number;
  groundAcceleration?: number;
  airAcceleration?: number;
  groundFriction?: number;
  runMultiplier?: number;
  crouchMultiplier?: number;
}

/** Only authored values, ready to overlay on a game's existing movement and physics policy. */
export interface AuthoredMovementConfig {
  readonly walkSpeed?: number;
  readonly physics?: { readonly gravity?: number; readonly jumpVelocity?: number };
  readonly movement?: Pick<PlayerMovementConfig, "stepHeight" | "collisionHeight" | "maxClimbGrade" | "feel">;
}

/** A persisted movement value rejected before it can replace the game's current setting. */
export interface AuthoredMovementDiagnostic {
  readonly path: string;
  readonly message: string;
  readonly repair: string;
}

/** Valid partial tuning plus located rejected values; absent rows leave game defaults intact. */
export interface AuthoredMovementResult {
  readonly config: AuthoredMovementConfig;
  readonly diagnostics: readonly AuthoredMovementDiagnostic[];
}

/** Structural authored catalog input; an immutable EditorDocument satisfies it. */
export interface MovementCatalogDocumentLike {
  readonly catalogs: readonly EditorCatalogData[];
}

/** Game-owned callbacks, collision and physics settings retained beneath authored numeric controls. */
export interface AuthoredMovementDefaults {
  readonly movement?: PlayerMovementConfig;
  readonly physics?: PhysicsConfig;
}

/** Stable runtime objects whose numeric getters resolve the current authored document. */
export interface AuthoredMovementBinding {
  readonly movement: PlayerMovementConfig;
  readonly physics: PhysicsConfig;
  readonly diagnostics: readonly AuthoredMovementDiagnostic[];
}

const FIELDS = [
  { key: "walkSpeed", label: "Walk speed", group: "movement", min: 0, step: 0.1 },
  { key: "gravity", label: "Gravity", group: "jump", step: 0.5 },
  { key: "jumpVelocity", label: "Jump velocity", group: "jump", min: 0, step: 0.1 },
  { key: "stepHeight", label: "Step height", group: "movement", min: 0, step: 0.05 },
  { key: "collisionHeight", label: "Collision height", group: "movement", min: Number.MIN_VALUE, step: 0.1 },
  { key: "maxClimbGrade", label: "Max climb grade", group: "movement", min: 0, step: 0.05 },
  { key: "groundAcceleration", label: "Ground acceleration", group: "response", min: 0, step: 1 },
  { key: "airAcceleration", label: "Air control", group: "response", min: 0, step: 1 },
  { key: "groundFriction", label: "Braking", group: "response", min: 0, step: 1 },
  { key: "runMultiplier", label: "Sprint multiplier", group: "movement", min: 0, step: 0.1 },
  { key: "crouchMultiplier", label: "Crouch multiplier", group: "movement", min: 0, step: 0.05 },
] as const;

function validValue(field: (typeof FIELDS)[number], value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && (!("min" in field) || value >= field.min);
}

function numberRequirement(field: (typeof FIELDS)[number]): string {
  return field.key === "collisionHeight" ? " positive" : "min" in field ? " nonnegative" : "";
}

/**
 * Creates editor/RPC controls only for the values a game supplies, with those game's defaults.
 * Gravity retains the game's sign convention; collision height is positive, other controls nonnegative.
 * @capability editor-movement author game-chosen character movement controls through ordinary catalog rows
 */
export function createMovementSchema(defaults: AuthoredMovementValues): ParamSchema {
  const fields: ParamSchema["fields"][number][] = [];
  for (const field of FIELDS) {
    const value = defaults[field.key];
    if (value === undefined) continue;
    if (!validValue(field, value)) throw new Error(`Invalid movement default ${field.key}: use a finite${numberRequirement(field)} number`);
    fields.push({ ...field, type: "number", default: value });
  }
  return {
    fields,
    groups: [
      { id: "movement", label: "Movement" },
      { id: "jump", label: "Jump" },
      { id: "response", label: "Response", collapsed: true },
    ].filter((group) => fields.some((field) => field.group === group.id)),
  };
}

/**
 * Reads one game-named row as partial runtime tuning, retaining game defaults for omitted or invalid
 * values. Rejected values include their document path and repair; no policy callbacks are replaced.
 * @capability editor-movement resolve saved movement controls without replacing a game's character rules
 */
export function readAuthoredMovement(
  document: MovementCatalogDocumentLike,
  catalogId: string,
  entryId: string,
): AuthoredMovementResult {
  const catalogIndex = document.catalogs.findIndex((catalog) => catalog.id === catalogId);
  const catalog = document.catalogs[catalogIndex];
  const entryIndex = catalog?.entries.findIndex((entry) => entry.id === entryId) ?? -1;
  const meta = catalog?.entries[entryIndex]?.meta;
  const config: { walkSpeed?: number; physics?: { gravity?: number; jumpVelocity?: number }; movement?: { stepHeight?: number; collisionHeight?: number; maxClimbGrade?: number; feel?: MovementFeelConfig } } = {};
  const diagnostics: AuthoredMovementDiagnostic[] = [];
  if (meta === undefined) return { config, diagnostics };
  for (const field of FIELDS) {
    const value = meta[field.key];
    if (value === undefined) continue;
    if (!validValue(field, value)) {
      diagnostics.push({
        path: `catalogs[${catalogIndex}].entries[${entryIndex}].meta.${field.key}`,
        message: `${field.key} must be a finite${numberRequirement(field)} number`,
        repair: `Set ${field.key} to a valid number or remove it to inherit the game setting.`,
      });
      continue;
    }
    if (field.key === "walkSpeed") config.walkSpeed = value;
    else if (field.key === "gravity" || field.key === "jumpVelocity") (config.physics ??= {})[field.key] = value;
    else if (field.key === "stepHeight" || field.key === "collisionHeight" || field.key === "maxClimbGrade") (config.movement ??= {})[field.key] = value;
    else ((config.movement ??= {}).feel ??= {})[field.key] = value;
  }
  return { config, diagnostics };
}

/**
 * Memoizes movement resolution by immutable document identity; reads the latest document on every
 * call while catalog lookup and diagnostics run only after authoring changes.
 * @capability editor-movement consume live saved movement tuning with bounded per-frame work
 */
export function createAuthoredMovementReader(
  getDocument: () => MovementCatalogDocumentLike,
  catalogId: string,
  entryId: string,
): () => AuthoredMovementResult {
  let previous: MovementCatalogDocumentLike | undefined;
  let result: AuthoredMovementResult;
  return () => {
    const document = getDocument();
    if (document !== previous) {
      result = readAuthoredMovement(document, catalogId, entryId);
      previous = document;
    }
    return result;
  };
}

/**
 * Binds live authored numeric controls onto stable runtime objects, preserving the game's callbacks,
 * collision, backend and other policy. The movement controller reads these getters each step.
 * @capability editor-movement bind live character tuning while preserving distinctive game policy
 */
export function bindAuthoredMovement(
  read: () => AuthoredMovementResult,
  defaults: AuthoredMovementDefaults,
): AuthoredMovementBinding {
  let previous: AuthoredMovementResult | undefined;
  let previousBase: MovementFeelConfig | undefined;
  let feel: MovementFeelConfig | undefined;
  return {
    movement: {
      ...defaults.movement,
      get stepHeight() { return read().config.movement?.stepHeight ?? defaults.movement?.stepHeight; },
      get collisionHeight() { return read().config.movement?.collisionHeight ?? defaults.movement?.collisionHeight; },
      get maxClimbGrade() { return read().config.movement?.maxClimbGrade ?? defaults.movement?.maxClimbGrade; },
      get feel() {
        const current = read();
        const base = defaults.movement?.feel;
        if (current !== previous || base !== previousBase) {
          const authored = current.config.movement?.feel;
          feel = authored === undefined ? base : { ...base, ...authored };
          previous = current;
          previousBase = base;
        }
        return feel;
      },
    },
    physics: {
      ...defaults.physics,
      get gravity() { return read().config.physics?.gravity ?? defaults.physics?.gravity; },
      get jumpVelocity() { return read().config.physics?.jumpVelocity ?? defaults.physics?.jumpVelocity; },
    },
    get diagnostics() { return read().diagnostics; },
  };
}
