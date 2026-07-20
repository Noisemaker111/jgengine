import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

/** A per-frame camera shake offset: three positional axes plus three rotational axes (radians). */
export interface CameraShakeOffset {
  /** Positional kick along camera-space X. */
  x: number;
  /** Positional kick along camera-space Y. */
  y: number;
  /** Positional kick along camera-space Z. */
  z: number;
  /** Rotational kick about the pitch axis (radians). */
  pitch: number;
  /** Rotational kick about the yaw axis (radians). */
  yaw: number;
  /** Rotational kick about the roll axis (radians). */
  roll: number;
}

/** Configuration for {@link createCameraShake}. Every field has a game-feel default. */
export interface CameraShakeConfig {
  /** Trauma bled off per second while `update` runs. Default `1.6`. */
  decayPerSecond?: number;
  /**
   * Exponent applied to trauma before it drives the offset (`shake = trauma^exp`),
   * so small hits stay subtle and big hits dominate. Default `2` (the classic
   * "trauma squared" curve).
   */
  traumaExponent?: number;
  /** Peak positional offset at full shake, per `[x, y, z]` axis (world units). Default `[0.6, 0.6, 0.4]`. */
  maxTranslation?: readonly [number, number, number];
  /** Peak rotational offset at full shake, per `[pitch, yaw, roll]` axis (radians). Default `[0.06, 0.06, 0.12]`. */
  maxRotation?: readonly [number, number, number];
  /** Base noise frequency (oscillations per second) sampled along the time cursor. Default `18`. */
  frequency?: number;
  /** Deterministic seed for the value noise; same seed + dt sequence reproduces the same offsets. Default `"camera-shake"`. */
  seed?: string | number;
  /** Injected clock (ms) used when `update` is called with no explicit dt. Default `Date.now`. */
  now?: () => number;
}

/** Serializable state for save/restore and deterministic replay. */
export interface CameraShakeSnapshot {
  /** Current trauma in `[0, 1]`. */
  trauma: number;
  /** Advancing time cursor (seconds) the noise is sampled along. */
  time: number;
  /** The base value-noise seed as a plain integer. */
  seed: number;
  /** The last free-string `kind` label handed to `add`, or `null`. */
  kind: string | null;
}

/** A live, dt-driven, trauma-based camera shake controller. */
export interface CameraShakeController {
  /**
   * Add trauma (clamped into `[0, 1]`). `kind` is a free string the model never
   * interprets — it only carries it through so a game can style/label impacts
   * ("hit", "explosion", "landing", …). Larger hits raise the ceiling toward 1.
   */
  add(amount: number, kind?: string): void;
  /**
   * Advance the shake: bleed trauma by `decayPerSecond` and move the noise time
   * cursor forward. Pass explicit `dt` seconds to drive deterministically, else
   * the injected clock supplies the delta since the last call.
   */
  update(dt?: number): void;
  /**
   * The shake to apply this frame — a POOLED object reused across calls (read it,
   * don't retain it). Each axis is `trauma^traumaExponent * max[axis] * noise`,
   * where the noise is deterministic seeded value-noise sampled at the time cursor.
   */
  offset(): CameraShakeOffset;
  /** Current trauma in `[0, 1]`. */
  trauma(): number;
  /** The last free-string `kind` handed to `add`, or `undefined` if none yet. */
  kind(): string | undefined;
  /** Patch the config in place (e.g. retune decay or amplitudes at runtime). */
  configure(patch: Partial<CameraShakeConfig>): void;
  /** Reset trauma to 0 (keeps the seed and time cursor). */
  clear(): void;
  /** Observe changes (add, update, configure, clear, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): CameraShakeSnapshot;
  /** Restore from a {@link CameraShakeSnapshot}. */
  restore(snapshot: CameraShakeSnapshot): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A stable pseudo-random value in `[-1, 1]` for integer lattice point `i` off a base seed. */
function latticeValue(seed: RandomSeed, i: number): number {
  const mixed = randomSeedFrom((seed ^ Math.imul(i | 0, 0x9e3779b1)) | 0);
  const [value] = stepRandomSeed(mixed);
  return value * 2 - 1;
}

/**
 * 1-D smoothstep value noise: hash the two integer lattice points bracketing `t`
 * and interpolate. Continuous and deterministic — no per-frame RNG, so the same
 * seed and time reproduce the same value.
 */
function valueNoise(seed: RandomSeed, t: number): number {
  const i0 = Math.floor(t);
  const f = t - i0;
  const a = latticeValue(seed, i0);
  const b = latticeValue(seed, i0 + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// Per-axis frequency multipliers decorrelate the six channels so the shake never
// looks like a single sine sweep. Fixed constants (not tunable) — pure feel.
const AXIS_FREQ: readonly number[] = [1, 1.17, 0.83, 1.31, 0.91, 1.09];

/**
 * A seeded, serializable, trauma-based camera shake / impulse controller. A game
 * calls `add(amount, kind?)` on impacts (a hit, an explosion, a landing) to raise
 * trauma in `[0, 1]`; `update(dt)` bleeds it off over time; and `offset()` returns
 * a pooled `{ x, y, z, pitch, yaw, roll }` kick equal to `trauma^exponent` times
 * per-axis maxima times deterministic seeded value-noise sampled along an internal
 * time cursor. A shell consumer applies that offset to the active camera each frame
 * so the view visibly shakes. Nothing here is genre-specific: `kind` is a free
 * label the game styles, all amplitudes/decay are parameters, and `snapshot`/
 * `restore` round-trips the shake through a save. Deterministic from `seed`: the
 * same seed and dt sequence reproduce the same offsets.
 *
 * @capability camera-shake seeded serializable trauma-based camera shake/impulse controller (hit/explosion/landing juice) with pooled per-frame translation+rotation offset and snapshot/restore
 */
export function createCameraShake(config: CameraShakeConfig = {}): CameraShakeController {
  const cfg: Required<Omit<CameraShakeConfig, "seed" | "now">> = {
    decayPerSecond: config.decayPerSecond ?? 1.6,
    traumaExponent: config.traumaExponent ?? 2,
    maxTranslation: config.maxTranslation ?? [0.6, 0.6, 0.4],
    maxRotation: config.maxRotation ?? [0.06, 0.06, 0.12],
    frequency: config.frequency ?? 18,
  };
  const now = config.now ?? Date.now;

  let seed: RandomSeed = randomSeedFrom(
    typeof config.seed === "number" ? config.seed : hashString(String(config.seed ?? "camera-shake")),
  );
  let trauma = 0;
  let time = 0;
  let kind: string | undefined;
  let lastNow: number | null = null;

  const listeners = new Set<() => void>();
  // Pooled offset — reused across offset() calls, never per-frame allocated.
  const out: CameraShakeOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    add(amount, impactKind) {
      if (impactKind !== undefined) kind = impactKind;
      trauma = clamp01(trauma + amount);
      notify();
    },
    update(dt) {
      let seconds: number;
      if (dt === undefined) {
        const t = now();
        seconds = lastNow === null ? 0 : Math.max(0, (t - lastNow) / 1000);
        lastNow = t;
      } else {
        seconds = Math.max(0, dt);
      }
      if (seconds <= 0) return;
      time += seconds;
      trauma = clamp01(trauma - cfg.decayPerSecond * seconds);
      notify();
    },
    offset() {
      const shake = Math.pow(trauma, cfg.traumaExponent);
      if (shake <= 0) {
        out.x = out.y = out.z = out.pitch = out.yaw = out.roll = 0;
        return out;
      }
      const [mtx, mty, mtz] = cfg.maxTranslation;
      const [mrp, mry, mrr] = cfg.maxRotation;
      const f = cfg.frequency;
      // Each axis samples an independent seed offset + frequency so channels decorrelate.
      out.x = mtx * shake * valueNoise(randomSeedFrom((seed ^ 0x0100) | 0), time * f * AXIS_FREQ[0]!);
      out.y = mty * shake * valueNoise(randomSeedFrom((seed ^ 0x0200) | 0), time * f * AXIS_FREQ[1]!);
      out.z = mtz * shake * valueNoise(randomSeedFrom((seed ^ 0x0300) | 0), time * f * AXIS_FREQ[2]!);
      out.pitch = mrp * shake * valueNoise(randomSeedFrom((seed ^ 0x0400) | 0), time * f * AXIS_FREQ[3]!);
      out.yaw = mry * shake * valueNoise(randomSeedFrom((seed ^ 0x0500) | 0), time * f * AXIS_FREQ[4]!);
      out.roll = mrr * shake * valueNoise(randomSeedFrom((seed ^ 0x0600) | 0), time * f * AXIS_FREQ[5]!);
      return out;
    },
    trauma() {
      return trauma;
    },
    kind() {
      return kind;
    },
    configure(patch) {
      Object.assign(cfg, patch);
      if (patch.seed !== undefined) {
        seed = randomSeedFrom(
          typeof patch.seed === "number" ? patch.seed : hashString(String(patch.seed)),
        );
      }
      notify();
    },
    clear() {
      trauma = 0;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { trauma, time, seed: seed as number, kind: kind ?? null };
    },
    restore(snapshot) {
      trauma = clamp01(snapshot.trauma);
      time = snapshot.time;
      seed = randomSeedFrom(snapshot.seed | 0);
      kind = snapshot.kind ?? undefined;
      lastNow = null;
      notify();
    },
  };
}
