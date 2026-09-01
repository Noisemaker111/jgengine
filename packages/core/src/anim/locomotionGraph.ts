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
  oneShots?: Readonly<Record<string, string>>;
}

/** The parameter name the shell feeds with the entity's smoothed ground speed. */
export const LOCOMOTION_SPEED_PARAM = "speed";
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
  const transitions: AnimTransition[] = [];
  for (const [name, clip] of Object.entries(input.oneShots ?? {})) {
    states[name] = { kind: "clip", clip, loop: false };
    transitions.push({ from: "*", to: name, trigger: name, duration: 0.1 });
    if (name !== "death") transitions.push({ from: name, to: "locomotion", exitTime: 1, duration: fade });
  }
  return {
    layers: [{ id: LOCOMOTION_LAYER, entry: "locomotion", states, transitions }],
  };
}
