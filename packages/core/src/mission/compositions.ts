import {
  DEFAULT_PURSUE_DISTANCE,
  type MissionDef,
  type MissionFailDef,
  type MissionObjectiveDef,
  type MissionRewards,
} from "./mission";

export interface ComposedMissionOptions {
  id: string;
  title: string;
  description?: string;
  rewards?: MissionRewards;
  next?: string;
}

/** Options for {@link escortMission}: a protected actor that must reach a destination alive. */
export interface EscortMissionOptions extends ComposedMissionOptions {
  /** Actor that must survive the trip. */
  escortee: string;
  /** Marker id the escortee must reach. */
  destination: string;
  meetMarker?: string;
  /** Seconds allowed for the delivery; expiry fails into `failState`. */
  timeoutSeconds?: number;
  failState?: string;
  radius?: number;
}

export interface ChaseMissionOptions extends ComposedMissionOptions {
  target: string;
  pursuer?: string;
  distance?: number;
  escapeDistance?: number;
  /** Seconds past `escapeDistance` before the chase fails. */
  escapeGrace?: number;
  /** Marker the pursuer must reach to close the chase after catching up; omit to end on the catch. */
  catchMarker?: string;
  failState?: string;
  /** Seconds allowed for the chase; expiry fails into `failState`. */
  timeoutSeconds?: number;
}

export interface DefendMissionOptions extends ComposedMissionOptions {
  /** Seconds the position must be held. */
  seconds: number;
  /** Survivors that must remain; dropping below fails the mission. */
  minSurvivors?: number;
  failState?: string;
  label?: string;
}

function failStates(failState: string, message: string): readonly MissionFailDef[] {
  return [{ id: failState, message }];
}

/**
 * A protected actor that must reach a destination: a `reach` objective for the escortee, a
 * `actor-died` fail condition on the escortee, and an optional timer. No escort system — the same
 * `reach` objective a "go here" mission uses, plus the guard data.
 *
 * @capability mission-compositions build escort, chase and defend missions from the shared objective kinds
 */
export function escortMission(options: EscortMissionOptions): MissionDef {
  const failState = options.failState ?? `${options.id}_lost`;
  const objectives: MissionObjectiveDef[] = [];
  if (options.meetMarker !== undefined) {
    objectives.push({
      id: "escort_meet",
      kind: "reach",
      actor: options.escortee,
      marker: options.meetMarker,
      radius: options.radius,
      label: `Meet ${options.escortee}`,
      next: "escort_deliver",
    });
  }
  objectives.push({
    id: "escort_deliver",
    kind: "reach",
    actor: options.escortee,
    marker: options.destination,
    radius: options.radius,
    label: `Escort ${options.escortee} to ${options.destination}`,
    failOn: [{
      kind: "actor-died",
      actor: options.escortee,
      to: failState,
      message: `${options.escortee} was lost`,
    }],
    timeout: options.timeoutSeconds,
    onTimeout: failState,
    next: "done",
  });
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    start: objectives[0]!.id,
    objectives,
    fail: failStates(failState, "the escort was lost"),
    rewards: options.rewards,
    next: options.next,
  };
}

/** @capability mission-compositions build escort, chase and defend missions from the shared objective kinds */
export function chaseMission(options: ChaseMissionOptions): MissionDef {
  const failState = options.failState ?? `${options.id}_escaped`;
  const objectives: MissionObjectiveDef[] = [{
    id: "chase",
    kind: "pursue",
    actor: options.target,
    pursuer: options.pursuer,
    distance: options.distance ?? DEFAULT_PURSUE_DISTANCE,
    escapeDistance: options.escapeDistance,
    escapeGrace: options.escapeGrace,
    escapeFail: failState,
    timeout: options.timeoutSeconds,
    onTimeout: failState,
    label: `Stay on ${options.target}`,
    next: options.catchMarker === undefined ? "done" : "chase_close",
  }];
  if (options.catchMarker !== undefined) {
    objectives.push({
      id: "chase_close",
      kind: "reach",
      actor: options.pursuer,
      marker: options.catchMarker,
      label: `Close on ${options.target}`,
      next: "done",
    });
  }
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    start: objectives[0]!.id,
    objectives,
    fail: failStates(failState, "the target escaped"),
    rewards: options.rewards,
    next: options.next,
  };
}

/**
 * Hold a position for a duration, scored by what is left standing: one `survive` objective whose
 * `minSurvivors` gate is the fail condition and whose completion banks the survivors as the mission
 * score. Same primitive a timed delivery uses, with a guard.
 *
 * @capability mission-compositions build escort, chase and defend missions from the shared objective kinds
 */
export function defendMission(options: DefendMissionOptions): MissionDef {
  const failState = options.failState ?? `${options.id}_overrun`;
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    start: "defend",
    objectives: [{
      id: "defend",
      kind: "survive",
      duration: options.seconds,
      minSurvivors: options.minSurvivors,
      minSurvivorsFail: failState,
      label: options.label ?? `Hold for ${options.seconds}s`,
      next: "done",
    }],
    fail: failStates(failState, "the position was overrun"),
    rewards: options.rewards,
    next: options.next,
  };
}
