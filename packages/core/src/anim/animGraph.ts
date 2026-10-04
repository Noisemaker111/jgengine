import { resolveOneShotClip } from "../game/modelAnimation";

/** Parameter value a graph reads: floats for blends and comparisons, booleans for gates. */
export type AnimParamValue = number | boolean;
/** The parameter set a graph evaluates against each advance. */
export type AnimParams = Readonly<Record<string, AnimParamValue>>;

/** A state plays one clip, or blends clips by one or two parameters. */
export type AnimState =
  | { kind: "clip"; clip: string; variants?: readonly string[]; speed?: number; loop?: boolean; rootMotion?: boolean }
  | { kind: "blend1D"; param: string; points: readonly { at: number; clip: string }[]; speed?: number; loop?: boolean; rootMotion?: boolean }
  | {
      kind: "blend2D";
      params: readonly [string, string];
      points: readonly { at: readonly [number, number]; clip: string }[];
      speed?: number;
      loop?: boolean;
      rootMotion?: boolean;
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
export type AnimGraphClipInfo = Readonly<Record<string, number | { duration: number; rootTrack?: { times: Float32Array; values: Float32Array } }>>;

interface LayerTransitionState {
  to: string;
  elapsed: number;
  duration: number;
  fromWeights: Record<string, number>;
  fromTimes: Record<string, number>;
  fromPlayback?: Record<string, { speed: number; loop: boolean; rootMotion?: boolean }>;
}

interface LayerState {
  current: string;
  time: number;
  transition: LayerTransitionState | null;
  selectedClip?: string;
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
  /** Root-bone travel over this advance from `rootMotion` states, in the rig's local units. */
  rootDelta?: [number, number, number];
  /** `true` while an influencing current or fading-out state has `rootMotion`, even with no travel. */
  rootMotion?: true;
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

/** Randomness used only when entering a clip state with variants. Omit to choose the first variant. */
export interface AnimGraphRuntimeOptions {
  rng?: () => number;
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
  for (const clip of Object.keys(weights)) duration = Math.max(duration, clipDuration(clips[clip]));
  return duration;
}

function clipDuration(info: AnimGraphClipInfo[string]): number {
  return typeof info === "number" ? info : info?.duration ?? 0;
}

function rootPosition(track: { times: Float32Array; values: Float32Array }, time: number, duration: number, loop: boolean): [number, number, number] {
  const count = Math.min(track.times.length, Math.floor(track.values.length / 3));
  if (count === 0) return [0, 0, 0];
  const first = track.times[0] ?? 0;
  const last = track.times[count - 1] ?? first;
  const cycle = loop && duration > 0 ? Math.floor(time / duration) : 0;
  const local = loop && duration > 0 ? ((time % duration) + duration) % duration : Math.min(Math.max(time, first), last);
  let i = 0;
  while (i + 1 < count && (track.times[i + 1] ?? 0) <= local) i += 1;
  const next = Math.min(i + 1, count - 1);
  const span = (track.times[next] ?? 0) - (track.times[i] ?? 0);
  const t = next === i || span <= 0 ? 0 : (local - (track.times[i] ?? 0)) / span;
  const out: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const a = track.values[i * 3 + axis] ?? 0;
    const b = track.values[next * 3 + axis] ?? a;
    const cycleOffset = loop && duration > 0 ? ((track.values[(count - 1) * 3 + axis] ?? 0) - (track.values[axis] ?? 0)) * cycle : 0;
    out[axis] = a + (b - a) * t + cycleOffset;
  }
  return out;
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
export function createAnimGraphRuntime(initial: AnimGraph, options: AnimGraphRuntimeOptions = {}): AnimGraphRuntime {
  let graph = initial;
  let triggers = new Set<string>();
  let layers: Record<string, LayerState> = {};

  function reset(): void {
    layers = {};
    for (const layer of graph.layers) layers[layer.id] = { current: layer.entry, time: 0, transition: null };
  }
  reset();

  function chooseClip(state: LayerState, def: AnimState): void {
    if (def.kind === "clip" && def.variants !== undefined && def.variants.length > 0) {
      state.selectedClip = resolveOneShotClip({ choice: def.variants }, "choice", options.rng?.() ?? 0) ?? def.clip;
    } else {
      delete state.selectedClip;
    }
  }

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
        const hit = at >= 0 && at <= duration && Math.floor((after - at) / duration) > Math.floor((before - at) / duration);
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
      const rootDelta: [number, number, number] = [0, 0, 0];
      let rootMotion = false;
      for (const layer of graph.layers) {
        const state = layers[layer.id];
        if (state === undefined) continue;
        const def = layer.states[state.current];
        if (def === undefined) continue;
        if (def.kind === "clip" && def.variants !== undefined && state.selectedClip === undefined) chooseClip(state, def);
        const layerWeight = layer.weight ?? 1;
        if (def.rootMotion === true && layerWeight > 0) rootMotion = true;

        const before = state.time;
        state.time += dt * stateSpeed(def);
        const weights = def.kind === "clip" && state.selectedClip !== undefined && def.variants?.includes(state.selectedClip)
          ? { [state.selectedClip]: 1 }
          : stateClipWeights(def, params);
        const duration = stateDuration(weights, clips);
        const loop = stateLoops(def);
        const normalized = duration > 0 ? (loop ? (state.time % duration) / duration : Math.min(1, state.time / duration)) : 1;

        for (const clip of Object.keys(weights)) {
          if (!(weights[clip]! * layerWeight > 0)) continue;
          const duration = clipDuration(clips[clip]);
          collectEvents(
            output.events,
            clip,
            before,
            state.time,
            duration,
            loop,
          );
          if (def.rootMotion) {
            const info = clips[clip];
            if (typeof info !== "number" && info?.rootTrack !== undefined) {
              const from = rootPosition(info.rootTrack, before, duration, loop);
              const to = rootPosition(info.rootTrack, state.time, duration, loop);
              for (let axis = 0; axis < 3; axis += 1) rootDelta[axis] += (to[axis] - from[axis]) * weights[clip]! * layerWeight;
            }
          }
        }

        const transition = state.transition;
        if (transition !== null) {
          transition.elapsed += dt;
          const t = transition.duration > 0 ? Math.min(1, transition.elapsed / transition.duration) : 1;
          const merged: Record<string, number> = {};
          const times: Record<string, number> = {};
          for (const [clip, w] of Object.entries(transition.fromWeights)) {
            merged[clip] = (merged[clip] ?? 0) + w * (1 - t);
            const playback = transition.fromPlayback?.[clip];
            if (w * (1 - t) * layerWeight > 0 && playback?.rootMotion === true) rootMotion = true;
            const time = transition.fromTimes[clip] ?? 0;
            const nextTime = playback === undefined ? time : clipTimeFor(time + dt * playback.speed, clipDuration(clips[clip]), playback.loop);
            transition.fromTimes[clip] = nextTime;
            times[clip] = nextTime;
          }
          for (const [clip, w] of Object.entries(weights)) {
            merged[clip] = (merged[clip] ?? 0) + w * t;
            times[clip] = clipTimeFor(state.time, clipDuration(clips[clip]), loop);
          }
          for (const [clip, w] of Object.entries(merged)) {
            if (w <= 0) continue;
            output.clips.push({ clip, weight: w * layerWeight, time: times[clip] ?? 0, layer: layer.id });
          }
          if (t >= 1) state.transition = null;
        } else {
          for (const [clip, w] of Object.entries(weights)) {
            if (w <= 0) continue;
            output.clips.push({ clip, weight: w * layerWeight, time: clipTimeFor(state.time, clipDuration(clips[clip]), loop), layer: layer.id });
          }
        }

        const next = pickTransition(layer, state, params, normalized);
        if (next !== null) {
          const fromWeights: Record<string, number> = {};
          const fromTimes: Record<string, number> = {};
          const fromPlayback: Record<string, { speed: number; loop: boolean; rootMotion?: boolean }> = {};
          for (const entry of output.clips) {
            if (entry.layer !== layer.id) continue;
            fromWeights[entry.clip] = (fromWeights[entry.clip] ?? 0) + entry.weight / (layerWeight || 1);
            fromTimes[entry.clip] = entry.time;
            const previous = transition?.fromPlayback?.[entry.clip];
            const outgoingRoot = previous?.rootMotion === true && transition !== null &&
              transition.duration > 0 && transition.elapsed < transition.duration &&
              (transition.fromWeights[entry.clip] ?? 0) > 0;
            const playback = weights[entry.clip] === undefined && previous !== undefined
              ? previous : { speed: stateSpeed(def), loop };
            // Same-clip states share one clock, but an interrupted fade must retain either
            // influencing source's in-place policy until that source leaves the pose.
            fromPlayback[entry.clip] = { ...playback, ...(def.rootMotion === true || outgoingRoot ? { rootMotion: true } : {}) };
          }
          state.current = next.to;
          state.time = 0;
          const target = layer.states[next.to];
          if (target !== undefined) chooseClip(state, target);
          state.transition = {
            to: next.to,
            elapsed: 0,
            duration: next.duration ?? DEFAULT_FADE,
            fromWeights,
            fromTimes,
            fromPlayback,
          };
        }
      }
      triggers.clear();
      if (rootDelta[0] !== 0 || rootDelta[1] !== 0 || rootDelta[2] !== 0) output.rootDelta = rootDelta;
      if (rootMotion) output.rootMotion = true;
      return output;
    },
  };
}

const COMPARES: readonly AnimCompare[] = [">", "<", ">=", "<=", "==", "!="];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseState(value: unknown): AnimState | null {
  const raw = record(value);
  if (raw === null) return null;
  const extra = {
    ...(optionalNumber(raw.speed) === undefined ? {} : { speed: raw.speed as number }),
    ...(typeof raw.loop === "boolean" ? { loop: raw.loop } : {}),
    ...(typeof raw.rootMotion === "boolean" ? { rootMotion: raw.rootMotion } : {}),
  };
  if (raw.kind === "clip" && typeof raw.clip === "string") {
    const variants = Array.isArray(raw.variants) ? raw.variants.filter((clip): clip is string => typeof clip === "string" && clip.length > 0) : undefined;
    return { kind: "clip", clip: raw.clip, ...(variants === undefined || variants.length === 0 ? {} : { variants }), ...extra };
  }
  if (!Array.isArray(raw.points)) return null;
  if (raw.kind === "blend1D" && typeof raw.param === "string") {
    const points = raw.points.flatMap((point) => {
      const entry = record(point);
      return entry !== null && typeof entry.clip === "string" && optionalNumber(entry.at) !== undefined ? [{ at: entry.at as number, clip: entry.clip }] : [];
    });
    return { kind: "blend1D", param: raw.param, points, ...extra };
  }
  if (raw.kind === "blend2D" && Array.isArray(raw.params) && raw.params.length === 2 && raw.params.every((param) => typeof param === "string")) {
    const points = raw.points.flatMap((point) => {
      const entry = record(point);
      const at = entry?.at;
      return entry !== null && typeof entry.clip === "string" && Array.isArray(at) && at.length === 2 && at.every((n) => optionalNumber(n) !== undefined)
        ? [{ at: [at[0] as number, at[1] as number] as const, clip: entry.clip }]
        : [];
    });
    return { kind: "blend2D", params: [raw.params[0] as string, raw.params[1] as string], points, ...extra };
  }
  return null;
}

function parseTransition(value: unknown, states: Readonly<Record<string, AnimState>>): AnimTransition | null {
  const raw = record(value);
  if (raw === null || typeof raw.from !== "string" || typeof raw.to !== "string") return null;
  if (states[raw.to] === undefined || (raw.from !== "*" && states[raw.from] === undefined)) return null;
  const when = Array.isArray(raw.when)
    ? raw.when.flatMap((condition) => {
        const entry = record(condition);
        return entry !== null &&
          typeof entry.param === "string" &&
          COMPARES.includes(entry.op as AnimCompare) &&
          (typeof entry.value === "number" || typeof entry.value === "boolean")
          ? [{ param: entry.param, op: entry.op as AnimCompare, value: entry.value }]
          : [];
      })
    : undefined;
  return {
    from: raw.from,
    to: raw.to,
    ...(when === undefined || when.length === 0 ? {} : { when }),
    ...(typeof raw.trigger === "string" ? { trigger: raw.trigger } : {}),
    ...(optionalNumber(raw.duration) === undefined ? {} : { duration: Math.max(0, raw.duration as number) }),
    ...(optionalNumber(raw.exitTime) === undefined ? {} : { exitTime: raw.exitTime as number }),
  };
}

/**
 * Validates untrusted JSON (a saved scene document, a network payload) as an {@link AnimGraph}.
 * Malformed states, transitions to unknown states, and bad conditions are dropped; a layer whose
 * entry state is missing is dropped; the result is `undefined` when no layer survives.
 *
 * @capability anim-graph load an animation graph from saved JSON without trusting its shape
 */
export function parseAnimGraph(value: unknown): AnimGraph | undefined {
  const raw = record(value);
  if (raw === null || !Array.isArray(raw.layers)) return undefined;
  const layers: AnimLayer[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.layers) {
    const layer = record(candidate);
    if (layer === null || typeof layer.id !== "string" || seen.has(layer.id) || typeof layer.entry !== "string") continue;
    const rawStates = record(layer.states);
    if (rawStates === null) continue;
    const states: Record<string, AnimState> = {};
    for (const [name, state] of Object.entries(rawStates)) {
      const parsed = parseState(state);
      if (parsed !== null) states[name] = parsed;
    }
    if (states[layer.entry] === undefined) continue;
    const transitions = Array.isArray(layer.transitions)
      ? layer.transitions.flatMap((transition) => {
          const parsed = parseTransition(transition, states);
          return parsed === null ? [] : [parsed];
        })
      : [];
    const mask = Array.isArray(layer.mask) ? layer.mask.filter((prefix): prefix is string => typeof prefix === "string") : undefined;
    seen.add(layer.id);
    layers.push({
      id: layer.id,
      entry: layer.entry,
      states,
      transitions,
      ...(mask === undefined ? {} : { mask }),
      ...(typeof layer.additive === "boolean" ? { additive: layer.additive } : {}),
      ...(optionalNumber(layer.weight) === undefined ? {} : { weight: Math.min(1, Math.max(0, layer.weight as number)) }),
    });
  }
  if (layers.length === 0) return undefined;
  const events = Array.isArray(raw.events)
    ? raw.events.flatMap((event) => {
        const entry = record(event);
        return entry !== null && typeof entry.clip === "string" && typeof entry.name === "string" && optionalNumber(entry.atSec) !== undefined
          ? [{ clip: entry.clip, atSec: entry.atSec as number, name: entry.name }]
          : [];
      })
    : [];
  return { layers, ...(events.length === 0 ? {} : { events }) };
}


/** A located, repairable error in an authored animation graph; paths are relative to the graph value. */
export interface AnimGraphDiagnostic {
  path: string;
  message: string;
  repair: string;
}

/** The whole authored graph is retained unchanged only when every supported field is valid. */
export interface AnimGraphValidation {
  graph: AnimGraph | undefined;
  diagnostics: readonly AnimGraphDiagnostic[];
}

/**
 * Validate an authored graph without dropping broken combat states or weakening transition conditions.
 * Known malformed fields and dangling references reject the whole graph with relative repair locations;
 * valid data, including authored object/array order, is returned unchanged. Unknown extension fields are
 * retained. Clip availability belongs to the imported-rig diagnostics. Use {@link parseAnimGraph} when
 * permissive repair is intentional.
 * @capability anim-graph validate authored animation graphs with located repair diagnostics without partial fallback
 */
export function validateAnimGraph(value: unknown): AnimGraphValidation {
  const diagnostics: AnimGraphDiagnostic[] = [];
  const issue = (path: string, message: string, repair: string): void => { diagnostics.push({ path, message, repair }); };
  const field = (path: string, key: string): string => path === "" ? key : /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
  const object = (candidate: unknown, path: string): Record<string, unknown> | null => {
    const raw = record(candidate);
    if (raw === null) issue(path, "Expected an animation graph object.", "Supply an object with the supported fields.");
    return raw;
  };
  const text = (candidate: unknown, path: string, empty = false): candidate is string => {
    if (typeof candidate === "string" && (empty || candidate.trim().length > 0)) return true;
    issue(path, "Expected a nonempty string.", "Set an explicit name from this graph or imported rig.");
    return false;
  };
  const number = (candidate: unknown, path: string, min = -Infinity, max = Infinity): candidate is number => {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min && candidate <= max) return true;
    issue(path, `Expected a finite number${min === -Infinity && max === Infinity ? "" : max === Infinity ? ` at least ${min}` : ` between ${min} and ${max}`}.`, "Set a finite value in the supported range.");
    return false;
  };
  const boolean = (candidate: unknown, path: string): void => {
    if (typeof candidate !== "boolean") issue(path, "Expected a boolean.", "Set true or false, or omit the optional field.");
  };
  const array = (candidate: unknown, path: string): unknown[] | null => {
    if (Array.isArray(candidate)) return candidate;
    issue(path, "Expected an array.", "Supply an array of supported entries.");
    return null;
  };
  const tuple = (candidate: unknown, path: string, numeric: boolean): void => {
    const entries = array(candidate, path);
    if (entries === null) return;
    if (entries.length !== 2) issue(path, "Expected exactly two entries.", "Supply the two blend axes in authored order.");
    entries.forEach((entry, index) => numeric ? number(entry, `${path}[${index}]`) : text(entry, `${path}[${index}]`));
  };
  const state = (candidate: unknown, path: string): void => {
    const raw = object(candidate, path);
    if (raw === null) return;
    if (!["clip", "blend1D", "blend2D"].includes(raw.kind as string)) {
      issue(`${path}.kind`, "Unknown animation state kind.", "Choose clip, blend1D or blend2D.");
      return;
    }
    if (raw.speed !== undefined) number(raw.speed, `${path}.speed`);
    for (const key of ["loop", "rootMotion"]) if (raw[key] !== undefined) boolean(raw[key], `${path}.${key}`);
    const allowed = raw.kind === "clip" ? ["clip", "variants"] : raw.kind === "blend1D" ? ["param", "points"] : ["params", "points"];
    for (const key of ["clip", "variants", "param", "params", "points"]) if (raw[key] !== undefined && !allowed.includes(key)) {
      issue(`${path}.${key}`, `Field ${key} is not used by a ${raw.kind} state.`, "Remove the field or choose the matching state kind.");
    }
    if (raw.kind === "clip") {
      text(raw.clip, `${path}.clip`);
      if (raw.variants !== undefined) array(raw.variants, `${path}.variants`)?.forEach((clip, index) => text(clip, `${path}.variants[${index}]`));
      return;
    }
    if (raw.kind === "blend1D") text(raw.param, `${path}.param`);
    else tuple(raw.params, `${path}.params`, false);
    array(raw.points, `${path}.points`)?.forEach((candidate, index) => {
      const pointPath = `${path}.points[${index}]`, point = object(candidate, pointPath);
      if (point === null) return;
      text(point.clip, `${pointPath}.clip`);
      if (raw.kind === "blend1D") number(point.at, `${pointPath}.at`);
      else tuple(point.at, `${pointPath}.at`, true);
    });
  };
  const raw = object(value, "");
  if (raw === null) return { graph: undefined, diagnostics };
  const layers = array(raw.layers, "layers"), seen = new Set<string>();
  if (layers?.length === 0) issue("layers", "An animation graph needs at least one layer.", "Add a layer with an entry state.");
  layers?.forEach((candidate, index) => {
    const path = `layers[${index}]`, layer = object(candidate, path);
    if (layer === null) return;
    if (text(layer.id, `${path}.id`)) {
      if (seen.has(layer.id)) issue(`${path}.id`, "Layer id is duplicated.", "Give each layer a distinct id.");
      seen.add(layer.id);
    }
    const validEntry = text(layer.entry, `${path}.entry`), states = object(layer.states, `${path}.states`);
    if (states !== null) {
      for (const [name, candidate] of Object.entries(states)) {
        text(name, field(`${path}.states`, name));
        state(candidate, field(`${path}.states`, name));
      }
      if (validEntry && !Object.hasOwn(states, layer.entry as string)) issue(`${path}.entry`, "Entry state does not exist in this layer.", "Choose a state declared in this layer.");
    }
    if (layer.weight !== undefined) number(layer.weight, `${path}.weight`, 0, 1);
    if (layer.additive !== undefined) boolean(layer.additive, `${path}.additive`);
    if (layer.mask !== undefined) array(layer.mask, `${path}.mask`)?.forEach((prefix, i) => text(prefix, `${path}.mask[${i}]`, true));
    array(layer.transitions, `${path}.transitions`)?.forEach((candidate, i) => {
      const edgePath = `${path}.transitions[${i}]`, edge = object(candidate, edgePath);
      if (edge === null) return;
      for (const key of ["from", "to"]) if (text(edge[key], `${edgePath}.${key}`) && states !== null && !(key === "from" && edge[key] === "*") && !Object.hasOwn(states, edge[key] as string)) {
        issue(`${edgePath}.${key}`, "Transition references an unknown state.", "Choose a state declared in this layer; only from may use *.");
      }
      if (edge.trigger !== undefined) text(edge.trigger, `${edgePath}.trigger`);
      if (edge.duration !== undefined) number(edge.duration, `${edgePath}.duration`, 0);
      if (edge.exitTime !== undefined) number(edge.exitTime, `${edgePath}.exitTime`);
      if (edge.when !== undefined) array(edge.when, `${edgePath}.when`)?.forEach((candidate, i) => {
        const conditionPath = `${edgePath}.when[${i}]`, condition = object(candidate, conditionPath);
        if (condition === null) return;
        text(condition.param, `${conditionPath}.param`);
        if (!COMPARES.includes(condition.op as AnimCompare)) issue(`${conditionPath}.op`, "Unknown comparison operator.", "Choose >, <, >=, <=, == or !=.");
        if (typeof condition.value !== "boolean") number(condition.value, `${conditionPath}.value`);
      });
    });
  });
  if (raw.events !== undefined) array(raw.events, "events")?.forEach((candidate, index) => {
    const path = `events[${index}]`, event = object(candidate, path);
    if (event === null) return;
    text(event.clip, `${path}.clip`);
    text(event.name, `${path}.name`);
    number(event.atSec, `${path}.atSec`, 0);
  });
  return { graph: diagnostics.length === 0 ? value as AnimGraph : undefined, diagnostics };
}
