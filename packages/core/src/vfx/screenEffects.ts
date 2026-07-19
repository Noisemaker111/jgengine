/** How a transient effect's intensity curves from peak to zero over its life. */
export type ScreenEffectEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

/**
 * The screen region an effect tints. `"full"` grades the whole frame (a flash);
 * `"vignette"` grades only the edges, leaving the center clear (a directional or
 * ambient border tint). Purely a shape hint for the renderer — no genre meaning.
 */
export type ScreenEffectShape = "full" | "vignette";

/**
 * One screen-feedback effect, fully data-first so a whole controller serializes.
 * `kind` is a free label the game assigns and styles ("damage", "heal", "poison",
 * "boost", …); the model never interprets it. Everything visible is a parameter:
 * color, peak intensity, region shape, easing, and either a transient duration or
 * a sustained (optionally oscillating) hold.
 */
export interface ScreenEffectSpec {
  /** Free-string label the game owns; the model treats it as opaque. */
  kind: string;
  /** CSS color the region is tinted with (e.g. `"#ff2b2b"`, `"rgb(80,200,120)"`). */
  color: string;
  /** Peak opacity `0..1` at full strength. Default `1`. */
  intensity?: number;
  /** Which region is tinted. Default `"full"`. */
  shape?: ScreenEffectShape;
  /** Intensity curve for a transient effect. Default `"easeOut"`. */
  easing?: ScreenEffectEasing;
  /**
   * Lifetime in ms for a transient effect (ignored when `sustained`). The effect
   * peaks immediately and eases to zero over this window. Default `400`.
   */
  durationMs?: number;
  /**
   * When true the effect holds until {@link ScreenEffectsController.clear} instead
   * of expiring — a low-health tint, a status aura. Default `false`.
   */
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
  /** Stable id assigned at trigger time (use it to {@link ScreenEffectsController.clear}). */
  id: number;
  /** The game-owned label from the spec. */
  kind: string;
  /** CSS color to tint with. */
  color: string;
  /** Region to tint. */
  shape: ScreenEffectShape;
  /** Current eased opacity `0..1`. */
  intensity: number;
}

/** A persisted effect record (all spec fields resolved plus its start time and id). */
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

/** Serializable state of every active effect, for save/restore and replay. */
export interface ScreenEffectsSnapshot {
  /** Wall-clock (ms) the snapshot was taken, so restore re-anchors elapsed time. */
  now: number;
  /** Next id to hand out. */
  nextId: number;
  /** Every active effect, transient and sustained. */
  effects: readonly StoredScreenEffect[];
}

/** A live, clock-driven screen-feedback controller. */
export interface ScreenEffectsController {
  /**
   * Trigger a transient full-screen flash. Convenience for {@link trigger} with
   * `shape: "full"`. Returns the new effect id.
   */
  flash(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "shape" | "sustained">): number;
  /**
   * Trigger a transient edge vignette. Convenience for {@link trigger} with
   * `shape: "vignette"`. Returns the new effect id.
   */
  vignette(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "shape" | "sustained">): number;
  /**
   * Start a sustained pulse that holds until {@link clear}. Convenience for a
   * sustained effect; pass `pulseHz > 0` to breathe. Returns the new effect id.
   */
  pulse(kind: string, spec: Omit<ScreenEffectSpec, "kind" | "sustained">): number;
  /** Trigger any effect from a full spec. Returns the new effect id. */
  trigger(spec: ScreenEffectSpec): number;
  /** Remove one effect by id (typically a sustained one). No-op if unknown. */
  clear(id: number): void;
  /** Remove every active effect. */
  clearAll(): void;
  /**
   * Re-evaluate every effect against the clock: recompute eased intensities, reap
   * expired transients, and notify subscribers. Allocation-free on the hot path.
   * Pass an explicit `nowMs` to drive deterministically, else the injected clock.
   */
  advance(nowMs?: number): void;
  /**
   * The current composite: active effects with their eased `intensity`. The array
   * and its entries are pooled and overwritten on the next call — do not retain.
   */
  composite(): readonly ScreenEffect[];
  /** Number of active effects. */
  active(): number;
  /** Observe changes (trigger, clear, advance). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): ScreenEffectsSnapshot;
  /** Restore from a {@link ScreenEffectsSnapshot}. */
  restore(snapshot: ScreenEffectsSnapshot): void;
}

/** Options for {@link createScreenEffects}. */
export interface ScreenEffectsOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

/** Mutable live effect record (internal; pooled per controller, not per tick). */
interface LiveEffect extends StoredScreenEffect {
  /** Cached current eased opacity, refreshed by {@link ScreenEffectsController.advance}. */
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
