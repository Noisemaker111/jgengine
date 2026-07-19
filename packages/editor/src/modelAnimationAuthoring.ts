import { rolesFromClips } from "@jgengine/core/game/clipRoles";

/**
 * Authoring model for a placement's `ModelConfig.animation`, persisted on a marker's `meta.animation`
 * and consumed by the shell exactly like a game-authored config. Pure data + reducers, no JSX — the
 * inspector section wires these to `session.dispatch({ type: "setMarker", ... })` so every edit is
 * undoable like any other inspector change. Splitting this out mirrors how `pathFlythrough.ts` /
 * `renameObject.ts` keep inspector logic testable apart from the panel.
 *
 * The stored value is either the string modes `"auto"` / `"none"` (see `resolveAnimationConfig`) or a
 * concrete config object. `undefined` means "no override" — a catalog-resolved rigged asset still
 * auto-animates from its clip roles. Authored types here are permissive supersets of core's
 * `ModelAnimationConfig` so an in-progress edit (idle picked, walk not yet) is still storable.
 *
 * @internal
 */

/** Locomotion state roles the speed-driven idle/walk/run crossfade reads. */
export const LOCOMOTION_ROLES = ["idle", "walk", "run"] as const;
/** Locomotion clip role a placement can override (idle/walk/run). */
export type LocomotionRole = (typeof LOCOMOTION_ROLES)[number];

/** Numeric locomotion tunings (`ModelAnimationStates`). */
export const LOCOMOTION_NUMBERS = ["walkSpeed", "runSpeed", "fadeSec"] as const;
/** Numeric locomotion tuning field on an authored animation config (walkSpeed/runSpeed/fadeSec). */
export type LocomotionNumber = (typeof LOCOMOTION_NUMBERS)[number];

/**
 * One-shot event slots offered in the inspector. `hit` / `death` auto-fire on this entity's
 * `combat.hitReaction` / `entity.died`; the rest fire when the game calls `playEntityAnimation`.
 */
export const ONE_SHOT_EVENTS = ["attack", "hit", "death", "jump", "interact", "cheer"] as const;
/** One-shot animation event a placement can bind a clip to (attack/hit/death/...). */
export type OneShotEvent = (typeof ONE_SHOT_EVENTS)[number];

/** Role->clip override map persisted inside an authored animation config. */
export interface AuthoredAnimationStates {
  idle?: string;
  walk?: string;
  run?: string;
  walkSpeed?: number;
  runSpeed?: number;
  fadeSec?: number;
}

/** Structurally compatible with `ModelAnimationConfig`, but every field optional for authoring. */
export interface AuthoredAnimationConfig {
  clip?: string;
  loop?: boolean;
  timeScale?: number;
  states?: AuthoredAnimationStates;
  oneShots?: Record<string, string>;
}

/** The value stored at `meta.animation`. */
export type AnimationSetting = AuthoredAnimationConfig | "auto" | "none";

/** Which authoring mode a stored setting represents. `default` = no override key. */
export type AnimationMode = "default" | "auto" | "none" | "custom";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads and shape-validates the animation override from a marker's meta; undefined when absent/invalid. */
export function readAnimationSetting(meta: Record<string, unknown> | undefined): AnimationSetting | undefined {
  const value = meta?.["animation"];
  if (value === "auto" || value === "none") return value;
  if (!isRecord(value)) return undefined;
  const config: AuthoredAnimationConfig = {};
  if (typeof value["clip"] === "string") config.clip = value["clip"];
  if (typeof value["loop"] === "boolean") config.loop = value["loop"];
  if (typeof value["timeScale"] === "number") config.timeScale = value["timeScale"];
  if (isRecord(value["states"])) {
    const raw = value["states"];
    const states: AuthoredAnimationStates = {};
    for (const role of LOCOMOTION_ROLES) if (typeof raw[role] === "string") states[role] = raw[role] as string;
    for (const key of LOCOMOTION_NUMBERS) if (typeof raw[key] === "number") states[key] = raw[key] as number;
    if (Object.keys(states).length > 0) config.states = states;
  }
  if (isRecord(value["oneShots"])) {
    const raw = value["oneShots"];
    const oneShots: Record<string, string> = {};
    for (const [event, clip] of Object.entries(raw)) {
      if (typeof clip === "string") oneShots[event] = clip;
      else if (Array.isArray(clip) && typeof clip[0] === "string") oneShots[event] = clip[0];
    }
    if (Object.keys(oneShots).length > 0) config.oneShots = oneShots;
  }
  return config;
}

/** The authoring mode a stored setting maps to. */
export function animationMode(setting: AnimationSetting | undefined): AnimationMode {
  if (setting === undefined) return "default";
  if (setting === "auto") return "auto";
  if (setting === "none") return "none";
  return "custom";
}

function asConfig(setting: AnimationSetting | undefined): AuthoredAnimationConfig {
  return setting !== undefined && setting !== "auto" && setting !== "none" ? setting : {};
}

function normalizeConfig(config: AuthoredAnimationConfig): AuthoredAnimationConfig {
  const next: AuthoredAnimationConfig = { ...config };
  if (next.states !== undefined && Object.keys(next.states).length === 0) delete next.states;
  if (next.oneShots !== undefined && Object.keys(next.oneShots).length === 0) delete next.oneShots;
  return next;
}

/**
 * Switches authoring mode. `custom` seeds from the asset's clip-role defaults (so the user starts from
 * a working config, then overrides) when there is no existing object config; the other modes are the
 * bare string/undefined values.
 */
export function setAnimationMode(
  setting: AnimationSetting | undefined,
  mode: AnimationMode,
  clips: readonly string[] = [],
): AnimationSetting | undefined {
  if (mode === "default") return undefined;
  if (mode === "auto") return "auto";
  if (mode === "none") return "none";
  if (setting !== undefined && setting !== "auto" && setting !== "none") return setting;
  return normalizeConfig(defaultCustomConfig(clips));
}

/** A concrete custom config derived from a rigged asset's clip roles — the `custom` mode seed. */
export function defaultCustomConfig(clips: readonly string[]): AuthoredAnimationConfig {
  const roles = rolesFromClips(clips);
  const states: AuthoredAnimationStates = {};
  if (roles.idle?.[0] !== undefined) states.idle = roles.idle[0];
  if (roles.walk?.[0] !== undefined) states.walk = roles.walk[0];
  if (roles.run?.[0] !== undefined) states.run = roles.run[0];
  const oneShots: Record<string, string> = {};
  for (const event of ONE_SHOT_EVENTS) {
    const variant = roles[event]?.[0];
    if (variant !== undefined) oneShots[event] = variant;
  }
  const config: AuthoredAnimationConfig = {};
  if (Object.keys(states).length > 0) config.states = states;
  if (Object.keys(oneShots).length > 0) config.oneShots = oneShots;
  return config;
}

/** Sets or clears (null) a locomotion state clip; forces the setting into `custom`. */
export function setLocomotionClip(
  setting: AnimationSetting | undefined,
  role: LocomotionRole,
  clipName: string | null,
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const states: AuthoredAnimationStates = { ...config.states };
  if (clipName === null) delete states[role];
  else states[role] = clipName;
  return normalizeConfig({ ...config, states });
}

/** Sets or clears (null) a numeric locomotion tuning. */
export function setLocomotionNumber(
  setting: AnimationSetting | undefined,
  key: LocomotionNumber,
  value: number | null,
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const states: AuthoredAnimationStates = { ...config.states };
  if (value === null || !Number.isFinite(value)) delete states[key];
  else states[key] = value;
  return normalizeConfig({ ...config, states });
}

/** Binds or clears (null) a one-shot event to a clip. */
export function setOneShotClip(
  setting: AnimationSetting | undefined,
  event: string,
  clipName: string | null,
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const oneShots: Record<string, string> = { ...config.oneShots };
  if (clipName === null) delete oneShots[event];
  else oneShots[event] = clipName;
  return normalizeConfig({ ...config, oneShots });
}

/**
 * The meta patch that persists a setting (or clears the override when undefined). Shallow-merges onto
 * `marker.meta` via `setMarker`; an undefined value drops out of the saved JSON document.
 */
export function animationMetaPatch(setting: AnimationSetting | undefined): { animation: AnimationSetting | undefined } {
  return { animation: setting };
}
