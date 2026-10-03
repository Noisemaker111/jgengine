import { sampleForceField, validateForceField, type ForceFieldConfig } from "../physics/forceVolume";
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

/** Serializable spawn volume in emitter coordinates; cone widens from its base along +Y. */
export interface ParticleSpawnShape {
  kind: "disc" | "sphere" | "cone";
  radius: number;
  height?: number;
  /** Spawn on the outer surface instead of filling the volume. */
  surface?: boolean;
}

/** Bounded particle contact policy; a query adapter can replace the fallback horizontal plane. */
export interface ParticleCollisionConfig {
  planeY?: number;
  response?: "kill" | "bounce";
  restitution?: number;
  maxQueries?: number;
  maxEvents?: number;
}

/** One contact from an injected scene query, in simulation coordinates. */
export interface ParticleCollisionHit {
  position: Vec3;
  normal: Vec3;
}

/** Presentation events never authorize gameplay damage or physical impulses. */
export interface ParticleEvent {
  type: "collision" | "death";
  particleId: number;
  position: Vec3;
  velocity: Vec3;
  normal?: Vec3;
}

/** Optional geometry adapter; queries are capped independently of rendering. */
export interface ParticleSystemOptions {
  collision?: (from: Vec3, to: Vec3) => ParticleCollisionHit | null;
  /** External cosmetic acceleration; return `out` to reuse its allocation. */
  acceleration?: (position: Vec3, velocity: Vec3, out: [number, number, number]) => Vec3;
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
  spawnShape?: ParticleSpawnShape;
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
  /** Seed for deterministic births; retuning it resets future randomness. */
  seed?: string | number;
  /** Shared physical field descriptors, sampled as cosmetic acceleration; at most eight per particle. */
  forces?: readonly ForceFieldConfig[];
  collision?: ParticleCollisionConfig;
  /** Enable bounded death events. Collision events use `collision.maxEvents`. */
  deathEvents?: boolean;
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
  /** Stable birth ids, retained through pool compaction. */
  ids: Float64Array;
  /** Packed velocity and prior integration positions for streak/ribbon outputs. */
  velocities: Float32Array;
  previousPositions: Float32Array;
}

/** Serializable simulation state for save/restore and deterministic replay. */
export interface ParticleSnapshot {
  seed: number;
  accumulator: number;
  count: number;
  data: number[];
  running?: boolean;
  nextId?: number;
  ids?: number[];
  previousPositions?: number[];
  config?: EmitterConfig;
}

/** A live, dt-driven particle simulation. */
export interface ParticleSystem {
  /** Advance the sim by `dt` seconds: emit from `rate`, integrate, and reap dead particles. */
  update(dt: number): void;
  /** Spawn `n` particles immediately (a one-shot puff/explosion), independent of `rate`. */
  emit(n: number): void;
  /** Resume continuous emission without replacing the live pool. */
  start(): void;
  /** Stop spawning while existing particles continue aging. */
  stop(): void;
  /** Consume bounded presentation collision/death events exactly once. */
  drainEvents(): ParticleEvent[];
  /** Live particle count. */
  count(): number;
  /** The packed buffers for rendering (valid until the next `update`/`emit`). */
  buffers(): ParticleBuffers;
  /** Kill all particles and reset the emission accumulator (keeps the seed stream). */
  clear(): void;
  /** Patch tuning in place; `replace` resets omitted fields to defaults while retaining live particles. */
  configure(patch: Partial<EmitterConfig>, replace?: boolean): void;
  subscribe(listener: () => void): () => void;
  snapshot(): ParticleSnapshot;
  restore(snapshot: ParticleSnapshot): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type ResolvedEmitterConfig = Required<Omit<EmitterConfig, "seed" | "forces" | "collision" | "spawnShape">> & Pick<EmitterConfig, "forces" | "collision" | "spawnShape">;

function emitterDefaults(config: EmitterConfig): ResolvedEmitterConfig {
  return {
    max: config.max ?? 512,
    rate: config.rate ?? 0,
    position: config.position ?? [0, 0, 0],
    spawnJitter: config.spawnJitter ?? [0, 0, 0],
    spawnShape: config.spawnShape,
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
    forces: config.forces,
    collision: config.collision,
    deathEvents: config.deathEvents ?? false,
  };
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
 * @capability particle-system deterministic pooled particle emitter with spawn volumes, force fields, bounded collision/death events, live tuning, SoA render buffers, and serializable state
 */
export function createParticleSystem(config: EmitterConfig = {}, options: ParticleSystemOptions = {}): ParticleSystem {
  const cfg = emitterDefaults(config);

  const max = Number.isFinite(cfg.max) ? Math.max(1, Math.min(65536, Math.floor(cfg.max))) : 512;
  // SoA live pool.
  const px = new Float32Array(max);
  const py = new Float32Array(max);
  const pz = new Float32Array(max);
  const vx = new Float32Array(max);
  const vy = new Float32Array(max);
  const vz = new Float32Array(max);
  const age = new Float32Array(max);
  const life = new Float32Array(max);
  const ids = new Float64Array(max);
  const previous = new Float32Array(max * 3);
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
  const outVelocity = new Float32Array(max * 3);
  const renderBuffers: ParticleBuffers = { count: 0, positions: outPos, sizes: outSize, colors: outColor,
    alphas: outAlpha, ids, velocities: outVelocity, previousPositions: previous };

  let live = 0;
  let accumulator = 0;
  let running = true;
  let nextId = 1;
  let events: ParticleEvent[] = [];
  let configuredSeed = config.seed;
  const queryFrom: [number, number, number] = [0, 0, 0];
  const queryTo: [number, number, number] = [0, 0, 0];
  const sampledForce: [number, number, number] = [0, 0, 0];
  const queryVelocity: [number, number, number] = [0, 0, 0];
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
    ids[i] = nextId++;
    const [cr0, cg0, cb0] = unpackColor(cfg.colorStart);
    const [cr1, cg1, cb1] = unpackColor(cfg.colorEnd);

    px[i] = cfg.position[0] + (rand() * 2 - 1) * cfg.spawnJitter[0];
    py[i] = cfg.position[1] + (rand() * 2 - 1) * cfg.spawnJitter[1];
    pz[i] = cfg.position[2] + (rand() * 2 - 1) * cfg.spawnJitter[2];
    const shape = cfg.spawnShape;
    if (shape !== undefined) {
      const theta = rand() * Math.PI * 2;
      if (shape.kind === "sphere") {
        const y = rand() * 2 - 1;
        const radius = shape.radius * (shape.surface ? 1 : Math.cbrt(rand()));
        const horizontal = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
        px[i] += Math.cos(theta) * horizontal; py[i] += y * radius; pz[i] += Math.sin(theta) * horizontal;
      } else {
        const heightFraction = shape.kind === "cone" ? (shape.surface ? Math.sqrt(rand()) : Math.cbrt(rand())) : 1;
        const radius = shape.radius * heightFraction * (shape.surface ? 1 : Math.sqrt(rand()));
        px[i] += Math.cos(theta) * radius; pz[i] += Math.sin(theta) * radius;
        if (shape.kind === "cone") py[i] += (shape.height ?? shape.radius) * heightFraction;
      }
    }
    previous[i * 3] = px[i]; previous[i * 3 + 1] = py[i]; previous[i * 3 + 2] = pz[i];

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
      age[i] = age[last]; life[i] = life[last]; ids[i] = ids[last];
      previous[i * 3] = previous[last * 3];
      previous[i * 3 + 1] = previous[last * 3 + 1];
      previous[i * 3 + 2] = previous[last * 3 + 2];
      sizeS[i] = sizeS[last]; sizeE[i] = sizeE[last];
      r0[i] = r0[last]; g0[i] = g0[last]; b0[i] = b0[last];
      r1[i] = r1[last]; g1[i] = g1[last]; b1[i] = b1[last];
      a0[i] = a0[last]; a1[i] = a1[last];
    }
    live--;
  }

  function bounded(value: number | undefined, fallback: number, cap: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value!))) : fallback;
  }

  function recordEvent(type: ParticleEvent["type"], i: number, normal?: Vec3): void {
    events.push({ type, particleId: ids[i], position: [px[i], py[i], pz[i]], velocity: [vx[i], vy[i], vz[i]],
      ...(normal === undefined ? {} : { normal: [normal[0], normal[1], normal[2]] as Vec3 }) });
  }

  const system: ParticleSystem = {
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const damp = cfg.drag > 0 ? Math.max(0, 1 - cfg.drag * dt) : 1;
      const contact = cfg.collision;
      const queryLimit = Math.min(max, bounded(contact?.maxQueries, 64, 4096));
      const eventLimit = bounded(contact?.maxEvents, 64, 1024);
      let queries = 0;
      for (let i = live - 1; i >= 0; i--) {
        age[i] += dt;
        if (age[i] >= life[i]) {
          if (cfg.deathEvents && events.length < eventLimit) recordEvent("death", i);
          swapRemove(i);
          continue;
        }
        previous[i * 3] = px[i]; previous[i * 3 + 1] = py[i]; previous[i * 3 + 2] = pz[i];
        let ax = cfg.gravity[0], ay = cfg.gravity[1], az = cfg.gravity[2];
        queryFrom[0] = px[i]; queryFrom[1] = py[i]; queryFrom[2] = pz[i];
        for (let f = 0; f < Math.min(8, cfg.forces?.length ?? 0); f++) {
          const force = sampleForceField(cfg.forces![f]!, queryFrom, 0xffffffff, sampledForce);
          ax += force[0]; ay += force[1]; az += force[2];
        }
        if (options.acceleration !== undefined) {
          queryVelocity[0] = vx[i]; queryVelocity[1] = vy[i]; queryVelocity[2] = vz[i];
          const force = options.acceleration(queryFrom, queryVelocity, sampledForce);
          ax += force[0]; ay += force[1]; az += force[2];
        }
        vx[i] = (vx[i] + ax * dt) * damp;
        vy[i] = (vy[i] + ay * dt) * damp;
        vz[i] = (vz[i] + az * dt) * damp;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        if (contact === undefined) continue;
        queryTo[0] = px[i]; queryTo[1] = py[i]; queryTo[2] = pz[i];
        let hit: ParticleCollisionHit | null = null;
        if (options.collision !== undefined && queries < queryLimit) {
          queries++;
          hit = options.collision(queryFrom, queryTo);
        }
        if (hit === null && contact.planeY !== undefined && queryFrom[1] >= contact.planeY && py[i] <= contact.planeY && vy[i] < 0) {
          const t = (queryFrom[1] - contact.planeY) / (queryFrom[1] - py[i]);
          hit = { position: [queryFrom[0] + (px[i] - queryFrom[0]) * t, contact.planeY, queryFrom[2] + (pz[i] - queryFrom[2]) * t], normal: [0, 1, 0] };
        }
        if (hit === null) continue;
        px[i] = hit.position[0]; py[i] = hit.position[1]; pz[i] = hit.position[2];
        if (events.length < eventLimit) recordEvent("collision", i, hit.normal);
        if (contact.response !== "bounce") { swapRemove(i); continue; }
        const length = Math.hypot(...hit.normal);
        if (length === 0) continue;
        const nx = hit.normal[0] / length, ny = hit.normal[1] / length, nz = hit.normal[2] / length;
        const dot = vx[i] * nx + vy[i] * ny + vz[i] * nz;
        if (dot < 0) {
          const impulse = (1 + clamp01(contact.restitution ?? 0.5)) * dot;
          vx[i] -= impulse * nx; vy[i] -= impulse * ny; vz[i] -= impulse * nz;
        }
      }
      if (running && Number.isFinite(cfg.rate) && cfg.rate > 0) {
        accumulator = Math.min(Number.MAX_SAFE_INTEGER, accumulator + cfg.rate * dt);
        const wanted = Math.floor(accumulator);
        accumulator -= wanted;
        for (let k = 0, n = Math.min(wanted, max - live); k < n; k++) spawnOne();
      }
      notify();
    },
    emit(n) {
      const wanted = Number.isFinite(n) ? Math.min(max - live, Math.max(0, Math.floor(n))) : 0;
      for (let k = 0; k < wanted; k++) spawnOne();
      notify();
    },
    start() { if (!running) { running = true; notify(); } },
    stop() { if (running) { running = false; notify(); } },
    drainEvents() { const drained = events; events = []; return drained; },
    count() {
      return live;
    },
    buffers() {
      for (let i = 0; i < live; i++) {
        const t = clamp01(age[i] / life[i]);
        outVelocity[i * 3] = vx[i]; outVelocity[i * 3 + 1] = vy[i]; outVelocity[i * 3 + 2] = vz[i];
        outPos[i * 3] = px[i];
        outPos[i * 3 + 1] = py[i];
        outPos[i * 3 + 2] = pz[i];
        outSize[i] = sizeS[i] + (sizeE[i] - sizeS[i]) * t;
        outColor[i * 3] = r0[i] + (r1[i] - r0[i]) * t;
        outColor[i * 3 + 1] = g0[i] + (g1[i] - g0[i]) * t;
        outColor[i * 3 + 2] = b0[i] + (b1[i] - b0[i]) * t;
        outAlpha[i] = a0[i] + (a1[i] - a0[i]) * t;
      }
      renderBuffers.count = live;
      return renderBuffers;
    },
    clear() {
      live = 0;
      accumulator = 0;
      events = [];
      notify();
    },
    configure(patch, replace = false) {
      Object.assign(cfg, replace ? emitterDefaults(patch) : patch);
      if (patch.seed !== undefined && patch.seed !== configuredSeed) {
        configuredSeed = patch.seed;
        seed = randomSeedFrom(typeof patch.seed === "number" ? patch.seed : hashString(patch.seed));
      }
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
      return { seed: seed as number, accumulator, count: live, data, running, nextId,
        ids: Array.from(ids.subarray(0, live)), previousPositions: Array.from(previous.subarray(0, live * 3)), config: structuredClone({ ...cfg, seed: configuredSeed }) };
    },
    restore(snapshot) {
      if (snapshot.config !== undefined) { Object.assign(cfg, structuredClone(snapshot.config)); configuredSeed = snapshot.config.seed; }
      seed = randomSeedFrom(snapshot.seed);
      accumulator = snapshot.accumulator;
      live = Math.min(max, Math.max(0, Math.floor(snapshot.count)), Math.floor(snapshot.data.length / 18));
      running = snapshot.running ?? true;
      nextId = snapshot.nextId ?? live + 1;
      events = [];
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
        ids[i] = snapshot.ids?.[i] ?? i + 1;
        previous[i * 3] = snapshot.previousPositions?.[i * 3] ?? px[i];
        previous[i * 3 + 1] = snapshot.previousPositions?.[i * 3 + 1] ?? py[i];
        previous[i * 3 + 2] = snapshot.previousPositions?.[i * 3 + 2] ?? pz[i];
      }
      notify();
    },
  };

  return system;
}

/**
 * Validate the serializable spawn/update descriptor before authoring or loading it.
 * @capability particle-emitter-validation validate finite spawn volumes, force fields, lifetimes, appearance curves, and bounded particle collision policies
 */
export function validateEmitterConfig(value: unknown): string[] {
  const errors: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return ["emitter must be an object"];
  const config = value as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const number = (name: string, min: number, max = Infinity, integer = false) => {
    const v = config[name];
    if (v !== undefined && (!finite(v) || v < min || v > max || (integer && !Number.isInteger(v)))) errors.push(`${name} must be ${integer ? "an integer" : "finite"} in [${min}, ${max}]`);
  };
  const vector = (name: string, nonnegative = false) => {
    const v = config[name];
    if (v !== undefined && (!Array.isArray(v) || v.length !== 3 || v.some((n) => !finite(n) || (nonnegative && n < 0)))) errors.push(`${name} must contain three finite${nonnegative ? " nonnegative" : ""} numbers`);
  };
  number("max", 1, 65536, true); number("rate", 0); number("spread", 0, Math.PI); number("drag", 0, 1);
  number("colorStart", 0, 0xffffff, true); number("colorEnd", 0, 0xffffff, true);
  vector("position"); vector("direction"); vector("gravity"); vector("spawnJitter", true);
  for (const [name, lower] of [["lifetime", Number.MIN_VALUE], ["speed", 0]] as const) {
    const v = config[name];
    if (v === undefined) continue;
    if (v === null || typeof v !== "object") { errors.push(`${name} must be a min/max range`); continue; }
    const range = v as Record<string, unknown>;
    if (!finite(range.min) || !finite(range.max) || range.min < lower || range.max < range.min) errors.push(`${name} must have finite ordered min/max values ${name === "lifetime" ? "above zero" : "at least zero"}`);
  }
  for (const name of ["size", "alpha"]) {
    const v = config[name];
    if (v === undefined) continue;
    if (v === null || typeof v !== "object") { errors.push(`${name} must be a start/end curve`); continue; }
    const curve = v as Record<string, unknown>;
    if (!finite(curve.start) || !finite(curve.end) || curve.start < 0 || curve.end < 0 || (name === "alpha" && (curve.start > 1 || curve.end > 1))) errors.push(`${name} must have finite nonnegative start/end values${name === "alpha" ? " at most one" : ""}`);
  }
  if (config.spawnShape !== undefined) {
    const shape = config.spawnShape as Record<string, unknown>;
    if (shape === null || typeof shape !== "object" || Array.isArray(shape)) errors.push("spawnShape must be a volume descriptor");
    else {
      if (shape.kind !== "disc" && shape.kind !== "sphere" && shape.kind !== "cone") errors.push("spawnShape.kind must be disc, sphere, or cone");
      if (!finite(shape.radius) || shape.radius <= 0) errors.push("spawnShape.radius must be finite and positive");
      if (shape.height !== undefined && (!finite(shape.height) || shape.height <= 0)) errors.push("spawnShape.height must be finite and positive");
      if (shape.surface !== undefined && typeof shape.surface !== "boolean") errors.push("spawnShape.surface must be boolean");
    }
  }
  if (config.seed !== undefined && typeof config.seed !== "string" && !finite(config.seed)) errors.push("seed must be a string or finite number");
  if (config.deathEvents !== undefined && typeof config.deathEvents !== "boolean") errors.push("deathEvents must be boolean");
  if (config.forces !== undefined) {
    if (!Array.isArray(config.forces) || config.forces.length > 8) errors.push("forces must be an array of at most eight fields");
    else config.forces.forEach((value, i) => {
      try { validateForceField(value as ForceFieldConfig); }
      catch (error) { errors.push(`forces[${i}]: ${error instanceof Error ? error.message : String(error)}`); }
    });
  }

  if (config.collision !== undefined) {
    const contact = config.collision as Record<string, unknown>;
    if (contact === null || typeof contact !== "object" || Array.isArray(contact)) errors.push("collision must be a contact policy");
    else {
      if (contact.planeY !== undefined && !finite(contact.planeY)) errors.push("collision.planeY must be finite");
      if (contact.response !== undefined && contact.response !== "kill" && contact.response !== "bounce") errors.push("collision.response must be kill or bounce");
      if (contact.restitution !== undefined && (!finite(contact.restitution) || contact.restitution < 0 || contact.restitution > 1)) errors.push("collision.restitution must be in [0, 1]");
      for (const [name, cap] of [["maxQueries", 4096], ["maxEvents", 1024]] as const) if (contact[name] !== undefined && (!finite(contact[name]) || !Number.isInteger(contact[name]) || contact[name] < 0 || contact[name] > cap)) errors.push(`collision.${name} must be an integer in [0, ${cap}]`);
    }
  }
  return errors;
}
