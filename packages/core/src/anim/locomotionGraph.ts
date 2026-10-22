import type { ModelAnimationConfig } from "../game/playableGame";
import type { AnimGraph, AnimState, AnimTransition } from "./animGraph";

/** Inputs for {@link locomotionGraph}: the locomotion clip names and the one-shot table a rig config already carries. */
export interface LocomotionGraphInput {
  idle: string;
  walk: string;
  run?: string;
  /** Clip for moving to the character's left; adds the `strafe` state. */
  strafeLeft?: string;
  /** Clip for moving to the character's right; adds the `strafe` state. */
  strafeRight?: string;
  /** Clip for moving backwards; adds the `backward` state. */
  backward?: string;
  /** Clip for turning on the spot. Omitted, the turn blend uses `walk` as its pivot step. */
  turn?: string;
  /** Speed (world units/sec) above which the character walks. Default 0.5. */
  walkSpeed?: number;
  /** Speed above which it runs. Default 6. */
  runSpeed?: number;
  /** Crossfade seconds between locomotion states. Default 0.2. */
  fadeSec?: number;
  /** Lateral share above which the character counts as strafing. Default 0.35. */
  strafeGate?: number;
  /** Lateral share at or below which it stops strafing. Default 0.2. */
  strafeRelease?: number;
  /** Facing-vs-motion dot below which it counts as moving backwards. Default -0.35. */
  backwardGate?: number;
  /** Facing-vs-motion dot at or above which it stops. Default -0.2. */
  backwardRelease?: number;
  /** Turn rate (radians/sec) above which the character counts as turning on the spot. Default 1.5. */
  turnGate?: number;
  /** Turn rate at which the turn blend reaches its pivot clip. Default 4. */
  turnFull?: number;
  /** Speed below which a turn counts as turning on the spot. Default 0.5. */
  turnSpeed?: number;
  /**
   * Mark every locomotion state as a root-motion state, so the rig plays in place and the blended
   * root travel comes out as `AnimGraphOutput.rootDelta`. The movement owner consumes it with
   * `takeRootMotion` and resolves it through its controller. Off by default, for rigs whose clips
   * are authored in place.
   */
  rootMotion?: boolean;
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
/**
 * Signed lateral share of the character's motion: `-1` fully to its left, `+1` fully to its right,
 * `0` straight ahead or straight back. A custom mover feeds it under `ANIM_PARAMS_KEY`.
 */
export const LOCOMOTION_DIRECTION_PARAM = "direction";
/**
 * Dot of the character's facing with its motion direction: `1` running forward, `-1` running
 * backwards. A custom mover feeds it under `ANIM_PARAMS_KEY`.
 */
export const LOCOMOTION_FACING_PARAM = "facing";
/** Signed yaw rate in radians/sec; a custom mover feeds it under `ANIM_PARAMS_KEY`. */
export const LOCOMOTION_TURN_RATE_PARAM = "turnRate";
/** Layer id the locomotion graph uses; query `runtime.stateOf(LOCOMOTION_LAYER)`. */
export const LOCOMOTION_LAYER = "base";
/** State id of the forward idle/walk/run blend. */
export const LOCOMOTION_STATE = "locomotion";
/** State id of the lateral strafe blend. */
export const LOCOMOTION_STRAFE_STATE = "strafe";
/** State id of the backwards blend. */
export const LOCOMOTION_BACKWARD_STATE = "backward";
/** State id of the on-the-spot turn blend. */
export const LOCOMOTION_TURN_STATE = "turn";

const DEFAULT_STRAFE_GATE = 0.35;
const DEFAULT_STRAFE_RELEASE = 0.2;
const DEFAULT_BACKWARD_GATE = -0.35;
const DEFAULT_BACKWARD_RELEASE = -0.2;
const DEFAULT_TURN_GATE = 1.5;
const DEFAULT_TURN_FULL = 4;
const DEFAULT_TURN_SPEED = 0.5;

/**
 * The engine's default locomotion as an authored graph: a speed-driven blend between idle, walk and
 * run, plus a state per one-shot that plays once and returns (or clamps for `death`). What
 * `useModelAnimation` used to hardcode.
 *
 * Supplying `strafeLeft`/`strafeRight` adds a `strafe` blend on the `direction` parameter, and
 * `backward` and `turn` add their states behind the `facing` and `turnRate` parameters. Each extra
 * state is joined to the base by a crossfaded transition, so a direction change blends rather than
 * pops; without them the graph is exactly the speed-only tree it has always been.
 *
 * @capability locomotion-graph build the default idle/walk/run plus one-shot graph from clip names
 */
export function locomotionGraph(input: LocomotionGraphInput): AnimGraph {
  const walkSpeed = input.walkSpeed ?? 0.5;
  const runSpeed = input.runSpeed ?? 6;
  const fade = input.fadeSec ?? 0.2;
  const rootMotion = input.rootMotion === true ? { rootMotion: true as const } : {};
  const states: Record<string, AnimState> = {
    [LOCOMOTION_STATE]: {
      kind: "blend1D",
      param: LOCOMOTION_SPEED_PARAM,
      points: [
        { at: 0, clip: input.idle },
        { at: walkSpeed, clip: input.walk },
        ...(input.run === undefined ? [] : [{ at: runSpeed, clip: input.run }]),
      ],
      ...rootMotion,
    },
  };
  const directional: AnimTransition[] = [];

  const strafes = [input.strafeLeft, input.strafeRight];
  if (strafes.some((clip) => clip !== undefined)) {
    const gate = input.strafeGate ?? DEFAULT_STRAFE_GATE;
    const release = input.strafeRelease ?? DEFAULT_STRAFE_RELEASE;
    const points = [
      ...(input.strafeLeft === undefined ? [] : [{ at: -1, clip: input.strafeLeft }]),
      ...(input.strafeRight === undefined ? [] : [{ at: 1, clip: input.strafeRight }]),
    ];
    states[LOCOMOTION_STRAFE_STATE] = { kind: "blend1D", param: LOCOMOTION_DIRECTION_PARAM, points, ...rootMotion };
    for (const side of [-1, 1] as const) {
      directional.push({
        from: LOCOMOTION_STATE,
        to: LOCOMOTION_STRAFE_STATE,
        when: [{ param: LOCOMOTION_DIRECTION_PARAM, op: side < 0 ? "<" : ">", value: side * gate }],
        duration: fade,
      });
    }
    directional.push({
      from: LOCOMOTION_STRAFE_STATE,
      to: LOCOMOTION_STATE,
      when: [
        { param: LOCOMOTION_DIRECTION_PARAM, op: ">=", value: -release },
        { param: LOCOMOTION_DIRECTION_PARAM, op: "<=", value: release },
      ],
      duration: fade,
    });
  }

  if (input.backward !== undefined) {
    const gate = input.backwardGate ?? DEFAULT_BACKWARD_GATE;
    const release = input.backwardRelease ?? DEFAULT_BACKWARD_RELEASE;
    states[LOCOMOTION_BACKWARD_STATE] = { kind: "blend1D", param: LOCOMOTION_SPEED_PARAM, points: [{ at: walkSpeed, clip: input.backward }], ...rootMotion };
    for (const from of [LOCOMOTION_STATE, LOCOMOTION_STRAFE_STATE]) {
      if (states[from] === undefined) continue;
      directional.push({
        from,
        to: LOCOMOTION_BACKWARD_STATE,
        when: [
          { param: LOCOMOTION_FACING_PARAM, op: "<", value: gate },
          { param: LOCOMOTION_SPEED_PARAM, op: ">", value: walkSpeed * 0.5 },
        ],
        duration: fade,
      });
    }
    directional.push({
      from: LOCOMOTION_BACKWARD_STATE,
      to: LOCOMOTION_STATE,
      when: [{ param: LOCOMOTION_FACING_PARAM, op: ">=", value: release }],
      duration: fade,
    });
  }

  const turnGate = input.turnGate ?? DEFAULT_TURN_GATE;
  const turnFull = input.turnFull ?? DEFAULT_TURN_FULL;
  const turnSpeed = input.turnSpeed ?? DEFAULT_TURN_SPEED;
  states[LOCOMOTION_TURN_STATE] = {
    kind: "blend1D",
    param: LOCOMOTION_TURN_RATE_PARAM,
    points: [
      { at: turnGate, clip: input.idle },
      { at: turnFull, clip: input.turn ?? input.walk },
    ],
    ...rootMotion,
  };
  for (const from of [LOCOMOTION_STATE, LOCOMOTION_STRAFE_STATE, LOCOMOTION_BACKWARD_STATE]) {
    if (states[from] === undefined) continue;
    directional.push({
      from,
      to: LOCOMOTION_TURN_STATE,
      when: [
        { param: LOCOMOTION_TURN_RATE_PARAM, op: ">", value: turnGate },
        { param: LOCOMOTION_SPEED_PARAM, op: "<", value: turnSpeed },
      ],
      duration: fade,
    });
  }
  directional.push({
    from: LOCOMOTION_TURN_STATE,
    to: LOCOMOTION_STATE,
    when: [{ param: LOCOMOTION_TURN_RATE_PARAM, op: "<=", value: turnGate }],
    duration: fade,
  });

  const oneShots = Object.entries(input.oneShots ?? {}).filter(([, spec]) => typeof spec === "string" || spec.length > 0);
  oneShots.sort(([a], [b]) => Number(b === "death") - Number(a === "death"));
  for (const [name, spec] of oneShots) {
    const clip = typeof spec === "string" ? spec : spec[0]!;
    states[name] = { kind: "clip", clip, loop: false, ...(typeof spec === "string" || spec.length < 2 ? {} : { variants: [...spec] }) };
  }
  const triggered: AnimTransition[] = [];
  for (const [name] of oneShots) {
    for (const from of Object.keys(states)) {
      if (from !== "death") triggered.push({ from, to: name, trigger: name, duration: 0.1 });
    }
    if (name !== "death") triggered.push({ from: name, to: LOCOMOTION_STATE, exitTime: 1, duration: fade });
  }
  return {
    layers: [{ id: LOCOMOTION_LAYER, entry: LOCOMOTION_STATE, states, transitions: [...triggered, ...directional] }],
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
  const clip = (value: string | undefined): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value : undefined;
  return locomotionGraph({
    idle: states.idle,
    walk: clip(states.walk) ?? states.idle,
    ...(clip(states.run) === undefined ? {} : { run: clip(states.run)! }),
    ...(clip(states.strafeLeft) === undefined ? {} : { strafeLeft: clip(states.strafeLeft)! }),
    ...(clip(states.strafeRight) === undefined ? {} : { strafeRight: clip(states.strafeRight)! }),
    ...(clip(states.backward) === undefined ? {} : { backward: clip(states.backward)! }),
    ...(clip(states.turn) === undefined ? {} : { turn: clip(states.turn)! }),
    ...(states.rootMotion === true ? { rootMotion: true } : {}),
    walkSpeed: states.walkSpeed,
    runSpeed: states.runSpeed,
    fadeSec: states.fadeSec,
    ...(config.oneShots === undefined ? {} : { oneShots: config.oneShots }),
  });
}
