import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

/** A world-space anchor `[x, y, z]` a floating-text entry rises from. */
export type FloatingTextPosition = readonly [number, number, number];

/**
 * One text pop to spawn: what to say, where in the world, and how it moves and
 * fades. Everything but `position` and `text` is optional and falls back to the
 * field's defaults. `kind` is a free-form tag (`"damage"`, `"heal"`, `"crit"`,
 * `"xp"`, `"gold"`, `"bark"`, …) the presentation layer styles — the model never
 * interprets it, so nothing here is combat- or genre-specific.
 */
export interface FloatingTextDef {
  /** World anchor the text rises from. */
  position: FloatingTextPosition;
  /** The text to show. */
  text: string;
  /** Free-form style tag the game colors/skins. Default `"default"`. */
  kind?: string;
  /** Optional CSS color hint carried straight through to the view (presentation may override per `kind`). */
  color?: string;
  /** Relative scale multiplier (before the birth pop-in). Default 1. */
  size?: number;
  /** Upward world-Y speed in units/second. Default = field `defaultRise`. */
  rise?: number;
  /** Horizontal world-X speed in units/second (signed). Default: a small seeded jitter in `±driftJitter`. */
  drift?: number;
  /** Lifetime in seconds. Default = field `defaultLifetime`. */
  lifetime?: number;
}

/** Construction options for {@link createFloatingTextField}. */
export interface FloatingTextFieldConfig {
  /** Hard cap on live entries; the pool never grows past this. When full, the oldest entry is recycled. Default 64. */
  max?: number;
  /** Injected wall clock in ms, stamped on each entry's `bornAt`. Default `Date.now`; inject for deterministic tests. */
  now?: () => number;
  /** Seed for the horizontal-drift jitter stream — same seed + same calls reproduce identical motion. Default `"floating-text"`. */
  seed?: string | number;
  /** Default lifetime in seconds when a def omits `lifetime`. Default 1.4. */
  defaultLifetime?: number;
  /** Default upward speed in units/second when a def omits `rise`. Default 1.2. */
  defaultRise?: number;
  /** Max magnitude of the seeded horizontal drift used when a def omits `drift`. Default 0.6. */
  driftJitter?: number;
  /** Fraction of life spent on the birth scale pop-in (0.6→1). Default 0.16. */
  popIn?: number;
  /** Fraction of life over which alpha fades to 0 at the end. Default 0.4. */
  fadeFraction?: number;
}

/** A live entry resolved for rendering: current world position and fade/scale over life. */
export interface FloatingTextView {
  /** Stable, monotonically increasing id assigned at emit — usable as a React key. */
  id: number;
  /** Current world position with rise (Y) and drift (X) applied. */
  position: FloatingTextPosition;
  /** The text to show. */
  text: string;
  /** The style tag (resolved; `"default"` when the def omitted `kind`). */
  kind: string;
  /** The def's color hint, if any. */
  color?: string;
  /** Resolved scale: base `size` times the current birth pop-in factor. */
  size: number;
  /** Opacity `0..1`, full until the fade window then easing to 0. */
  alpha: number;
  /** Age as a fraction of lifetime, `0..1`. */
  progress: number;
  /** Wall-clock ms the entry was emitted (from the injected `now`). */
  bornAt: number;
}

/** Serializable state for save/restore and deterministic replay. */
export interface FloatingTextSnapshot {
  seed: number;
  nextId: number;
  count: number;
  /** Numeric per-entry columns, flattened `count * NUMERIC_STRIDE`. */
  data: number[];
  /** Per-entry text. */
  text: string[];
  /** Per-entry kind. */
  kind: string[];
  /** Per-entry color (empty string = none). */
  color: string[];
}

/** A live, dt-driven field of world-anchored floating text. */
export interface FloatingTextField {
  /** Spawn one entry; returns its id. When the pool is full the oldest live entry is recycled. */
  emit(def: FloatingTextDef): number;
  /** Advance every entry by `dt` seconds: age, rise, drift, and reap the expired. */
  update(dt: number): void;
  /** Snapshot of the live entries resolved for rendering (a fresh array each call). */
  active(): FloatingTextView[];
  /** Live entry count. */
  count(): number;
  /** Remove every entry (keeps the seed stream and id counter). */
  clear(): void;
  /** Subscribe to changes (emit/update/clear/restore); returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  snapshot(): FloatingTextSnapshot;
  restore(snapshot: FloatingTextSnapshot): void;
}

/** Columns per entry in the numeric SoA pool: id, ox, oy, oz, age, life, rise, drift, size. */
const NUMERIC_STRIDE = 9;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A generic, allocation-aware field of world-anchored floating text: damage
 * numbers, heals, crits, XP/gold gains, status pops, dialogue barks — anything a
 * game wants to say at a point in the world for a moment. It is dt-driven (call
 * `update(dt)` each frame) and deterministic: the only randomness is the
 * horizontal drift jitter, which flows from the injected `seed`, so the same seed
 * and the same emit/update sequence reproduce identical motion, and
 * `snapshot`/`restore` round-trips the live pool. The model owns only the
 * spawn → rise/drift → fade → reap lifecycle: `kind` is a free string and `color`
 * a passthrough hint, so nothing here couples to combat or any genre. Presentation
 * (projecting each entry to the screen and styling it per `kind`) lives in
 * `@jgengine/react`'s `FloatingText`.
 *
 * @capability floating-text deterministic pooled world-anchored floating combat text / damage numbers with rise, drift, fade, and serializable state
 */
export function createFloatingTextField(config: FloatingTextFieldConfig = {}): FloatingTextField {
  const max = Math.max(1, Math.floor(config.max ?? 64));
  const now = config.now ?? (() => Date.now());
  const defaultLifetime = config.defaultLifetime ?? 1.4;
  const defaultRise = config.defaultRise ?? 1.2;
  const driftJitter = config.driftJitter ?? 0.6;
  const popIn = clamp01(config.popIn ?? 0.16);
  const fadeFraction = clamp01(config.fadeFraction ?? 0.4);

  // Numeric SoA columns.
  const id = new Float64Array(max);
  const ox = new Float32Array(max);
  const oy = new Float32Array(max);
  const oz = new Float32Array(max);
  const age = new Float32Array(max);
  const life = new Float32Array(max);
  const rise = new Float32Array(max);
  const drift = new Float32Array(max);
  const size = new Float32Array(max);
  const bornAt = new Float64Array(max);
  // String columns (strings can't live in a typed array).
  const text: string[] = new Array<string>(max).fill("");
  const kind: string[] = new Array<string>(max).fill("");
  const color: (string | undefined)[] = new Array<string | undefined>(max).fill(undefined);

  let live = 0;
  let nextId = 1;
  let seed: RandomSeed = randomSeedFrom(
    typeof config.seed === "number" ? config.seed : hashString(String(config.seed ?? "floating-text")),
  );

  const listeners = new Set<() => void>();
  function notify(): void {
    for (const listener of listeners) listener();
  }

  function rand(): number {
    const [value, next] = stepRandomSeed(seed);
    seed = next;
    return value;
  }

  /** Index of the oldest live entry (highest age) — the one recycled when the pool is full. */
  function oldestIndex(): number {
    let best = 0;
    for (let i = 1; i < live; i++) if (age[i]! > age[best]!) best = i;
    return best;
  }

  function writeEntry(i: number, def: FloatingTextDef): number {
    const entryId = nextId++;
    id[i] = entryId;
    ox[i] = def.position[0];
    oy[i] = def.position[1];
    oz[i] = def.position[2];
    age[i] = 0;
    life[i] = Math.max(0.0001, def.lifetime ?? defaultLifetime);
    rise[i] = def.rise ?? defaultRise;
    // A seeded per-entry drift keeps stacked numbers from overlapping; still deterministic.
    drift[i] = def.drift ?? (rand() * 2 - 1) * driftJitter;
    size[i] = def.size ?? 1;
    bornAt[i] = now();
    text[i] = def.text;
    kind[i] = def.kind ?? "default";
    color[i] = def.color;
    return entryId;
  }

  function swapRemove(i: number): void {
    const last = live - 1;
    if (i !== last) {
      id[i] = id[last]!;
      ox[i] = ox[last]!;
      oy[i] = oy[last]!;
      oz[i] = oz[last]!;
      age[i] = age[last]!;
      life[i] = life[last]!;
      rise[i] = rise[last]!;
      drift[i] = drift[last]!;
      size[i] = size[last]!;
      bornAt[i] = bornAt[last]!;
      text[i] = text[last]!;
      kind[i] = kind[last]!;
      color[i] = color[last];
    }
    live--;
  }

  /** Current scale (base times birth pop-in) for entry `i`. */
  function resolveScale(i: number): number {
    const t = clamp01(age[i]! / life[i]!);
    const pop = popIn > 0 && t < popIn ? 0.6 + 0.4 * (t / popIn) : 1;
    return size[i]! * pop;
  }
  /** Current alpha (full until the fade window, then easing to 0) for entry `i`. */
  function resolveAlpha(i: number): number {
    const t = clamp01(age[i]! / life[i]!);
    if (fadeFraction <= 0) return 1;
    const fadeStart = 1 - fadeFraction;
    return t <= fadeStart ? 1 : clamp01((1 - t) / fadeFraction);
  }

  const field: FloatingTextField = {
    emit(def) {
      const i = live < max ? live++ : oldestIndex();
      const entryId = writeEntry(i, def);
      notify();
      return entryId;
    },
    update(dt) {
      if (dt <= 0) return;
      for (let i = live - 1; i >= 0; i--) {
        age[i]! += dt;
        if (age[i]! >= life[i]!) {
          swapRemove(i);
        }
      }
      notify();
    },
    active() {
      const views: FloatingTextView[] = [];
      for (let i = 0; i < live; i++) {
        const a = age[i]!;
        views.push({
          id: id[i]!,
          position: [ox[i]! + drift[i]! * a, oy[i]! + rise[i]! * a, oz[i]!],
          text: text[i]!,
          kind: kind[i]!,
          color: color[i],
          size: resolveScale(i),
          alpha: resolveAlpha(i),
          progress: clamp01(a / life[i]!),
          bornAt: bornAt[i]!,
        });
      }
      return views;
    },
    count() {
      return live;
    },
    clear() {
      live = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      const data: number[] = [];
      const outText: string[] = [];
      const outKind: string[] = [];
      const outColor: string[] = [];
      for (let i = 0; i < live; i++) {
        data.push(id[i]!, ox[i]!, oy[i]!, oz[i]!, age[i]!, life[i]!, rise[i]!, drift[i]!, size[i]!);
        outText.push(text[i]!);
        outKind.push(kind[i]!);
        outColor.push(color[i] ?? "");
      }
      return { seed: seed as number, nextId, count: live, data, text: outText, kind: outKind, color: outColor };
    },
    restore(snapshot) {
      seed = randomSeedFrom(snapshot.seed);
      nextId = snapshot.nextId;
      live = Math.min(max, snapshot.count);
      for (let i = 0; i < live; i++) {
        const o = i * NUMERIC_STRIDE;
        id[i] = snapshot.data[o]!;
        ox[i] = snapshot.data[o + 1]!;
        oy[i] = snapshot.data[o + 2]!;
        oz[i] = snapshot.data[o + 3]!;
        age[i] = snapshot.data[o + 4]!;
        life[i] = snapshot.data[o + 5]!;
        rise[i] = snapshot.data[o + 6]!;
        drift[i] = snapshot.data[o + 7]!;
        size[i] = snapshot.data[o + 8]!;
        // bornAt is presentational only; it is not round-tripped, so re-stamp on restore.
        bornAt[i] = now();
        text[i] = snapshot.text[i]!;
        kind[i] = snapshot.kind[i]!;
        const c = snapshot.color[i];
        color[i] = c === undefined || c === "" ? undefined : c;
      }
      notify();
    },
  };

  return field;
}
