export interface PromptPoint {
    x: number;
    z: number;
}
export interface KeybindPromptDisplay {
    kind: "keybind";
    actionId: string;
}
export interface GaugePromptDisplay {
    kind: "gauge";
    gaugeId: string;
}
export interface LabelPromptDisplay {
    kind: "label";
    text: string;
}
export type ProximityPromptDisplay = KeybindPromptDisplay | GaugePromptDisplay | LabelPromptDisplay;
export declare function keybind(actionId: string): KeybindPromptDisplay;
export declare function gauge(gaugeId: string): GaugePromptDisplay;
export declare function label(text: string): LabelPromptDisplay;
export interface PromptCommand {
    name: string;
    input: unknown;
}
export declare function command(name: string, input?: unknown): PromptCommand;
export interface ProximityPrompt {
    radius: number;
    display: ProximityPromptDisplay;
    invoke: PromptCommand | null;
}
export interface ProximityPromptConfig {
    radius: number;
    display: ProximityPromptDisplay;
    invoke?: PromptCommand | null;
}
export declare function proximityPrompt({ radius, display, invoke }: ProximityPromptConfig): ProximityPrompt;
export interface PositionedPrompt {
    id: string;
    position: PromptPoint;
    priority?: number;
    prompt: ProximityPrompt;
}
/**
 * Nearest prompt strictly within its radius wins; a higher-priority prompt in
 * range beats any lower-priority one regardless of distance; equal priority
 * and distance keep the earliest prompt in the list.
 */
export declare function resolveActivePrompt<T extends PositionedPrompt>(playerPosition: PromptPoint, prompts: readonly T[]): T | null;
export declare function promptDisplaysEqual(a: ProximityPromptDisplay, b: ProximityPromptDisplay): boolean;
export declare function promptCommandsEqual(a: PromptCommand | null, b: PromptCommand | null): boolean;
export declare function positionedPromptsEqual(a: PositionedPrompt, b: PositionedPrompt): boolean;
