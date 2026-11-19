import type { ModelAnimationConfig } from "../game/playableGame";
import type { AnimGraph, AnimState, AnimTransition } from "./animGraph";

export interface LocomotionGraphInput {
  idle: string;
  walk: string;
  run?: string;
  strafeLeft?: string;
  strafeRight?: string;
  backward?: string;
  turn?: string;
  jump?: string;
  swim?: string;
  tread?: string;
  /** Speed (world units/sec) above which the character walks. Default 0.5. */
  walkSpeed?: number | undefined;
  runSpeed?: number | undefined;
  /** Crossfade seconds between locomotion states. Default 0.2. */
  fadeSec?: number | undefined;
  strafeGate?: number;
  strafeRelease?: number;
  backwardGate?: number;
  backwardRelease?: number;
  /** Turn rate (radians/sec) above which the character counts as turning on the spot. Default 1.5. */
  turnGate?: number;
  turnFull?: number;
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

export const LOCOMOTION_SPEED_PARAM = "speed";
export const LOCOMOTION_GROUNDED_PARAM = "grounded";
/** Resolved vertical velocity from the shared player motor, in world units/sec. */
export const LOCOMOTION_VERTICAL_SPEED_PARAM = "verticalSpeed";
export const LOCOMOTION_CROUCHED_PARAM = "crouched";
export const LOCOMOTION_AIRBORNE_PARAM = "airborne";
export const LOCOMOTION_SWIMMING_PARAM = "swimming";
export const LOCOMOTION_DIRECTION_PARAM = "direction";
export const LOCOMOTION_FACING_PARAM = "facing";
/** Signed yaw rate in radians/sec; a custom mover feeds it under `ANIM_PARAMS_KEY`. */
export const LOCOMOTION_TURN_RATE_PARAM = "turnRate";
export const LOCOMOTION_LAYER = "base";
export const LOCOMOTION_STATE = "locomotion";
export const LOCOMOTION_STRAFE_STATE = "strafe";
export const LOCOMOTION_BACKWARD_STATE = "backward";
export const LOCOMOTION_TURN_STATE = "turn";
export const LOCOMOTION_AIRBORNE_STATE = "airborne";
export const LOCOMOTION_SWIM_STATE = "swim";

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

  // Swimming outranks the ground states, and a body in the water is never airborne.
  const grounded = Object.keys(states);
  if (input.swim !== undefined) {
    states[LOCOMOTION_SWIM_STATE] = {
      kind: "blend1D",
      param: LOCOMOTION_SPEED_PARAM,
      points: [
        ...(input.tread === undefined ? [] : [{ at: 0, clip: input.tread }]),
        { at: input.tread === undefined ? 0 : walkSpeed, clip: input.swim },
      ],
    };
    for (const from of grounded) directional.unshift({ from, to: LOCOMOTION_SWIM_STATE, when: [{ param: LOCOMOTION_SWIMMING_PARAM, op: "==", value: true }], duration: 0.3 });
    directional.push({ from: LOCOMOTION_SWIM_STATE, to: LOCOMOTION_STATE, when: [{ param: LOCOMOTION_SWIMMING_PARAM, op: "==", value: false }], duration: 0.3 });
  }
  if (input.jump !== undefined) {
    states[LOCOMOTION_AIRBORNE_STATE] = { kind: "clip", clip: input.jump };
    const airborne = { param: LOCOMOTION_AIRBORNE_PARAM, op: "==", value: true } as const;
    const swimming = { param: LOCOMOTION_SWIMMING_PARAM, op: "==", value: false } as const;
    for (const from of grounded) directional.unshift({ from, to: LOCOMOTION_AIRBORNE_STATE, when: [airborne, swimming], duration: 0.12 });
    directional.push({ from: LOCOMOTION_AIRBORNE_STATE, to: LOCOMOTION_STATE, when: [{ param: LOCOMOTION_AIRBORNE_PARAM, op: "==", value: false }], duration: 0.15 });
    if (input.swim !== undefined) directional.push({ from: LOCOMOTION_AIRBORNE_STATE, to: LOCOMOTION_SWIM_STATE, when: [{ param: LOCOMOTION_SWIMMING_PARAM, op: "==", value: true }], duration: 0.3 });
  }

  const oneShots = Object.entries(input.oneShots ?? {}).filter(([, spec]) => typeof spec === "string" || spec.length > 0);
  oneShots.sort(([a], [b]) => Number(b === "death") - Number(a === "death"));
  for (const [name, spec] of oneShots) {
    const clip = typeof spec === "string" ? spec : spec[0];
    if (clip === undefined) continue;
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
  const run = clip(states.run);
  const strafeLeft = clip(states.strafeLeft);
  const strafeRight = clip(states.strafeRight);
  const backward = clip(states.backward);
  const turn = clip(states.turn);
  const jump = clip(states.jump);
  const swim = clip(states.swim);
  const tread = clip(states.tread);
  return locomotionGraph({
    idle: states.idle,
    walk: clip(states.walk) ?? states.idle,
    ...(run === undefined ? {} : { run }),
    ...(strafeLeft === undefined ? {} : { strafeLeft }),
    ...(strafeRight === undefined ? {} : { strafeRight }),
    ...(backward === undefined ? {} : { backward }),
    ...(turn === undefined ? {} : { turn }),
    ...(jump === undefined ? {} : { jump }),
    ...(swim === undefined ? {} : { swim }),
    ...(tread === undefined ? {} : { tread }),
    ...(states.rootMotion === true ? { rootMotion: true } : {}),
    walkSpeed: states.walkSpeed,
    runSpeed: states.runSpeed,
    fadeSec: states.fadeSec,
    ...(config.oneShots === undefined ? {} : { oneShots: config.oneShots }),
  });
}
