import {
  createAnimGraphRuntime,
  type AnimClipOutput,
  type AnimGraph,
  type AnimParams,
  type AnimParamValue,
} from "@jgengine/core/anim/animGraph";

/**
 * Editor animation-graph preview: pure logic, no JSX. Replays a graph from its entry states to a
 * scrub time with fixed steps, arming each recorded trigger at its time, so scrubbing back and forth
 * always shows the same pose the runtime would reach.
 *
 * @internal
 */

/** A trigger pressed during preview, at a time on the scrub timeline. */
export interface GraphPreviewTrigger {
  at: number;
  name: string;
}

/** Inputs for {@link simulateGraphPreview}. */
export interface GraphPreviewInput {
  graph: AnimGraph;
  /** Clip durations in seconds from the loaded rig; unknown clips count as one second. */
  durations: Readonly<Record<string, number>>;
  time: number;
  params: AnimParams;
  triggers: readonly GraphPreviewTrigger[];
  /** Fixed step in seconds. Default 1/30. */
  step?: number;
}

/** What the rig shows at the scrub time. */
export interface GraphPreviewFrame {
  time: number;
  /** Current state per layer id. */
  states: Record<string, string>;
  clips: AnimClipOutput[];
  /** Clip events fired from zero to `time`, with when they fired. */
  events: { at: number; name: string; clip: string }[];
}

/** Longest preview timeline the scrubber offers, in seconds. */
export const MAX_PREVIEW_SECONDS = 20;

/** Replays `graph` from its entry states to `time` and reports the pose there. */
export function simulateGraphPreview(input: GraphPreviewInput): GraphPreviewFrame {
  const step = input.step ?? 1 / 30;
  const time = Math.max(0, Math.min(MAX_PREVIEW_SECONDS, input.time));
  const runtime = createAnimGraphRuntime(input.graph);
  const clips: Record<string, number> = {};
  for (const name of graphClipNames(input.graph)) clips[name] = input.durations[name] ?? 1;
  const pending = [...input.triggers].filter((trigger) => trigger.at <= time).sort((a, b) => a.at - b.at);
  const events: GraphPreviewFrame["events"] = [];
  let elapsed = 0;
  let next = 0;
  let out = runtime.advance(0, input.params, clips);
  while (elapsed < time - 1e-9) {
    const dt = Math.min(step, time - elapsed);
    while (next < pending.length && pending[next]!.at <= elapsed + 1e-9) runtime.trigger(pending[next++]!.name);
    out = runtime.advance(dt, input.params, clips);
    elapsed += dt;
    for (const event of out.events) events.push({ at: elapsed, name: event.name, clip: event.clip });
  }
  if (next < pending.length) {
    while (next < pending.length) runtime.trigger(pending[next++]!.name);
    out = runtime.advance(0, input.params, clips);
  }
  const states: Record<string, string> = {};
  for (const layer of input.graph.layers) states[layer.id] = runtime.stateOf(layer.id) ?? layer.entry;
  return { time, states, clips: out.clips, events };
}

/** Every clip name a graph plays. */
export function graphClipNames(graph: AnimGraph): string[] {
  const names = new Set<string>();
  for (const layer of graph.layers) {
    for (const state of Object.values(layer.states)) {
      if (state.kind === "clip") names.add(state.clip);
      else for (const point of state.points) names.add(point.clip);
    }
  }
  return [...names];
}

/** Every trigger name a graph's transitions listen for, in first-seen order. */
export function graphTriggers(graph: AnimGraph): string[] {
  const names = new Set<string>();
  for (const layer of graph.layers) for (const transition of layer.transitions) if (transition.trigger !== undefined) names.add(transition.trigger);
  return [...names];
}

/** A parameter the preview needs a control for: blend inputs and condition operands. */
export interface GraphParamControl {
  name: string;
  kind: "number" | "boolean";
  min: number;
  max: number;
}

/** Parameters a graph reads, with a range covering its blend points and condition values. */
export function graphParamControls(graph: AnimGraph): GraphParamControl[] {
  const controls = new Map<string, GraphParamControl>();
  const widen = (name: string, value: AnimParamValue) => {
    const kind = typeof value === "boolean" ? "boolean" : "number";
    const current = controls.get(name) ?? { name, kind, min: 0, max: 1 };
    if (kind === "number") {
      current.min = Math.min(current.min, value as number);
      current.max = Math.max(current.max, (value as number) * 1.25, (value as number) + 0.5);
    }
    controls.set(name, current);
  };
  for (const layer of graph.layers) {
    for (const state of Object.values(layer.states)) {
      if (state.kind === "blend1D") for (const point of state.points) widen(state.param, point.at);
      if (state.kind === "blend2D") {
        for (const point of state.points) {
          widen(state.params[0], point.at[0]);
          widen(state.params[1], point.at[1]);
        }
      }
    }
    for (const transition of layer.transitions) for (const condition of transition.when ?? []) widen(condition.param, condition.value);
  }
  return [...controls.values()];
}

/** Adds a trigger press at `at`, keeping the log in time order. */
export function recordTrigger(triggers: readonly GraphPreviewTrigger[], name: string, at: number): GraphPreviewTrigger[] {
  return [...triggers, { at, name }].sort((a, b) => a.at - b.at);
}
