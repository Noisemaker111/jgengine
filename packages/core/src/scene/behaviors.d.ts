import { type ProximityPrompt } from "../interaction/proximityPrompt";
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
export declare function wander({ radius }: {
    radius: number;
}): WanderBehavior;
export declare function promptable(prompt: ProximityPrompt): PromptableBehavior;
export declare function talkable(dialogueId: string): PromptableBehavior;
export declare function player(): PlayerBehavior;
