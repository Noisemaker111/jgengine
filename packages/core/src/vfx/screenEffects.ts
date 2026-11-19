import { clamp01 } from "../math/scalar";

export type ScreenEffectEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

export type ScreenEffectShape = "full" | "vignette";

/**
 * One screen-feedback effect, fully data-first so a whole controller serializes.
 * `kind` is a free label the game assigns and styles ("damage", "heal", "poison",
 * "boost", …); the model never interprets it. Everything visible is a parameter:
 * color, peak intensity, region shape, easing, and either a transient duration or
 * a sustained (optionally oscillating) hold.
 */
export interface ScreenEffectSpec {
  kind: string;
  color: string;
  /** Peak opacity `0..1` at full strength. Default `1`. */
  intensity?: number;
  shape?: ScreenEffectShape;
  easing?: ScreenEffectEasing;
  /**
   * Lifetime in ms for a transient effect (ignored when `sustained`). The effect
   * peaks immediately and eases to zero over this window. Default `400`.
   */
  durationMs?: number;
  sustained?: boolean;
  /**
   * Oscillation frequency in Hz for a sustained effect (a pulse). `0` holds steady
   * at `intensity`; `>0` breathes between `minIntensity` and `intensity`. Ignored
   * for transient effects. Default `0`.
   */
  pulseHz?: number;
  /** Trough opacity `0..1` a pulsing sustained effect dips to. Default `0`. */
  minIntensity?: number;
}

/**
 * A live effect in the current composite: its label, color, region, and the
 * eased opacity `0..1` to draw *right now*. These objects are pooled and reused
 * across {@link ScreenEffectsController.composite} calls — read them, don't retain.
 */
export interface ScreenEffect {
  id: number;
  kind: string;
  color: string;
  shape: ScreenEffectShape;
  /** Current eased opacity `0..1`. */
  intensity: number;
}

export interface StoredScreenEffect {
  id: number;
  kind: string;
  color: string;
  shape: ScreenEffectShape;
  easing: ScreenEffectEasing;
  intensity: number;
  durationMs: number;
  sustained: boolean;
  pulseHz: number;
  minIntensity: number;
  /** Clock time (ms) the effect started, for elapsed-time evaluation. */
  startAt: number;
}

export interface ScreenEffectsSnapshot {
  /** Wall-clock (ms) the snapshot was taken, so restore re-anchors elapsed time. */
  now: number;
  nextId: number;
  effects: readonly StoredScreenEffect[];
}

export interface ScreenEffectsController {
  flash(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "shape" | "sustained">): number;
  vignette(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "shape" | "sustained">): number;
  pulse(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "sustained">): number;
  trigger(spec: ScreenEffectSpec): number;
  clear(id: number): void;
  clearAll(): void;
  advance(nowMs?: number): void;
  /**
   * The current composite: active effects with their eased `intensity`. The array
   * and its entries are pooled and overwritten on the next call — do not retain.
   */
  composite(): readonly ScreenEffect[];
  active(): number;
  subscribe(listener: () => void): () => void;
  snapshot(): ScreenEffectsSnapshot;
  restore(snapshot: ScreenEffectsSnapshot): void;
}

export interface ScreenEffectsOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
}

/** Eased progress `0..1` for a transient effect's decay curve. */
function easeProgress(t: number, easing: ScreenEffectEasing): number {
  const p = clamp01(t);
  switch (easing) {
    case "linear":
      return p;
    case "easeIn":
      return p * p;
    case "easeInOut":
      return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    case "easeOut":
    default:
      return 1 - (1 - p) ** 2;
  }
}

interface LiveEffect extends StoredScreenEffect {
  current: number;
}

const TWO_PI = Math.PI * 2;

/**
 * A serializable screen-feedback controller: a game triggers transient flashes and
 * edge vignettes (a red damage hit, a green heal flash) or sustained, optionally
 * oscillating tints (a low-health pulse), and reads back a composite of the effects
 * to draw right now with their eased opacities. It is clock-driven — call
 * `advance()` each frame against an injected `now` — and allocation-aware: the
 * composite array and its entries are pooled and reused, so steady-state ticking
 * never allocates. Nothing here is genre-specific: `kind` is a free label the game
 * owns and styles, and vignette / flash / pulse are just parameterizations of the
 * same data (region shape, decay easing, sustained oscillation). A shell overlay
 * subscribes and renders; `snapshot`/`restore` round-trips through a save.
 *
 * @capability screen-effects serializable, pooled screen-feedback controller — transient flash/vignette and sustained low-health-style pulses with eased opacities, free-string kinds the game styles, and snapshot/restore
 */
export function createScreenEffects(options: ScreenEffectsOptions = {}): ScreenEffectsController {
  const now = options.now ?? Date.now;
  const effects: LiveEffect[] = [];
  const listeners = new Set<() => void>();

  // Pooled composite output — reused across composite() calls, never per-tick allocated.
  const viewPool: ScreenEffect[] = [];
  const viewOut: ScreenEffect[] = [];

  let nextId = 1;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Eased current opacity for one effect at `t` ms clock time. */
  function evaluate(effect: LiveEffect, t: number): number {
    const elapsed = t - effect.startAt;
    if (effect.sustained) {
      if (effect.pulseHz <= 0) return effect.intensity;
      const phase = (elapsed / 1000) * effect.pulseHz * TWO_PI;
      const osc = (Math.sin(phase) + 1) / 2; // 0..1
      return effect.minIntensity + (effect.intensity - effect.minIntensity) * osc;
    }
    if (effect.durationMs <= 0) return 0;
    const progress = elapsed / effect.durationMs;
    if (progress >= 1) return 0;
    return effect.intensity * (1 - easeProgress(progress, effect.easing));
  }

  function refresh(t: number): void {
    // Iterate backwards: reap expired transients with swap-remove, no allocation.
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]!;
      if (!effect.sustained && t - effect.startAt >= effect.durationMs) {
        const last = effects.length - 1;
        if (i !== last) effects[i] = effects[last]!;
        effects.pop();
        continue;
      }
      effect.current = evaluate(effect, t);
    }
  }

  function add(spec: ScreenEffectSpec): number {
    const id = nextId++;
    const t = now();
    const effect: LiveEffect = {
      id,
      kind: spec.kind,
      color: spec.color,
      shape: spec.shape ?? "full",
      easing: spec.easing ?? "easeOut",
      intensity: clamp01(spec.intensity ?? 1),
      durationMs: spec.durationMs ?? 400,
      sustained: spec.sustained ?? false,
      pulseHz: Math.max(0, spec.pulseHz ?? 0),
      minIntensity: clamp01(spec.minIntensity ?? 0),
      startAt: t,
      current: 0,
    };
    effect.current = evaluate(effect, t);
    effects.push(effect);
    notify();
    return id;
  }

  return {
    flash(kind, spec) {
      return add({ ...spec, kind, shape: "full", sustained: false });
    },
    vignette(kind, spec) {
      return add({ ...spec, kind, shape: "vignette", sustained: false });
    },
    pulse(kind, spec) {
      return add({ shape: "vignette", ...spec, kind, sustained: true });
    },
    trigger(spec) {
      return add(spec);
    },
    clear(id) {
      const index = effects.findIndex((effect) => effect.id === id);
      if (index === -1) return;
      const last = effects.length - 1;
      if (index !== last) effects[index] = effects[last]!;
      effects.pop();
      notify();
    },
    clearAll() {
      if (effects.length === 0) return;
      effects.length = 0;
      notify();
    },
    advance(nowMs) {
      refresh(nowMs ?? now());
      notify();
    },
    composite() {
      viewOut.length = 0;
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]!;
        if (effect.current <= 0) continue;
        let view = viewPool[viewOut.length];
        if (view === undefined) {
          view = { id: 0, kind: "", color: "", shape: "full", intensity: 0 };
          viewPool[viewOut.length] = view;
        }
        view.id = effect.id;
        view.kind = effect.kind;
        view.color = effect.color;
        view.shape = effect.shape;
        view.intensity = effect.current;
        viewOut.push(view);
      }
      return viewOut;
    },
    active() {
      return effects.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        now: now(),
        nextId,
        effects: effects.map((effect) => ({
          id: effect.id,
          kind: effect.kind,
          color: effect.color,
          shape: effect.shape,
          easing: effect.easing,
          intensity: effect.intensity,
          durationMs: effect.durationMs,
          sustained: effect.sustained,
          pulseHz: effect.pulseHz,
          minIntensity: effect.minIntensity,
          startAt: effect.startAt,
        })),
      };
    },
    restore(snapshot) {
      effects.length = 0;
      nextId = snapshot.nextId;
      const t = now();
      const drift = t - snapshot.now;
      for (const stored of snapshot.effects) {
        const effect: LiveEffect = { ...stored, startAt: stored.startAt + drift, current: 0 };
        effect.current = evaluate(effect, t);
        effects.push(effect);
      }
      notify();
    },
  };
}
