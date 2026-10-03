import type { ModelAnimationConfig } from "../game/playableGame";
import type { AnimGraph, AnimLayer, AnimTransition } from "./animGraph";

/** Inputs for {@link locomotionGraph}: the idle/walk/run clip names and the one-shot table a rig config already carries. */
export interface LocomotionGraphInput {
  idle: string;
  walk: string;
  run?: string;
  /** Speed (world units/sec) above which the character walks. Default 0.5. */
  walkSpeed?: number;
  /** Speed above which it runs. Default 6. */
  runSpeed?: number;
  /** Crossfade seconds between locomotion states. Default 0.2. */
  fadeSec?: number;
  /** One-shot clips keyed by trigger name; `death` holds its last frame instead of returning. */
  oneShots?: Readonly<Record<string, string | readonly string[]>>;
}

/** The parameter name the shell feeds with the entity's smoothed ground speed. */
export const LOCOMOTION_SPEED_PARAM = "speed";
/** Ground contact reported by the shared player motor; absent for custom movers without authored parameters. */
export const LOCOMOTION_GROUNDED_PARAM = "grounded";
/** Resolved vertical velocity from the shared player motor, in world units/sec. */
export const LOCOMOTION_VERTICAL_SPEED_PARAM = "verticalSpeed";
/** Physically resolved crouch stance from the shared player motor. */
export const LOCOMOTION_CROUCHED_PARAM = "crouched";
/** Layer id the locomotion graph uses; query `runtime.stateOf(LOCOMOTION_LAYER)`. */
export const LOCOMOTION_LAYER = "base";

/**
 * The engine's default locomotion as an authored graph: a speed-driven blend between idle, walk, and run, plus a
 * state per one-shot that plays once and returns (or clamps for `death`). What `useModelAnimation` used to hardcode.
 *
 * @capability locomotion-graph build the default idle/walk/run plus one-shot graph from clip names
 */
export function locomotionGraph(input: LocomotionGraphInput): AnimGraph {
  const walkSpeed = input.walkSpeed ?? 0.5;
  const runSpeed = input.runSpeed ?? 6;
  const fade = input.fadeSec ?? 0.2;
  const points = [
    { at: 0, clip: input.idle },
    { at: walkSpeed, clip: input.walk },
    ...(input.run === undefined ? [] : [{ at: runSpeed, clip: input.run }]),
  ];
  const states: Record<string, AnimLayer["states"][string]> = {
    locomotion: { kind: "blend1D", param: LOCOMOTION_SPEED_PARAM, points },
  };
  const oneShots = Object.entries(input.oneShots ?? {}).filter(([, spec]) => typeof spec === "string" || spec.length > 0);
  for (const [name, spec] of oneShots) {
    const clip = typeof spec === "string" ? spec : spec[0]!;
    states[name] = { kind: "clip", clip, loop: false, ...(typeof spec === "string" || spec.length < 2 ? {} : { variants: [...spec] }) };
  }
  const transitions: AnimTransition[] = [];
  oneShots.sort(([a], [b]) => Number(b === "death") - Number(a === "death"));
  for (const [name] of oneShots) {
    for (const from of Object.keys(states)) {
      if (from !== "death") transitions.push({ from, to: name, trigger: name, duration: 0.1 });
    }
    if (name !== "death") transitions.push({ from: name, to: "locomotion", exitTime: 1, duration: fade });
  }
  return {
    layers: [{ id: LOCOMOTION_LAYER, entry: "locomotion", states, transitions }],
  };
}

/**
 * The graph a model animation config plays: its `graph`, or the {@link locomotionGraph} its
 * `states` and `oneShots` describe, retaining every one-shot variant. `undefined` for a
 * single-clip config or incomplete locomotion roles. Idle must name a clip; an absent or blank
 * walk role holds that idle clip at walking speeds until configured. The shell plays this and
 * the editor inspects it, so both see the same graph.
 *
 * @capability locomotion-graph resolve the animation graph a model config plays
 */
export function animGraphFromConfig(config: ModelAnimationConfig): AnimGraph | undefined {
  if (config.graph !== undefined) return config.graph;
  const states = config.states;
  if (states === undefined || typeof states.idle !== "string" || states.idle.trim().length === 0) return undefined;
  return locomotionGraph({
    idle: states.idle,
    walk: typeof states.walk === "string" && states.walk.trim().length > 0 ? states.walk : states.idle,
    ...(typeof states.run !== "string" || states.run.trim().length === 0 ? {} : { run: states.run }),
    walkSpeed: states.walkSpeed,
    runSpeed: states.runSpeed,
    fadeSec: states.fadeSec,
    ...(config.oneShots === undefined ? {} : { oneShots: config.oneShots }),
  });
}
