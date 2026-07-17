import {
  command,
  keybind,
  proximityPrompt,
  type ProximityPrompt,
} from "../interaction/proximityPrompt";
import type { PathProgress, Waypoint } from "../nav/pathFollow";

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

export type BehaviorDescriptor =
  | WanderBehavior
  | PatrolBehavior
  | PromptableBehavior
  | PlayerBehavior;

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
