export interface PromptPoint {
  x: number;
  z: number;
}

export interface KeybindPromptDisplay {
  kind: "keybind";
  actionId: string;
  /** What the interaction does, shown beside the key glyph (e.g. `"Open Chest"`, `"Talk"`); omit for key-only. */
  label?: string;
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

export function keybind(actionId: string, label?: string): KeybindPromptDisplay {
  return label === undefined ? { kind: "keybind", actionId } : { kind: "keybind", actionId, label };
}

export function gauge(gaugeId: string): GaugePromptDisplay {
  return { kind: "gauge", gaugeId };
}

export function label(text: string): LabelPromptDisplay {
  return { kind: "label", text };
}

export interface PromptCommand {
  name: string;
  input: unknown;
}

export function command(name: string, input?: unknown): PromptCommand {
  return { name, input };
}

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

export function proximityPrompt({ radius, display, invoke = null }: ProximityPromptConfig): ProximityPrompt {
  return { radius, display, invoke };
}

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
export function resolveActivePrompt<T extends PositionedPrompt>(
  playerPosition: PromptPoint,
  prompts: readonly T[],
): T | null {
  let active: T | null = null;
  let activePriority = Number.NEGATIVE_INFINITY;
  let activeDistance = Number.POSITIVE_INFINITY;
  for (const candidate of prompts) {
    const nextDistance = Math.hypot(
      candidate.position.x - playerPosition.x,
      candidate.position.z - playerPosition.z,
    );
    if (nextDistance >= candidate.prompt.radius) continue;
    const priority = candidate.priority ?? 0;
    if (priority > activePriority || (priority === activePriority && nextDistance < activeDistance)) {
      active = candidate;
      activePriority = priority;
      activeDistance = nextDistance;
    }
  }
  return active;
}

export function promptDisplaysEqual(a: ProximityPromptDisplay, b: ProximityPromptDisplay): boolean {
  if (a === b) return true;
  if (a.kind === "keybind") return b.kind === "keybind" && a.actionId === b.actionId && a.label === b.label;
  if (a.kind === "gauge") return b.kind === "gauge" && a.gaugeId === b.gaugeId;
  return b.kind === "label" && a.text === b.text;
}

function commandInputsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  if (keys.length !== Object.keys(bRecord).length) return false;
  return keys.every((key) => Object.is(aRecord[key], bRecord[key]));
}

export function promptCommandsEqual(a: PromptCommand | null, b: PromptCommand | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.name === b.name && commandInputsEqual(a.input, b.input);
}

export function positionedPromptsEqual(a: PositionedPrompt, b: PositionedPrompt): boolean {
  if (a === b) return true;
  return a.id === b.id
    && a.position.x === b.position.x
    && a.position.z === b.position.z
    && (a.priority ?? 0) === (b.priority ?? 0)
    && a.prompt.radius === b.prompt.radius
    && promptDisplaysEqual(a.prompt.display, b.prompt.display)
    && promptCommandsEqual(a.prompt.invoke, b.prompt.invoke);
}
