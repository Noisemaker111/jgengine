import {
  command,
  keybind,
  proximityPrompt,
  type ProximityPrompt,
} from "../interaction/proximityPrompt";
import type { Waypoint } from "../nav/pathFollow";

export interface WanderBehavior {
  kind: "wander";
  radius: number;
}

export interface PatrolBehavior {
  kind: "patrol";
  waypoints: readonly Waypoint[];
  speed: number;
  loop: boolean;
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
}: {
  waypoints: readonly Waypoint[];
  speed: number;
  loop?: boolean;
}): PatrolBehavior {
  return { kind: "patrol", waypoints, speed, loop };
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
