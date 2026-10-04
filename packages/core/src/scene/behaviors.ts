import {
  command,
  keybind,
  proximityPrompt,
  type ProximityPrompt,
} from "../interaction/proximityPrompt";
import type { PathProgress, Waypoint } from "../nav/pathFollow";
import type { Blackboard, DecisionGraph } from "../ai/decisionGraph";
import type { CooldownMode } from "../ai/pursuit";
import type { ThreatTableConfig } from "../ai/threat";

/** Scheduled chase/attack behavior; the default declares hostility toward player-role entities.
 * GameDefinition.pursuit.eligible can further restrict every target source using the live world.
 * Explicit targets and optional threat override nearest-player acquisition, not eligibility.
 */
export interface PursueBehavior {
  kind: "pursue";
  aggroRadius: number;
  reach: number;
  leashRange: number;
  speed: number;
  attack: { effect: string; amount: number; intervalSec: number };
  /** Seconds between acquisition/movement/attack ticks; default .1. Zero advances every frame. */
  thinkInterval?: number;
  cooldownMode?: CooldownMode;
  /** Opt into a per-instance table available through `behaviorControl(ctx).threat(id)`. */
  threat?: ThreatTableConfig;
}

export interface WanderBehavior {
  kind: "wander";
  radius: number;
}

export interface PatrolBehavior {
  kind: "patrol";
  waypoints: readonly Waypoint[];
  speed: number;
  loop: boolean;
  /**
   * Optional initial progress the follower is seeded at instead of waypoint zero — lets a fleet of
   * route followers start at distributed phases. Round-trips through the behavior lifecycle seek/serialize.
   */
  startProgress?: PathProgress;
  /**
   * Sample world ground height for the pose Y each tick, so a route authored in the XZ plane rides
   * uneven terrain. Default false (waypoint Y is used verbatim).
   */
  groundClamp?: boolean;
}

export interface PromptableBehavior {
  kind: "promptable";
  prompt: ProximityPrompt;
}

export interface PlayerBehavior {
  kind: "player";
}

/** Decision graph behavior descriptor using a named registered action set. */
export interface DecisionGraphBehavior {
  kind: "decisionGraph";
  graph: DecisionGraph;
  actions: string;
  /** Initial facts for this entity's persistent blackboard; systems write more through `behaviorControl(ctx).blackboard(id)`. */
  blackboard?: Blackboard;
  /** Seconds between graph ticks (`0` = every frame). Siblings are staggered; actions receive the elapsed time. */
  thinkInterval?: number;
}

export type BehaviorDescriptor =
  | WanderBehavior
  | PatrolBehavior
  | PromptableBehavior
  | PlayerBehavior
  | PursueBehavior
  | DecisionGraphBehavior;

/** @internal Compare declarative behavior data at replacement boundaries, independent of object key order. */
export function behaviorDataEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, index) => behaviorDataEqual(value, b[index]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length
    && keys.every(key => Object.hasOwn(right, key) && behaviorDataEqual(left[key], right[key]));
}

/** Attach aggro, collision-aware chase, cooldown attack and latched return-to-spawn as data.
 * @capability pursue-behavior scheduled pursuit with bounded target acquisition and saved cooldown/leash state
 */
export function pursue(options: Omit<PursueBehavior, "kind">): PursueBehavior {
  for (const [name, value] of Object.entries({ aggroRadius: options.aggroRadius, reach: options.reach,
    leashRange: options.leashRange, speed: options.speed, intervalSec: options.attack.intervalSec,
    thinkInterval: options.thinkInterval ?? .1 })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`pursue: ${name} must be finite and nonnegative`);
  }
  if (!Number.isFinite(options.attack.amount)) throw new Error("pursue: attack amount must be finite");
  return { ...options, kind: "pursue", attack: { ...options.attack },
    ...(options.threat === undefined ? {} : { threat: { ...options.threat } }) };
}

export function wander({ radius }: { radius: number }): WanderBehavior {
  return { kind: "wander", radius };
}

export function patrol({
  waypoints,
  speed,
  loop = true,
  startProgress,
  groundClamp,
}: {
  waypoints: readonly Waypoint[];
  speed: number;
  loop?: boolean;
  startProgress?: PathProgress;
  groundClamp?: boolean;
}): PatrolBehavior {
  const behavior: PatrolBehavior = { kind: "patrol", waypoints, speed, loop };
  if (startProgress !== undefined) behavior.startProgress = startProgress;
  if (groundClamp !== undefined) behavior.groundClamp = groundClamp;
  return behavior;
}

export function promptable(prompt: ProximityPrompt): PromptableBehavior {
  return { kind: "promptable", prompt };
}

const TALK_RADIUS = 2;

export function talkable(dialogueId: string): PromptableBehavior {
  return promptable(
    proximityPrompt({
      radius: TALK_RADIUS,
      display: keybind("interact"),
      invoke: command("dialogue.open", { id: dialogueId }),
    }),
  );
}

export function player(): PlayerBehavior {
  return { kind: "player" };
}
