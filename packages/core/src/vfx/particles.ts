import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

/** A 3D vector `[x, y, z]`. */
export type Vec3 = readonly [number, number, number];

/** A `[min, max]` range a spawned particle draws uniformly from. */
export interface Range {
  min: number;
  max: number;
}

/** A per-life start→end curve (linear interpolation from birth to death). */
export interface Curve {
  start: number;
  end: number;
}

/**
 * A particle emitter: how particles spawn and how each one evolves over its life.
 * Every field is data — no functions — so an emitter is fully serializable and an
 * editor/tunable can drive it. Genre-agnostic: smoke, sparks, rain, magic, dust.
 */
export interface EmitterConfig {
  /** Hard cap on live particles; the pool never grows past this. Default 512. */
  max?: number;
  /** Continuous emission rate in particles/second. Default 0 (burst-only). */
  rate?: number;
  /** Spawn origin. Default `[0, 0, 0]`. */
  position?: Vec3;
  /** Half-extents of a box the spawn point is jittered within. Default `[0, 0, 0]`. */
  spawnJitter?: Vec3;
  /** Particle lifetime in seconds. Default `{ min: 1, max: 1 }`. */
  lifetime?: Range;
  /** Initial speed along the emit direction, in units/second. Default `{ min: 1, max: 1 }`. */
  speed?: Range;
  /** Base emit direction (need not be normalized). Default `[0, 1, 0]` (up). */
  direction?: Vec3;
  /** Cone half-angle in radians around `direction`; `Math.PI` emits in all directions. Default 0. */
  spread?: number;
  /** Constant acceleration (e.g. gravity `[0, -9.8, 0]`). Default `[0, 0, 0]`. */
  gravity?: Vec3;
  /** Linear velocity damping per second, `0` (none) to `1` (stop instantly). Default 0. */
  drag?: number;
  /** Particle radius over life. Default `{ start: 1, end: 1 }`. */
  size?: Curve;
  /** `0xRRGGBB` color at birth. Default `0xffffff`. */
  colorStart?: number;
  /** `0xRRGGBB` color at death. Default = `colorStart`. */
  colorEnd?: number;
  /** Opacity over life, each `0..1`. Default `{ start: 1, end: 0 }` (fade out). */
  alpha?: Curve;
  /** Injected clock — unused by the sim (it is dt-driven) but reserved; determinism comes from `seed`. */
  seed?: string | number;
}

/**
 * Read-only packed buffers of the live particles, laid out for a renderer to
 * upload directly (Structure-of-Arrays, no per-particle objects). Only the first
 * `count` entries are live; the arrays themselves are reused every frame.
 */
export interface ParticleBuffers {
  count: number;
  /** `count * 3` floats: x, y, z per particle. */
  positions: Float32Array;
  /** `count` floats: current radius per particle. */
  sizes: Float32Array;
  /** `count * 3` floats: r, g, b in `0..1` per particle. */
  colors: Float32Array;
  /** `count` floats: opacity `0..1` per particle. */
  alphas: Float32Array;
}

/** Serializable simulation state for save/restore and deterministic replay. */
export interface ParticleSnapshot {
  seed: number;
  accumulator: number;
  count: number;
  data: number[];
}

/** A live, dt-driven particle simulation. */
export interface ParticleSystem {
  /** Advance the sim by `dt` seconds: emit from `rate`, integrate, and reap dead particles. */
  update(dt: number): void;
  /** Spawn `n` particles immediately (a one-shot puff/explosion), independent of `rate`. */
  emit(n: number): void;
  /** Live particle count. */
  count(): number;
  /** The packed buffers for rendering (valid until the next `update`/`emit`). */
  buffers(): ParticleBuffers;
  /** Kill all particles and reset the emission accumulator (keeps the seed stream). */
  clear(): void;
  /** Patch the emitter config in place (e.g. move the origin, change the rate). */
  configure(patch: Partial<EmitterConfig>): void;
  subscribe(listener: () => void): () => void;
  snapshot(): ParticleSnapshot;
  restore(snapshot: ParticleSnapshot): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A generic, allocation-aware particle system: one emitter, a fixed pool, and
 * Structure-of-Arrays buffers a renderer uploads straight to the GPU. It is
 * dt-driven (call `update(dt)` each frame) and deterministic — all randomness
 * flows from an injected `seed`, so the same seed and dt sequence reproduce the
 * same frames, and `snapshot`/`restore` round-trips the live pool. Nothing here
 * is combat- or genre-specific: configure it for smoke, sparks, rain, dust,
 * embers, magic, or confetti. Travel/gameplay stays elsewhere; this owns only
 * the spawn-integrate-fade lifecycle.
 *
 * @capability particle-system deterministic pooled particle emitter with SoA render buffers, burst/continuous emission, gravity/drag, size/color/alpha-over-life, and serializable state
 */
export function createParticleSystem(config: EmitterConfig = {}): ParticleSystem {
  const cfg: Required<Omit<EmitterConfig, "seed">> = {
    max: config.max ?? 512,
    rate: config.rate ?? 0,
    position: config.position ?? [0, 0, 0],
    spawnJitter: config.spawnJitter ?? [0, 0, 0],
    lifetime: config.lifetime ?? { min: 1, max: 1 },
    speed: config.speed ?? { min: 1, max: 1 },
    direction: config.direction ?? [0, 1, 0],
    spread: config.spread ?? 0,
    gravity: config.gravity ?? [0, 0, 0],
    drag: config.drag ?? 0,
    size: config.size ?? { start: 1, end: 1 },
    colorStart: config.colorStart ?? 0xffffff,
    colorEnd: config.colorEnd ?? config.colorStart ?? 0xffffff,
    alpha: config.alpha ?? { start: 1, end: 0 },
  };

  const max = Math.max(1, Math.floor(cfg.max));
  // SoA live pool.
  const px = new Float32Array(max);
  const py = new Float32Array(max);
  const pz = new Float32Array(max);
  const vx = new Float32Array(max);
  const vy = new Float32Array(max);
  const vz = new Float32Array(max);
  const age = new Float32Array(max);
  const life = new Float32Array(max);
  // Per-particle baked endpoints (so mid-flight config changes don't recolor existing particles).
  const sizeS = new Float32Array(max);
  const sizeE = new Float32Array(max);
  const r0 = new Float32Array(max);
  const g0 = new Float32Array(max);
  const b0 = new Float32Array(max);
  const r1 = new Float32Array(max);
  const g1 = new Float32Array(max);
  const b1 = new Float32Array(max);
  const a0 = new Float32Array(max);
  const a1 = new Float32Array(max);

  // Render buffers (rebuilt each frame from the live pool).
  const outPos = new Float32Array(max * 3);
  const outSize = new Float32Array(max);
  const outColor = new Float32Array(max * 3);
  const outAlpha = new Float32Array(max);

  let live = 0;
  let accumulator = 0;
  let seed: RandomSeed = randomSeedFrom(
    typeof config.seed === "number" ? config.seed : hashString(String(config.seed ?? "particles")),
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
  function range(r: Range): number {
    return r.min + (r.max - r.min) * rand();
  }
  function unpackColor(rgb: number): [number, number, number] {
    return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255];
  }

  function spawnOne(): void {
    if (live >= max) return;
    const i = live++;
    const [cr0, cg0, cb0] = unpackColor(cfg.colorStart);
    const [cr1, cg1, cb1] = unpackColor(cfg.colorEnd);

    px[i] = cfg.position[0] + (rand() * 2 - 1) * cfg.spawnJitter[0];
    py[i] = cfg.position[1] + (rand() * 2 - 1) * cfg.spawnJitter[1];
    pz[i] = cfg.position[2] + (rand() * 2 - 1) * cfg.spawnJitter[2];

    // Direction: base dir perturbed within a cone of half-angle `spread`.
    let dx = cfg.direction[0];
    let dy = cfg.direction[1];
    let dz = cfg.direction[2];
    const dlen = Math.hypot(dx, dy, dz) || 1;
    dx /= dlen;
    dy /= dlen;
    dz /= dlen;
    if (cfg.spread > 0) {
      // Sample a random unit vector, then blend toward the base direction by (1 - spread/π).
      const theta = rand() * Math.PI * 2;
      const z = rand() * 2 - 1;
      const rxy = Math.sqrt(Math.max(0, 1 - z * z));
      const sx = rxy * Math.cos(theta);
      const sy = rxy * Math.sin(theta);
      const sz = z;
      const t = clamp01(cfg.spread / Math.PI);
      dx = dx * (1 - t) + sx * t;
      dy = dy * (1 - t) + sy * t;
      dz = dz * (1 - t) + sz * t;
      const n = Math.hypot(dx, dy, dz) || 1;
      dx /= n;
      dy /= n;
      dz /= n;
    }
    const sp = range(cfg.speed);
    vx[i] = dx * sp;
    vy[i] = dy * sp;
    vz[i] = dz * sp;

    age[i] = 0;
    life[i] = Math.max(0.0001, range(cfg.lifetime));
    sizeS[i] = cfg.size.start;
    sizeE[i] = cfg.size.end;
    r0[i] = cr0;
    g0[i] = cg0;
    b0[i] = cb0;
    r1[i] = cr1;
    g1[i] = cg1;
    b1[i] = cb1;
    a0[i] = cfg.alpha.start;
    a1[i] = cfg.alpha.end;
  }

  function swapRemove(i: number): void {
    const last = live - 1;
    if (i !== last) {
      px[i] = px[last]; py[i] = py[last]; pz[i] = pz[last];
      vx[i] = vx[last]; vy[i] = vy[last]; vz[i] = vz[last];
      age[i] = age[last]; life[i] = life[last];
      sizeS[i] = sizeS[last]; sizeE[i] = sizeE[last];
      r0[i] = r0[last]; g0[i] = g0[last]; b0[i] = b0[last];
      r1[i] = r1[last]; g1[i] = g1[last]; b1[i] = b1[last];
      a0[i] = a0[last]; a1[i] = a1[last];
    }
    live--;
  }

  const system: ParticleSystem = {
    update(dt) {
      if (dt <= 0) return;
      const damp = cfg.drag > 0 ? Math.max(0, 1 - cfg.drag * dt) : 1;
      // Integrate + reap (iterate backwards because we swap-remove).
      for (let i = live - 1; i >= 0; i--) {
        age[i] += dt;
        if (age[i] >= life[i]) {
          swapRemove(i);
          continue;
        }
        vx[i] = (vx[i] + cfg.gravity[0] * dt) * damp;
        vy[i] = (vy[i] + cfg.gravity[1] * dt) * damp;
        vz[i] = (vz[i] + cfg.gravity[2] * dt) * damp;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
      }
      // Continuous emission.
      if (cfg.rate > 0) {
        accumulator += cfg.rate * dt;
        while (accumulator >= 1) {
          accumulator -= 1;
          spawnOne();
        }
      }
      notify();
    },
    emit(n) {
      const wanted = Math.max(0, Math.floor(n));
      for (let k = 0; k < wanted; k++) spawnOne();
      notify();
    },
    count() {
      return live;
    },
    buffers() {
      for (let i = 0; i < live; i++) {
        const t = clamp01(age[i] / life[i]);
        outPos[i * 3] = px[i];
        outPos[i * 3 + 1] = py[i];
        outPos[i * 3 + 2] = pz[i];
        outSize[i] = sizeS[i] + (sizeE[i] - sizeS[i]) * t;
        outColor[i * 3] = r0[i] + (r1[i] - r0[i]) * t;
        outColor[i * 3 + 1] = g0[i] + (g1[i] - g0[i]) * t;
        outColor[i * 3 + 2] = b0[i] + (b1[i] - b0[i]) * t;
        outAlpha[i] = a0[i] + (a1[i] - a0[i]) * t;
      }
      return { count: live, positions: outPos, sizes: outSize, colors: outColor, alphas: outAlpha };
    },
    clear() {
      live = 0;
      accumulator = 0;
      notify();
    },
    configure(patch) {
      Object.assign(cfg, patch);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      const data: number[] = [];
      for (let i = 0; i < live; i++) {
        data.push(
          px[i], py[i], pz[i], vx[i], vy[i], vz[i], age[i], life[i],
          sizeS[i], sizeE[i], r0[i], g0[i], b0[i], r1[i], g1[i], b1[i], a0[i], a1[i],
        );
      }
      return { seed: seed as number, accumulator, count: live, data };
    },
    restore(snapshot) {
      seed = randomSeedFrom(snapshot.seed);
      accumulator = snapshot.accumulator;
      live = Math.min(max, snapshot.count);
      const stride = 18;
      for (let i = 0; i < live; i++) {
        const o = i * stride;
        px[i] = snapshot.data[o]!; py[i] = snapshot.data[o + 1]!; pz[i] = snapshot.data[o + 2]!;
        vx[i] = snapshot.data[o + 3]!; vy[i] = snapshot.data[o + 4]!; vz[i] = snapshot.data[o + 5]!;
        age[i] = snapshot.data[o + 6]!; life[i] = snapshot.data[o + 7]!;
        sizeS[i] = snapshot.data[o + 8]!; sizeE[i] = snapshot.data[o + 9]!;
        r0[i] = snapshot.data[o + 10]!; g0[i] = snapshot.data[o + 11]!; b0[i] = snapshot.data[o + 12]!;
        r1[i] = snapshot.data[o + 13]!; g1[i] = snapshot.data[o + 14]!; b1[i] = snapshot.data[o + 15]!;
        a0[i] = snapshot.data[o + 16]!; a1[i] = snapshot.data[o + 17]!;
      }
      notify();
    },
  };

  return system;
}
