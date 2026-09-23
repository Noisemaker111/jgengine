/** Piecewise-linear map from a signal value to an output value; points in ascending input order, ends clamp. */
export type FeedbackCurve = readonly (readonly [number, number])[];

/** One wire from a sim signal to a named output. */
export interface FeedbackRoute<TSignal extends string, TTarget extends string> {
  signal: TSignal;
  target: TTarget;
  /** Signal → output mapping (default identity). */
  curve?: FeedbackCurve;
  /** Units/s the routed value may rise (default `Infinity`: follows instantly). */
  attack?: number;
  /** Units/s the routed value may fall (default `attack`). */
  release?: number;
}

/** A one-shot fired when a signal crosses a threshold (landing thud, gear-change clunk, impact rumble). */
export interface FeedbackEvent<TSignal extends string> {
  id: string;
  signal: TSignal;
  /** Fires when the signal rises to or above this value from below it. */
  threshold: number;
  /** Seconds before the same event may fire again (default `0`). */
  cooldown?: number;
}

/** Config for {@link createFeedbackMixer}. */
export interface FeedbackMixerConfig<TSignal extends string, TTarget extends string> {
  routes: readonly FeedbackRoute<TSignal, TTarget>[];
  /** How routes landing on the same target combine (default `"sum"`). */
  combine?: Partial<Record<TTarget, "sum" | "max">>;
  /** Value a target starts from before routes add to it (default `0`). */
  base?: Partial<Record<TTarget, number>>;
  events?: readonly FeedbackEvent<TSignal>[];
}

/** Serializable mixer state: smoothed route values, last signal per event, and event cooldowns. */
export interface FeedbackMixerState {
  routes: number[];
  eventSignals: number[];
  cooldowns: number[];
}

/** Maps sim telemetry to presentation parameters through declared routes, curves and smoothing. */
export interface FeedbackMixer<TSignal extends string, TTarget extends string> {
  /**
   * Advance by `dt` with this tick's signals and return every target's value. The returned record is reused
   * between calls, so read it before the next update. Missing signals read as `0`.
   */
  update(dt: number, signals: Readonly<Partial<Record<TSignal, number>>>): Readonly<Record<TTarget, number>>;
  /** True when event `id` fired on the last update. */
  fired(id: string): boolean;
  value(): Readonly<Record<TTarget, number>>;
  retune(next: FeedbackMixerConfig<TSignal, TTarget>): void;
  snapshot(): FeedbackMixerState;
  restore(state: FeedbackMixerState): void;
  reset(): void;
}

/** Sample a {@link FeedbackCurve}; an empty curve is the identity. */
export function sampleFeedbackCurve(curve: FeedbackCurve | undefined, x: number): number {
  if (curve === undefined || curve.length === 0) return x;
  const first = curve[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i]!;
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]!;
      const span = x1 - x0;
      return span <= 0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / span;
    }
  }
  return curve[curve.length - 1]![1];
}

function approach(current: number, target: number, attack: number, release: number, dt: number): number {
  const rate = target > current ? attack : release;
  if (!Number.isFinite(rate)) return target;
  const step = Math.max(0, rate) * dt;
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

/**
 * Creates a {@link FeedbackMixer}: the one place a game declares how sim telemetry drives presentation —
 * rpm to engine pitch, tire saturation to squeal and rumble, speed to FOV, landing speed to a thud — instead
 * of hand-writing that glue per vehicle, aircraft or weapon. Deterministic, allocation-free per update.
 * @capability feedback-mixer map sim telemetry to camera, audio and haptic parameters through curves, smoothing and threshold events
 */
export function createFeedbackMixer<TSignal extends string, TTarget extends string>(
  initial: FeedbackMixerConfig<TSignal, TTarget>,
): FeedbackMixer<TSignal, TTarget> {
  let config = initial;
  let routeValues: number[] = [];
  let eventSignals: number[] = [];
  let cooldowns: number[] = [];
  let firedNow = new Set<string>();
  const output = {} as Record<TTarget, number>;
  const touched = new Set<TTarget>();

  function shapeState(): void {
    routeValues = config.routes.map((_, i) => routeValues[i] ?? 0);
    eventSignals = (config.events ?? []).map((_, i) => eventSignals[i] ?? 0);
    cooldowns = (config.events ?? []).map((_, i) => cooldowns[i] ?? 0);
    for (const route of config.routes) output[route.target] ??= 0;
    for (const key of Object.keys(config.base ?? {}) as TTarget[]) output[key] ??= config.base?.[key] ?? 0;
  }
  shapeState();

  return {
    update(dt, signals) {
      const step = Math.max(0, dt);
      for (const key of Object.keys(output) as TTarget[]) output[key] = config.base?.[key] ?? 0;
      touched.clear();
      for (let i = 0; i < config.routes.length; i += 1) {
        const route = config.routes[i]!;
        const target = sampleFeedbackCurve(route.curve, signals[route.signal] ?? 0);
        const attack = route.attack ?? Number.POSITIVE_INFINITY;
        const value = approach(routeValues[i]!, target, attack, route.release ?? attack, step);
        routeValues[i] = value;
        const mode = config.combine?.[route.target] ?? "sum";
        if (mode === "max") {
          const current = touched.has(route.target) ? output[route.target] : Number.NEGATIVE_INFINITY;
          output[route.target] = Math.max(current, value);
        } else output[route.target] += value;
        touched.add(route.target);
      }
      firedNow.clear();
      const events = config.events ?? [];
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i]!;
        const value = signals[event.signal] ?? 0;
        cooldowns[i] = Math.max(0, cooldowns[i]! - step);
        if (value >= event.threshold && eventSignals[i]! < event.threshold && cooldowns[i] === 0) {
          firedNow.add(event.id);
          cooldowns[i] = event.cooldown ?? 0;
        }
        eventSignals[i] = value;
      }
      return output;
    },
    fired: (id) => firedNow.has(id),
    value: () => output,
    retune(next) {
      config = next;
      shapeState();
    },
    snapshot: () => ({ routes: [...routeValues], eventSignals: [...eventSignals], cooldowns: [...cooldowns] }),
    restore(state) {
      routeValues = [...state.routes];
      eventSignals = [...state.eventSignals];
      cooldowns = [...state.cooldowns];
      shapeState();
    },
    reset() {
      routeValues = routeValues.map(() => 0);
      eventSignals = eventSignals.map(() => 0);
      cooldowns = cooldowns.map(() => 0);
      firedNow = new Set();
      for (const key of Object.keys(output) as TTarget[]) output[key] = config.base?.[key] ?? 0;
    },
  };
}
