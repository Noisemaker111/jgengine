import type { AnimGraph } from "@jgengine/core/anim/animGraph";
import { readAuthoredAnimation, type AuthoredAnimationDiagnostic, type AuthoredAnimationDocumentLike } from "@jgengine/core/world/authoredAnimation";
import { animGraphFromConfig } from "@jgengine/core/anim/locomotionGraph";
import { resolveAnimationConfig, rolesFromClips } from "@jgengine/core/game/clipRoles";

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

export const LOCOMOTION_ROLES = ["idle", "walk", "run"] as const;
export type LocomotionRole = (typeof LOCOMOTION_ROLES)[number];

export const LOCOMOTION_NUMBERS = ["walkSpeed", "runSpeed", "fadeSec"] as const;
export type LocomotionNumber = (typeof LOCOMOTION_NUMBERS)[number];

export const ONE_SHOT_EVENTS = ["attack", "hit", "death", "jump", "interact", "cheer"] as const;
export type OneShotEvent = (typeof ONE_SHOT_EVENTS)[number];

export interface AuthoredAnimationStates {
  idle?: string;
  walk?: string;
  run?: string;
  walkSpeed?: number;
  runSpeed?: number;
  fadeSec?: number;
}

export interface AuthoredAnimationConfig {
  auto?: true;
  clock?: "real" | "game";
  clip?: string;
  loop?: boolean;
  timeScale?: number;
  paused?: boolean;
  time?: number;
  states?: AuthoredAnimationStates;
  oneShots?: Record<string, string | readonly string[]>;
  graph?: AnimGraph;
}

export type AnimationSetting = AuthoredAnimationConfig | "auto" | "none";

export type AnimationMode = "default" | "auto" | "none" | "custom";

export function readAnimationSetting(meta: Record<string, unknown> | undefined): AnimationSetting | undefined {
  return readAnimationSettingResult({ markers: [meta === undefined ? { id: "animation" } : { id: "animation", meta }] }, "animation").setting;
}

/** @internal */
export function readAnimationSettingResult(
  document: AuthoredAnimationDocumentLike,
  markerId: string,
): { setting: AnimationSetting | undefined; diagnostics: readonly AuthoredAnimationDiagnostic[] } {
  const result = readAuthoredAnimation(document, markerId);
  return { setting: result.animation as AnimationSetting | undefined, diagnostics: result.diagnostics };
}

export function animationMode(setting: AnimationSetting | undefined): AnimationMode {
  if (setting === undefined) return "default";
  if (setting === "auto") return "auto";
  if (setting === "none") return "none";
  return "custom";
}

function asConfig(setting: AnimationSetting | undefined): AuthoredAnimationConfig {
  return setting !== undefined && setting !== "auto" && setting !== "none" ? setting : {};
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
  return defaultCustomConfig(clips);
}

export function defaultCustomConfig(clips: readonly string[]): AuthoredAnimationConfig {
  const roles = rolesFromClips(clips);
  const states: AuthoredAnimationStates = {};
  if (roles.idle?.[0] !== undefined) states.idle = roles.idle[0];
  if (roles.walk?.[0] !== undefined) states.walk = roles.walk[0];
  if (roles.run?.[0] !== undefined) states.run = roles.run[0];
  const oneShots: Record<string, string | readonly string[]> = {};
  for (const event of ONE_SHOT_EVENTS) {
    const variants = roles[event];
    if (variants !== undefined && variants.length > 0) oneShots[event] = variants.length === 1 ? variants[0]! : [...variants];
  }
  const config: AuthoredAnimationConfig = {};
  if (Object.keys(states).length > 0) config.states = states;
  if (Object.keys(oneShots).length > 0) config.oneShots = oneShots;
  return config;
}

export function setLocomotionClip(
  setting: AnimationSetting | undefined,
  role: LocomotionRole,
  clipName: string | null,
  clips: readonly string[] = [],
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const states: AuthoredAnimationStates = { ...(config.states ?? (clipName === null ? undefined : defaultCustomConfig(clips).states)) };
  if (clipName === null) delete states[role];
  else states[role] = clipName;
  return { ...config, ...(config.states !== undefined || Object.keys(states).length > 0 ? { states } : {}) };
}

export function setLocomotionNumber(
  setting: AnimationSetting | undefined,
  key: LocomotionNumber,
  value: number | null,
  clips: readonly string[] = [],
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const states: AuthoredAnimationStates = { ...(config.states ?? (value === null || !Number.isFinite(value) ? undefined : defaultCustomConfig(clips).states)) };
  if (value === null || !Number.isFinite(value)) delete states[key];
  else states[key] = value;
  return { ...config, ...(config.states !== undefined || Object.keys(states).length > 0 ? { states } : {}) };
}

export function setOneShotClip(
  setting: AnimationSetting | undefined,
  event: string,
  clipName: string | readonly string[] | null,
): AuthoredAnimationConfig {
  const config = asConfig(setting);
  const oneShots: Record<string, string | readonly string[]> = { ...config.oneShots };
  if (clipName === null || (Array.isArray(clipName) && clipName.length === 0)) delete oneShots[event];
  else oneShots[event] = typeof clipName === "string" ? clipName : clipName.length === 1 ? clipName[0]! : [...clipName];
  const next: AuthoredAnimationConfig = { ...config, oneShots };
  if (Object.keys(oneShots).length === 0) delete next.oneShots;
  return next;
}

/** @internal */
export function setPlaybackClip(setting: AnimationSetting | undefined, clip: string | null): AuthoredAnimationConfig {
  if (clip === null) {
    const { clip: _clip, ...config } = asConfig(setting);
    return config;
  }
  const { states: _states, graph: _graph, auto: _auto, ...config } = asConfig(setting);
  return { ...config, clip };
}

/** @internal */
export function setPlaybackNumber(
  setting: AnimationSetting | undefined,
  key: "time" | "timeScale",
  value: number | null,
): AuthoredAnimationConfig {
  const config = { ...asConfig(setting) };
  if (value === null || !Number.isFinite(value)) delete config[key];
  else config[key] = key === "time" ? Math.max(0, value) : value;
  return config;
}

/** @internal */
export function setPlaybackClock(setting: AnimationSetting | undefined, clock: "real" | "game"): AuthoredAnimationConfig {
  return { ...(setting === "auto" ? { auto: true as const } : asConfig(setting)), clock };
}

/** @internal */
export function setAutomaticRoles(setting: AnimationSetting | undefined, derive: boolean): AuthoredAnimationConfig {
  const config = { ...asConfig(setting) };
  if (derive) config.auto = true;
  else delete config.auto;
  return config;
}

/** @internal */
export function setPlaybackBoolean(
  setting: AnimationSetting | undefined,
  key: "paused" | "loop",
  value: boolean,
): AuthoredAnimationConfig {
  return { ...asConfig(setting), [key]: value };
}

/**
 * The meta patch that persists a setting (or clears the override when undefined). Shallow-merges onto
 * `marker.meta` via `setMarker`; an undefined value drops out of the saved JSON document.
 */
export function animationMetaPatch(setting: AnimationSetting | undefined): { animation: AnimationSetting | undefined } {
  return { animation: setting };
}

export type AnimGraphSource = "authored" | "locomotion" | "auto";

export function effectiveAnimGraph(
  setting: AnimationSetting | undefined,
  clips: readonly string[],
): { graph: AnimGraph; source: AnimGraphSource } | null {
  if (setting === "none") return null;
  if (setting !== undefined && setting !== "auto" && setting.auto === true) {
    const resolved = resolveAnimationConfig(setting as Parameters<typeof resolveAnimationConfig>[0], clips);
    const graph = resolved === undefined ? undefined : animGraphFromConfig(resolved);
    return graph === undefined ? null : { graph, source: setting.graph !== undefined ? "authored" : setting.states !== undefined ? "locomotion" : "auto" };
  }
  if (setting !== undefined && setting !== "auto") {
    if (setting.graph !== undefined) return { graph: setting.graph, source: "authored" };
    const states = setting.states;
    if (states?.idle === undefined || states.idle.trim().length === 0) return null;
    const graph = animGraphFromConfig({
      states: { ...states, idle: states.idle, walk: states.walk === undefined || states.walk.trim().length === 0 ? states.idle : states.walk },
      ...(setting.oneShots === undefined ? {} : { oneShots: setting.oneShots }),
    });
    return graph === undefined ? null : { graph, source: "locomotion" };
  }
  const resolved = resolveAnimationConfig("auto", clips);
  const graph = resolved === undefined ? undefined : animGraphFromConfig(resolved);
  return graph === undefined ? null : { graph, source: "auto" };
}

export function storeAnimGraph(setting: AnimationSetting | undefined, graph: AnimGraph): AuthoredAnimationConfig {
  return { ...asConfig(setting), graph };
}

export function clearAnimGraph(setting: AnimationSetting | undefined): AnimationSetting | undefined {
  if (setting === undefined || setting === "auto" || setting === "none") return setting;
  const { graph: _graph, ...rest } = setting;
  return Object.keys(rest).length === 0 ? undefined : rest;
}

/**
 * Sets one transition's crossfade seconds in `graph` and stores the result, so editing a derived
 * graph turns it into an authored one.
 */
export function setTransitionDuration(
  setting: AnimationSetting | undefined,
  graph: AnimGraph,
  layerId: string,
  index: number,
  duration: number,
): AuthoredAnimationConfig {
  const next: AnimGraph = {
    ...graph,
    layers: graph.layers.map((layer) =>
      layer.id !== layerId
        ? layer
        : {
            ...layer,
            transitions: layer.transitions.map((transition, i) =>
              i === index ? { ...transition, duration: Math.max(0, Number.isFinite(duration) ? duration : 0) } : transition,
            ),
          },
    ),
  };
  return storeAnimGraph(setting, next);
}
