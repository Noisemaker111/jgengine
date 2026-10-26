/**
 * A single incoming hit to register on a {@link DamageDirectionTracker}. The
 * angle is relative to the player's facing (renderer-agnostic): `0` points at the
 * front/top of the reticle and increases clockwise, so a game passes the bearing
 * from the player toward the attacker without knowing anything about the screen.
 */
export interface HitInput {
  /** Direction the damage came from, in radians. `0` = front/up, increasing clockwise. */
  angle: number;
  /** Peak strength `0..1` driving the arc's opacity/scale. Clamped. Default `1`. */
  intensity?: number;
  /** Free-form game style tag (e.g. `"melee"`, `"fire"`, `"crit"`). Never interpreted by the model — a renderer maps it to color. Default `"default"`. */
  kind?: string;
}

/**
 * A live directional indicator with its eased, time-decayed strength, produced by
 * {@link DamageDirectionTracker.active}. The `intensity` here is the *current*
 * eased value (peak faded over the elapsed lifetime), ready to drive opacity/scale.
 */
export interface DamageIndicator {
  /** Direction the damage came from, in radians (`0` = front/up, clockwise). */
  angle: number;
  /** Style tag carried from the originating {@link HitInput}. */
  kind: string;
  /** Current eased strength `0..1` — peak intensity decayed over its lifetime. */
  intensity: number;
  /** Seconds elapsed since the hit was registered, on the injected clock. */
  age: number;
}

/** Serializable state for save/restore — the clock reading plus every live indicator. */
export interface DamageDirectionSnapshot {
  /** Clock reading (ms) when the snapshot was taken, so ages restore correctly. */
  now: number;
  /** Live indicators, each with its peak intensity, birth time, and fade duration. */
  indicators: readonly {
    angle: number;
    kind: string;
    intensity: number;
    bornAt: number;
    duration: number;
  }[];
}

/** Options for {@link createDamageDirectionTracker}. */
export interface DamageDirectionOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  /** How long an indicator takes to fade out, in ms. Default `1200`. */
  duration?: number;
  /** Hard cap on simultaneous indicators; the pool never grows past this. Default `32`. */
  max?: number;
  /**
   * If `> 0`, a new hit whose angle is within this many radians of a live
   * indicator with the same `kind` refreshes and strengthens that indicator
   * instead of adding a new one — so a burst from one direction reads as one
   * strong arc. Default `0` (every hit is its own indicator).
   */
  mergeWindow?: number;
  /**
   * Fade curve mapping remaining-life fraction `1..0` to strength `1..0`.
   * Default ease-out (`1 - (1 - x) ** 2`) — holds bright, then drops off.
   */
  easing?: (remaining: number) => number;
}

/**
 * A serializable, allocation-aware brain that tracks where recent damage came
 * from. Each registered hit becomes a directional indicator that fades over a
 * fixed duration on the injected clock; {@link DamageDirectionTracker.active}
 * reports the live ones with their eased current strength.
 */
export interface DamageDirectionTracker {
  /** Register an incoming hit and return the indicator's current view. */
  registerHit(hit: HitInput): DamageIndicator;
  /**
   * The live indicators with eased current strength, sorted strongest-first.
   * The returned array and its entries are reused between calls (no per-call
   * allocation) — read or copy them before the next `active`/`registerHit`.
   */
  active(): readonly DamageIndicator[];
  /** Number of live (not-yet-faded) indicators. */
  count(): number;
  /** Drop every indicator immediately. */
  clear(): void;
  /** Observe changes (hit registered, cleared, restored). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): DamageDirectionSnapshot;
  /** Restore from a {@link DamageDirectionSnapshot}. */
  restore(snapshot: DamageDirectionSnapshot): void;
}

const TAU = Math.PI * 2;

/** Shortest angular distance (magnitude) between two angles, in `0..π`. */
function angularDistance(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d < -Math.PI) d += TAU;
  else if (d > Math.PI) d -= TAU;
  return Math.abs(d);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Slot {
  active: boolean;
  angle: number;
  kind: string;
  intensity: number;
  bornAt: number;
  duration: number;
}

/**
 * Create a damage-direction tracker: the classic "hit-from" feedback brain. A
 * game calls `registerHit({ angle, intensity, kind })` with the bearing from the
 * player toward the attacker (radians, `0` = front) and the tracker owns the fade
 * timers and eased strength so the renderer just draws an arc per `active()`
 * entry. It is renderer-free and genre-agnostic (the `kind` tag is never
 * interpreted here), allocation-aware (a fixed pool, no per-frame garbage), and
 * fully serializable via `snapshot`/`restore`. Optional angle merging collapses a
 * burst from one direction into a single strong arc.
 *
 * @capability damage-direction serializable hit-from damage-direction indicator brain — pooled directional arcs that flare on `registerHit(angle, intensity)` and fade on an injected clock, with optional same-direction merging
 */
export function createDamageDirectionTracker(
  options: DamageDirectionOptions = {},
): DamageDirectionTracker {
  const now = options.now ?? Date.now;
  const defaultDuration = Math.max(1, options.duration ?? 1200);
  const max = Math.max(1, Math.floor(options.max ?? 32));
  const mergeWindow = Math.max(0, options.mergeWindow ?? 0);
  const easing = options.easing ?? ((x: number): number => 1 - (1 - x) * (1 - x));

  // Fixed pool — slots are reused, never re-allocated.
  const slots: Slot[] = [];
  // Reused output views + array, so `active()` allocates nothing on the hot path.
  const views: DamageIndicator[] = [];
  const out: DamageIndicator[] = [];
  for (let i = 0; i < max; i += 1) {
    slots.push({ active: false, angle: 0, kind: "default", intensity: 0, bornAt: 0, duration: 0 });
    views.push({ angle: 0, kind: "default", intensity: 0, age: 0 });
  }

  const listeners = new Set<() => void>();
  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Current eased strength of a slot at time `t` (ms), or `0` once fully faded. */
  function strengthAt(slot: Slot, t: number): number {
    const elapsed = t - slot.bornAt;
    if (elapsed <= 0) return slot.intensity;
    if (elapsed >= slot.duration) return 0;
    return slot.intensity * easing(1 - elapsed / slot.duration);
  }

  /** Find a reusable slot: a dead one, else the weakest live one to evict. */
  function acquireSlot(t: number): Slot {
    let weakest: Slot | null = null;
    let weakestStrength = Infinity;
    for (const slot of slots) {
      if (!slot.active) return slot;
      const s = strengthAt(slot, t);
      if (s <= 0) return slot;
      if (s < weakestStrength) {
        weakestStrength = s;
        weakest = slot;
      }
    }
    return weakest ?? slots[0]!;
  }

  function writeView(index: number, slot: Slot, t: number): DamageIndicator {
    const view = views[index]!;
    view.angle = slot.angle;
    view.kind = slot.kind;
    view.intensity = strengthAt(slot, t);
    view.age = Math.max(0, (t - slot.bornAt) / 1000);
    return view;
  }

  return {
    registerHit(hit) {
      const t = now();
      const angle = hit.angle;
      const kind = hit.kind ?? "default";
      const intensity = clamp01(hit.intensity ?? 1);

      let slot: Slot | null = null;
      if (mergeWindow > 0) {
        // Refresh a live, same-kind indicator from a nearby direction.
        for (const candidate of slots) {
          if (!candidate.active || candidate.kind !== kind) continue;
          if (strengthAt(candidate, t) <= 0) continue;
          if (angularDistance(candidate.angle, angle) <= mergeWindow) {
            slot = candidate;
            break;
          }
        }
      }
      const merged = slot !== null;
      if (slot === null) slot = acquireSlot(t);

      // A merged refresh keeps the stronger peak so a burst reads bright.
      const peak = merged ? Math.max(intensity, slot.intensity) : intensity;
      slot.active = true;
      slot.angle = angle;
      slot.kind = kind;
      slot.intensity = peak;
      slot.bornAt = t;
      slot.duration = defaultDuration;

      notify();
      return writeView(slots.indexOf(slot), slot, t);
    },
    active() {
      const t = now();
      out.length = 0;
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]!;
        if (!slot.active) continue;
        if (t - slot.bornAt >= slot.duration) {
          slot.active = false;
          continue;
        }
        out.push(writeView(i, slot, t));
      }
      out.sort((a, b) => b.intensity - a.intensity);
      return out;
    },
    count() {
      const t = now();
      let n = 0;
      for (const slot of slots) {
        if (!slot.active) continue;
        if (t - slot.bornAt < slot.duration) n += 1;
        else slot.active = false;
      }
      return n;
    },
    clear() {
      let changed = false;
      for (const slot of slots) {
        if (slot.active) {
          slot.active = false;
          changed = true;
        }
      }
      if (changed) notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      const t = now();
      const indicators: DamageDirectionSnapshot["indicators"] = slots
        .filter((slot) => slot.active && t - slot.bornAt < slot.duration)
        .map((slot) => ({
          angle: slot.angle,
          kind: slot.kind,
          intensity: slot.intensity,
          bornAt: slot.bornAt,
          duration: slot.duration,
        }));
      return { now: t, indicators };
    },
    restore(snapshot) {
      for (const slot of slots) slot.active = false;
      const limit = Math.min(slots.length, snapshot.indicators.length);
      for (let i = 0; i < limit; i += 1) {
        const src = snapshot.indicators[i]!;
        const slot = slots[i]!;
        slot.active = true;
        slot.angle = src.angle;
        slot.kind = src.kind;
        slot.intensity = clamp01(src.intensity);
        slot.bornAt = src.bornAt;
        slot.duration = Math.max(1, src.duration);
      }
      notify();
    },
  };
}
