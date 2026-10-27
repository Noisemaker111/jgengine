import type { Vec3 } from "../world/geometry";
import { sampleForceField, validateForceField, type ForceFieldConfig } from "../physics/forceVolume";
import { hashString, randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";


/** A `[min, max]` range a spawned particle draws uniformly from. */
export interface Range {
  min: number;
  max: number;
}

/** A per-life start→end curve (linear interpolation from birth to death). */
export interface ParticleCurve {
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
  size?: ParticleCurve;
  /** `0xRRGGBB` color at birth. Default `0xffffff`. */
  colorStart?: number;
  /** `0xRRGGBB` color at death. Default = `colorStart`. */
  colorEnd?: number;
  /** Opacity over life, each `0..1`. Default `{ start: 1, end: 0 }` (fade out). */
  alpha?: ParticleCurve;
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

type ResolvedEmitterConfig = Required<Omit<EmitterConfig, "seed" | "forces" | "collision" | "spawnShape">> & {
  forces: EmitterConfig["forces"];
  collision: EmitterConfig["collision"];
  spawnShape: EmitterConfig["spawnShape"];
};

/** The serializable config a resolved one stands for: unset optional fields stay absent. */
function emitterConfigOf(cfg: ResolvedEmitterConfig, seed: EmitterConfig["seed"]): EmitterConfig {
  const { forces, collision, spawnShape, ...rest } = cfg;
  return {
    ...rest,
    ...(forces === undefined ? {} : { forces }),
    ...(collision === undefined ? {} : { collision }),
    ...(spawnShape === undefined ? {} : { spawnShape }),
    ...(seed === undefined ? {} : { seed }),
  };
}

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
  // A fixed pool of reusable records: the first `live` are alive. Retiring one swaps it past the live
  // range, so the pool never allocates after creation.
  const pool: Particle[] = Array.from({ length: max }, blankParticle);

  // Render buffers (rebuilt each frame from the live pool).
  const outPos = new Float32Array(max * 3);
  const outSize = new Float32Array(max);
  const outColor = new Float32Array(max * 3);
  const outAlpha = new Float32Array(max);
  const outVelocity = new Float32Array(max * 3);
  const outIds = new Float64Array(max);
  const outPrevious = new Float32Array(max * 3);
  const renderBuffers: ParticleBuffers = { count: 0, positions: outPos, sizes: outSize, colors: outColor,
    alphas: outAlpha, ids: outIds, velocities: outVelocity, previousPositions: outPrevious };

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
    const p = pool[live];
    if (p === undefined) return;
    live++;
    p.id = nextId++;
    const [cr0, cg0, cb0] = unpackColor(cfg.colorStart);
    const [cr1, cg1, cb1] = unpackColor(cfg.colorEnd);

    p.x = cfg.position[0] + (rand() * 2 - 1) * cfg.spawnJitter[0];
    p.y = cfg.position[1] + (rand() * 2 - 1) * cfg.spawnJitter[1];
    p.z = cfg.position[2] + (rand() * 2 - 1) * cfg.spawnJitter[2];
    const shape = cfg.spawnShape;
    if (shape !== undefined) {
      const theta = rand() * Math.PI * 2;
      if (shape.kind === "sphere") {
        const y = rand() * 2 - 1;
        const radius = shape.radius * (shape.surface ? 1 : Math.cbrt(rand()));
        const horizontal = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
        p.x += Math.cos(theta) * horizontal; p.y += y * radius; p.z += Math.sin(theta) * horizontal;
      } else {
        const heightFraction = shape.kind === "cone" ? (shape.surface ? Math.sqrt(rand()) : Math.cbrt(rand())) : 1;
        const radius = shape.radius * heightFraction * (shape.surface ? 1 : Math.sqrt(rand()));
        p.x += Math.cos(theta) * radius; p.z += Math.sin(theta) * radius;
        if (shape.kind === "cone") p.y += (shape.height ?? shape.radius) * heightFraction;
      }
    }
    p.px = p.x; p.py = p.y; p.pz = p.z;

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
    p.vx = dx * sp;
    p.vy = dy * sp;
    p.vz = dz * sp;

    p.age = 0;
    p.life = Math.max(0.0001, range(cfg.lifetime));
    p.sizeStart = cfg.size.start;
    p.sizeEnd = cfg.size.end;
    p.r0 = cr0;
    p.g0 = cg0;
    p.b0 = cb0;
    p.r1 = cr1;
    p.g1 = cg1;
    p.b1 = cb1;
    p.a0 = cfg.alpha.start;
    p.a1 = cfg.alpha.end;
  }

  /** Retire the live record at `i` by swapping it with the last live one. */
  function swapRemove(i: number): void {
    const last = live - 1;
    const retired = pool[i];
    const moved = pool[last];
    if (i !== last && retired !== undefined && moved !== undefined) {
      pool[i] = moved;
      pool[last] = retired;
    }
    live--;
  }

  function bounded(value: number | undefined, fallback: number, cap: number): number {
    return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value))) : fallback;
  }

  function recordEvent(type: ParticleEvent["type"], p: Particle, normal?: Vec3): void {
    events.push({ type, particleId: p.id, position: [p.x, p.y, p.z], velocity: [p.vx, p.vy, p.vz],
      ...(normal === undefined ? {} : { normal: [normal[0], normal[1], normal[2]] satisfies Vec3 }) });
  }

  const system: ParticleSystem = {
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const damp = cfg.drag > 0 ? Math.max(0, 1 - cfg.drag * dt) : 1;
      const contact = cfg.collision;
      const forces = (cfg.forces ?? []).slice(0, 8);
      const queryLimit = Math.min(max, bounded(contact?.maxQueries, 64, 4096));
      const eventLimit = bounded(contact?.maxEvents, 64, 1024);
      let queries = 0;
      for (let i = live - 1; i >= 0; i--) {
        const p = pool[i];
        if (p === undefined) continue;
        p.age += dt;
        if (p.age >= p.life) {
          if (cfg.deathEvents && events.length < eventLimit) recordEvent("death", p);
          swapRemove(i);
          continue;
        }
        p.px = p.x; p.py = p.y; p.pz = p.z;
        let ax = cfg.gravity[0], ay = cfg.gravity[1], az = cfg.gravity[2];
        queryFrom[0] = p.x; queryFrom[1] = p.y; queryFrom[2] = p.z;
        for (const field of forces) {
          const force = sampleForceField(field, queryFrom, 0xffffffff, sampledForce);
          ax += force[0]; ay += force[1]; az += force[2];
        }
        if (options.acceleration !== undefined) {
          queryVelocity[0] = p.vx; queryVelocity[1] = p.vy; queryVelocity[2] = p.vz;
          const force = options.acceleration(queryFrom, queryVelocity, sampledForce);
          ax += force[0]; ay += force[1]; az += force[2];
        }
        p.vx = (p.vx + ax * dt) * damp;
        p.vy = (p.vy + ay * dt) * damp;
        p.vz = (p.vz + az * dt) * damp;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (contact === undefined) continue;
        queryTo[0] = p.x; queryTo[1] = p.y; queryTo[2] = p.z;
        let hit: ParticleCollisionHit | null = null;
        if (options.collision !== undefined && queries < queryLimit) {
          queries++;
          hit = options.collision(queryFrom, queryTo);
        }
        if (hit === null && contact.planeY !== undefined && queryFrom[1] >= contact.planeY && p.y <= contact.planeY && p.vy < 0) {
          const t = (queryFrom[1] - contact.planeY) / (queryFrom[1] - p.y);
          hit = { position: [queryFrom[0] + (p.x - queryFrom[0]) * t, contact.planeY, queryFrom[2] + (p.z - queryFrom[2]) * t], normal: [0, 1, 0] };
        }
        if (hit === null) continue;
        p.x = hit.position[0]; p.y = hit.position[1]; p.z = hit.position[2];
        if (events.length < eventLimit) recordEvent("collision", p, hit.normal);
        if (contact.response !== "bounce") { swapRemove(i); continue; }
        const length = Math.hypot(...hit.normal);
        if (length === 0) continue;
        const nx = hit.normal[0] / length, ny = hit.normal[1] / length, nz = hit.normal[2] / length;
        const dot = p.vx * nx + p.vy * ny + p.vz * nz;
        if (dot < 0) {
          const impulse = (1 + clamp01(contact.restitution ?? 0.5)) * dot;
          p.vx -= impulse * nx; p.vy -= impulse * ny; p.vz -= impulse * nz;
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
        const p = pool[i];
        if (p === undefined) break;
        const t = clamp01(p.age / p.life);
        outVelocity[i * 3] = p.vx; outVelocity[i * 3 + 1] = p.vy; outVelocity[i * 3 + 2] = p.vz;
        outPos[i * 3] = p.x;
        outPos[i * 3 + 1] = p.y;
        outPos[i * 3 + 2] = p.z;
        outPrevious[i * 3] = p.px;
        outPrevious[i * 3 + 1] = p.py;
        outPrevious[i * 3 + 2] = p.pz;
        outIds[i] = p.id;
        outSize[i] = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
        outColor[i * 3] = p.r0 + (p.r1 - p.r0) * t;
        outColor[i * 3 + 1] = p.g0 + (p.g1 - p.g0) * t;
        outColor[i * 3 + 2] = p.b0 + (p.b1 - p.b0) * t;
        outAlpha[i] = p.a0 + (p.a1 - p.a0) * t;
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
      const living = pool.slice(0, live);
      const data = living.flatMap((p) => [
        p.x, p.y, p.z, p.vx, p.vy, p.vz, p.age, p.life,
        p.sizeStart, p.sizeEnd, p.r0, p.g0, p.b0, p.r1, p.g1, p.b1, p.a0, p.a1,
      ]);
      return { seed, accumulator, count: live, data, running, nextId,
        ids: living.map((p) => p.id), previousPositions: living.flatMap((p) => [p.px, p.py, p.pz]),
        config: structuredClone(emitterConfigOf(cfg, configuredSeed)) };
    },
    restore(snapshot) {
      if (snapshot.config !== undefined) { Object.assign(cfg, structuredClone(snapshot.config)); configuredSeed = snapshot.config.seed; }
      seed = randomSeedFrom(snapshot.seed);
      accumulator = snapshot.accumulator;
      live = Math.min(max, Math.max(0, Math.floor(snapshot.count)), Math.floor(snapshot.data.length / SNAPSHOT_STRIDE));
      running = snapshot.running ?? true;
      nextId = snapshot.nextId ?? live + 1;
      events = [];
      for (let i = 0; i < live; i++) {
        const p = pool[i];
        if (p === undefined) break;
        const [x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, age = 0, life = 1, sizeStart = 1, sizeEnd = 1,
          r0 = 1, g0 = 1, b0 = 1, r1 = 1, g1 = 1, b1 = 1, a0 = 1, a1 = 0] = snapshot.data.slice(i * SNAPSHOT_STRIDE, (i + 1) * SNAPSHOT_STRIDE);
        Object.assign(p, { x, y, z, vx, vy, vz, age, life, sizeStart, sizeEnd, r0, g0, b0, r1, g1, b1, a0, a1 });
        p.id = snapshot.ids?.[i] ?? i + 1;
        p.px = snapshot.previousPositions?.[i * 3] ?? x;
        p.py = snapshot.previousPositions?.[i * 3 + 1] ?? y;
        p.pz = snapshot.previousPositions?.[i * 3 + 2] ?? z;
      }
      notify();
    },
  };

  return system;
}

/** Numbers per particle in {@link ParticleSnapshot.data}. */
const SNAPSHOT_STRIDE = 18;

/** One pooled particle: position, velocity, the position before the last step, and its baked life curves. */
interface Particle {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  px: number; py: number; pz: number;
  age: number; life: number;
  sizeStart: number; sizeEnd: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  a0: number; a1: number;
}

function blankParticle(): Particle {
  return { id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, age: 0, life: 1,
    sizeStart: 1, sizeEnd: 1, r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, a0: 1, a1: 0 };
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
    if (!finite(range["min"]) || !finite(range["max"]) || range["min"] < lower || range["max"] < range["min"]) errors.push(`${name} must have finite ordered min/max values ${name === "lifetime" ? "above zero" : "at least zero"}`);
  }
  for (const name of ["size", "alpha"]) {
    const v = config[name];
    if (v === undefined) continue;
    if (v === null || typeof v !== "object") { errors.push(`${name} must be a start/end curve`); continue; }
    const curve = v as Record<string, unknown>;
    if (!finite(curve["start"]) || !finite(curve["end"]) || curve["start"] < 0 || curve["end"] < 0 || (name === "alpha" && (curve["start"] > 1 || curve["end"] > 1))) errors.push(`${name} must have finite nonnegative start/end values${name === "alpha" ? " at most one" : ""}`);
  }
  if (config["spawnShape"] !== undefined) {
    const shape = config["spawnShape"] as Record<string, unknown>;
    if (shape === null || typeof shape !== "object" || Array.isArray(shape)) errors.push("spawnShape must be a volume descriptor");
    else {
      if (shape["kind"] !== "disc" && shape["kind"] !== "sphere" && shape["kind"] !== "cone") errors.push("spawnShape.kind must be disc, sphere, or cone");
      if (!finite(shape["radius"]) || shape["radius"] <= 0) errors.push("spawnShape.radius must be finite and positive");
      if (shape["height"] !== undefined && (!finite(shape["height"]) || shape["height"] <= 0)) errors.push("spawnShape.height must be finite and positive");
      if (shape["surface"] !== undefined && typeof shape["surface"] !== "boolean") errors.push("spawnShape.surface must be boolean");
    }
  }
  if (config["seed"] !== undefined && typeof config["seed"] !== "string" && !finite(config["seed"])) errors.push("seed must be a string or finite number");
  if (config["deathEvents"] !== undefined && typeof config["deathEvents"] !== "boolean") errors.push("deathEvents must be boolean");
  if (config["forces"] !== undefined) {
    if (!Array.isArray(config["forces"]) || config["forces"].length > 8) errors.push("forces must be an array of at most eight fields");
    else config["forces"].forEach((value, i) => {
      try { validateForceField(value as ForceFieldConfig); }
      catch (error) { errors.push(`forces[${i}]: ${error instanceof Error ? error.message : String(error)}`); }
    });
  }

  if (config["collision"] !== undefined) {
    const contact = config["collision"] as Record<string, unknown>;
    if (contact === null || typeof contact !== "object" || Array.isArray(contact)) errors.push("collision must be a contact policy");
    else {
      if (contact["planeY"] !== undefined && !finite(contact["planeY"])) errors.push("collision.planeY must be finite");
      if (contact["response"] !== undefined && contact["response"] !== "kill" && contact["response"] !== "bounce") errors.push("collision.response must be kill or bounce");
      if (contact["restitution"] !== undefined && (!finite(contact["restitution"]) || contact["restitution"] < 0 || contact["restitution"] > 1)) errors.push("collision.restitution must be in [0, 1]");
      for (const [name, cap] of [["maxQueries", 4096], ["maxEvents", 1024]] as const) if (contact[name] !== undefined && (!finite(contact[name]) || !Number.isInteger(contact[name]) || contact[name] < 0 || contact[name] > cap)) errors.push(`collision.${name} must be an integer in [0, ${cap}]`);
    }
  }
  return errors;
}
