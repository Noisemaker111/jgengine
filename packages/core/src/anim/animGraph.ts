/** Parameter value a graph reads: floats for blends and comparisons, booleans for gates. */
export type AnimParamValue = number | boolean;
/** The parameter set a graph evaluates against each advance. */
export type AnimParams = Readonly<Record<string, AnimParamValue>>;

/** A state plays one clip, or blends clips by one or two parameters. */
export type AnimState =
  | { kind: "clip"; clip: string; speed?: number; loop?: boolean }
  | { kind: "blend1D"; param: string; points: readonly { at: number; clip: string }[]; speed?: number; loop?: boolean }
  | {
      kind: "blend2D";
      params: readonly [string, string];
      points: readonly { at: readonly [number, number]; clip: string }[];
      speed?: number;
      loop?: boolean;
    };

/** Comparison operators an {@link AnimCondition} supports. */
export type AnimCompare = ">" | "<" | ">=" | "<=" | "==" | "!=";

/** A parameter comparison; every condition on a transition must hold. */
export interface AnimCondition {
  param: string;
  op: AnimCompare;
  value: AnimParamValue;
}

/** Edge between states. `from: "*"` matches any state except `to`. */
export interface AnimTransition {
  from: string | "*";
  to: string;
  /** All must hold. */
  when?: readonly AnimCondition[];
  /** Fires once when this trigger was set since the last advance; consumed on use. */
  trigger?: string;
  /** Crossfade seconds. Default 0.2. */
  duration?: number;
  /** Only leave `from` once its normalized time reaches this (one-shots returning to locomotion). */
  exitTime?: number;
}

/** A blend layer with its own state machine. Masked layers apply only to bones whose track names start with a prefix. */
export interface AnimLayer {
  id: string;
  entry: string;
  states: Readonly<Record<string, AnimState>>;
  transitions: readonly AnimTransition[];
  /** Bone name prefixes this layer drives; absent means the whole rig. */
  mask?: readonly string[];
  additive?: boolean;
  /** Layer influence 0..1. Default 1. */
  weight?: number;
}

/** A named moment inside a clip (foot plant, hit frame, reload point). */
export interface AnimEvent {
  clip: string;
  atSec: number;
  name: string;
}

/** Serializable animation graph. Clip durations come from the rig at runtime (see {@link AnimGraphClipInfo}). */
export interface AnimGraph {
  layers: readonly AnimLayer[];
  events?: readonly AnimEvent[];
}

/** Per-clip duration in seconds, read from the loaded rig. */
export type AnimGraphClipInfo = Readonly<Record<string, number>>;

interface LayerTransitionState {
  to: string;
  elapsed: number;
  duration: number;
  fromWeights: Record<string, number>;
  fromTimes: Record<string, number>;
}

interface LayerState {
  current: string;
  time: number;
  transition: LayerTransitionState | null;
}

/** Serializable evaluator state. */
export interface AnimGraphState {
  layers: Record<string, LayerState>;
  triggers: string[];
}

/** One clip's contribution: weight 0..1 and the time to seek it to. */
export interface AnimClipOutput {
  clip: string;
  weight: number;
  time: number;
  layer: string;
}

/** What one advance asks the rig to show. */
export interface AnimGraphOutput {
  clips: AnimClipOutput[];
  events: { name: string; clip: string }[];
}

/** The evaluator handle: arm triggers, advance, inspect, snapshot and restore. */
export interface AnimGraphRuntime {
  graph(): AnimGraph;
  retune(graph: AnimGraph): void;
  state(): AnimGraphState;
  snapshot(): AnimGraphState;
  restore(state: AnimGraphState): void;
  /** Arm a trigger for the next advance. */
  trigger(name: string): void;
  /** Current state id of a layer. */
  stateOf(layerId: string): string | null;
  advance(dt: number, params: AnimParams, clips: AnimGraphClipInfo): AnimGraphOutput;
}

const DEFAULT_FADE = 0.2;

/** Entity blackboard key the shell reads extra graph parameters from: `ctx.scene.entity.blackboard.set(id, ANIM_PARAMS_KEY, { aiming: true })`. */
export const ANIM_PARAMS_KEY = "anim.params";

function compare(actual: AnimParamValue | undefined, op: AnimCompare, value: AnimParamValue): boolean {
  const a = actual === undefined ? 0 : Number(actual);
  const b = Number(value);
  switch (op) {
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
  }
}

/** Static clip weights of a state at `params`, before any crossfade. */
export function stateClipWeights(state: AnimState, params: AnimParams): Record<string, number> {
  const out: Record<string, number> = {};
  if (state.kind === "clip") {
    out[state.clip] = 1;
    return out;
  }
  if (state.kind === "blend1D") {
    const points = [...state.points].sort((x, y) => x.at - y.at);
    if (points.length === 0) return out;
    const value = Number(params[state.param] ?? 0);
    if (value <= points[0]!.at) {
      out[points[0]!.clip] = 1;
      return out;
    }
    const last = points[points.length - 1]!;
    if (value >= last.at) {
      out[last.clip] = 1;
      return out;
    }
    for (let i = 0; i + 1 < points.length; i += 1) {
      const lo = points[i]!;
      const hi = points[i + 1]!;
      if (value >= lo.at && value <= hi.at) {
        const t = hi.at === lo.at ? 0 : (value - lo.at) / (hi.at - lo.at);
        out[lo.clip] = (out[lo.clip] ?? 0) + (1 - t);
        out[hi.clip] = (out[hi.clip] ?? 0) + t;
        return out;
      }
    }
    return out;
  }
  const x = Number(params[state.params[0]] ?? 0);
  const y = Number(params[state.params[1]] ?? 0);
  let total = 0;
  const raw: { clip: string; w: number }[] = [];
  for (const point of state.points) {
    const dx = point.at[0] - x;
    const dy = point.at[1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) {
      out[point.clip] = 1;
      return out;
    }
    const w = 1 / d2;
    raw.push({ clip: point.clip, w });
    total += w;
  }
  for (const entry of raw) out[entry.clip] = (out[entry.clip] ?? 0) + entry.w / total;
  return out;
}

function stateSpeed(state: AnimState): number {
  return state.speed ?? 1;
}

function stateLoops(state: AnimState): boolean {
  return state.loop !== false;
}

/** Longest clip in a state at these weights; the state's timeline length for exit times and events. */
function stateDuration(weights: Record<string, number>, clips: AnimGraphClipInfo): number {
  let duration = 0;
  for (const clip of Object.keys(weights)) duration = Math.max(duration, clips[clip] ?? 0);
  return duration;
}

function clipTimeFor(time: number, duration: number, loop: boolean): number {
  if (!(duration > 0)) return 0;
  if (loop) return time % duration;
  return Math.min(time, duration);
}

/**
 * Headless animation state machine and blend evaluator. It owns every clip's playback time and weight, so the
 * renderer only seeks and weights actions on a mixer, and headless hosts, replays, and tests advance the same
 * graph without three.js. Transitions are data (parameter comparisons and consumed triggers), layers can be
 * masked or additive, and events fire by clip time, including across loop wraps.
 *
 * @capability anim-graph data-first animation state machine with blend trees, crossfades, layers, and clip events
 */
export function createAnimGraphRuntime(initial: AnimGraph): AnimGraphRuntime {
  let graph = initial;
  let triggers = new Set<string>();
  let layers: Record<string, LayerState> = {};

  function reset(): void {
    layers = {};
    for (const layer of graph.layers) layers[layer.id] = { current: layer.entry, time: 0, transition: null };
  }
  reset();

  function pickTransition(layer: AnimLayer, state: LayerState, params: AnimParams, normalized: number): AnimTransition | null {
    for (const transition of layer.transitions) {
      if (transition.from !== "*" && transition.from !== state.current) continue;
      if (transition.to === state.current && transition.from === "*") continue;
      if (transition.trigger !== undefined && !triggers.has(transition.trigger)) continue;
      if (transition.exitTime !== undefined && normalized < transition.exitTime) continue;
      if (transition.when !== undefined && !transition.when.every((c) => compare(params[c.param], c.op, c.value))) continue;
      if (transition.trigger !== undefined) triggers.delete(transition.trigger);
      return transition;
    }
    return null;
  }

  function collectEvents(
    out: { name: string; clip: string }[],
    clip: string,
    before: number,
    after: number,
    duration: number,
    loop: boolean,
  ): void {
    if (graph.events === undefined || !(duration > 0)) return;
    for (const event of graph.events) {
      if (event.clip !== clip) continue;
      const at = event.atSec;
      if (loop) {
        const wrapped = after < before;
        const hit = wrapped ? at > before || at <= after : at > before && at <= after;
        if (hit) out.push({ name: event.name, clip });
      } else if (at > before && at <= after) {
        out.push({ name: event.name, clip });
      }
    }
  }

  return {
    graph: () => graph,
    retune(next) {
      graph = next;
      const previous = layers;
      reset();
      for (const [id, state] of Object.entries(previous)) {
        const layer = graph.layers.find((l) => l.id === id);
        if (layer !== undefined && layer.states[state.current] !== undefined) layers[id] = state;
      }
    },
    state: () => ({ layers, triggers: [...triggers] }),
    snapshot: () => ({ layers: structuredClone(layers), triggers: [...triggers] }),
    restore(next) {
      layers = structuredClone(next.layers);
      triggers = new Set(next.triggers);
    },
    trigger(name) {
      triggers.add(name);
    },
    stateOf: (layerId) => layers[layerId]?.current ?? null,
    advance(dt, params, clips) {
      const output: AnimGraphOutput = { clips: [], events: [] };
      for (const layer of graph.layers) {
        const state = layers[layer.id];
        if (state === undefined) continue;
        const def = layer.states[state.current];
        if (def === undefined) continue;
        const layerWeight = layer.weight ?? 1;

        const before = state.time;
        state.time += dt * stateSpeed(def);
        const weights = stateClipWeights(def, params);
        const duration = stateDuration(weights, clips);
        const loop = stateLoops(def);
        const normalized = duration > 0 ? (loop ? (state.time % duration) / duration : Math.min(1, state.time / duration)) : 1;

        for (const clip of Object.keys(weights)) {
          const clipDuration = clips[clip] ?? 0;
          collectEvents(
            output.events,
            clip,
            clipTimeFor(before, clipDuration, loop),
            clipTimeFor(state.time, clipDuration, loop),
            clipDuration,
            loop,
          );
        }

        const transition = state.transition;
        if (transition !== null) {
          transition.elapsed += dt;
          const t = transition.duration > 0 ? Math.min(1, transition.elapsed / transition.duration) : 1;
          const merged: Record<string, number> = {};
          const times: Record<string, number> = {};
          for (const [clip, w] of Object.entries(transition.fromWeights)) {
            merged[clip] = (merged[clip] ?? 0) + w * (1 - t);
            times[clip] = transition.fromTimes[clip] ?? 0;
          }
          for (const [clip, w] of Object.entries(weights)) {
            merged[clip] = (merged[clip] ?? 0) + w * t;
            times[clip] = clipTimeFor(state.time, clips[clip] ?? 0, loop);
          }
          for (const [clip, w] of Object.entries(merged)) {
            if (w <= 0) continue;
            output.clips.push({ clip, weight: w * layerWeight, time: times[clip] ?? 0, layer: layer.id });
          }
          if (t >= 1) state.transition = null;
        } else {
          for (const [clip, w] of Object.entries(weights)) {
            if (w <= 0) continue;
            output.clips.push({ clip, weight: w * layerWeight, time: clipTimeFor(state.time, clips[clip] ?? 0, loop), layer: layer.id });
          }
        }

        const next = pickTransition(layer, state, params, normalized);
        if (next !== null && next.to !== state.current) {
          const fromWeights: Record<string, number> = {};
          const fromTimes: Record<string, number> = {};
          for (const entry of output.clips) {
            if (entry.layer !== layer.id) continue;
            fromWeights[entry.clip] = (fromWeights[entry.clip] ?? 0) + entry.weight / (layerWeight || 1);
            fromTimes[entry.clip] = entry.time;
          }
          state.current = next.to;
          state.time = 0;
          state.transition = {
            to: next.to,
            elapsed: 0,
            duration: next.duration ?? DEFAULT_FADE,
            fromWeights,
            fromTimes,
          };
        } else if (next !== null && next.to === state.current) {
          state.time = 0;
        }
      }
      triggers.clear();
      return output;
    },
  };
}
