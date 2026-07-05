import {
  command,
  keybind,
  proximityPrompt,
  type ProximityPrompt,
} from "../interaction/proximityPrompt";

export interface WanderBehavior {
  kind: "wander";
  radius: number;
}

export interface PromptableBehavior {
  kind: "promptable";
  prompt: ProximityPrompt;
}

export interface PlayerBehavior {
  kind: "player";
}

export type BehaviorDescriptor = WanderBehavior | PromptableBehavior | PlayerBehavior;

export function wander({ radius }: { radius: number }): WanderBehavior {
  return { kind: "wander", radius };
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
