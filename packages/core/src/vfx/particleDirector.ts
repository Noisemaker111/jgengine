import { validateEmitterConfig, type EmitterConfig, type ParticleEvent, type Vec3 } from "./particles";

/** How a particle effect composites on screen: `additive` for sparks/fire/glow, `normal` for smoke/dust. */
export type ParticleBlendHint = "additive" | "normal";

/** Render output selected independently of particle spawn and simulation. */
export interface ParticleRenderHint {
  shape: "point" | "streak" | "flake" | "flame" | "smoke" | "ribbon" | "ripple";
  /** Velocity streak length in seconds. Default 0.08. */
  stretch?: number;
}

/** A one-shot burst request — consumed once by the renderer, never serialized. */
export interface ParticleBurst {
  /** Monotonic sequence id so a renderer can consume each burst exactly once. */
  seq: number;
  config: EmitterConfig;
  /** Particles to emit immediately. */
  count: number;
  blending?: ParticleBlendHint;
  emitterId?: string;
  options?: ParticleAttachOptions;
}

/** A bounded collision child effect; children cannot spawn further collision children. */
export interface ParticleCollisionEffect {
  config: EmitterConfig;
  count: number;
  render?: ParticleRenderHint;
  blending?: ParticleBlendHint;
}

/** Options for {@link ParticleDirector.attach}. */
export interface ParticleAttachOptions {
  /** Scene entity id the emitter origin tracks each frame (plus `offset`). */
  follow?: string;
  /** World offset from the followed entity (or from the config position when unfollowed). */
  offset?: Vec3;
  blending?: ParticleBlendHint;
  /** Local particles move with the followed pose; world particles retain their emitted positions. */
  space?: "world" | "local";
  active?: boolean;
  render?: ParticleRenderHint;
  collisionEffect?: ParticleCollisionEffect;
  /** Explicit environment influence: windResponse in 1/second, maxAcceleration in metres/second², both 0..1e12. */
  environment?: { windResponse?: number; maxAcceleration?: number; mask?: number };
}

/** A keyed continuous emitter owned by the director until detached. */
export interface ParticleEmitterSpec extends ParticleAttachOptions {
  id: string;
  config: EmitterConfig;
  follow?: string;
  offset?: Vec3;
  blending?: ParticleBlendHint;
}

/** A cosmetic simulation event, labelled with its emitting effect. */
export interface ParticleDirectorEvent extends ParticleEvent {
  emitterId: string;
}

/** Bounded storage policy for transient effects and event exchange. */
export interface ParticleDirectorOptions {
  maxEmitters?: number;
  maxBursts?: number;
  maxEvents?: number;
}

/** Serializable director state: the standing emitters (bursts are transient by nature). */
export interface ParticleDirectorState {
  nextSeq: number;
  emitters: ParticleEmitterSpec[];
}

/**
 * The game-side seam for particle effects. Game logic requests one-shot bursts and
 * standing emitters as plain data; the shell renders them through
 * `createParticleSystem`/`ParticleField`, applies the graphics-quality particle cap,
 * and tracks `follow` entities. Nothing here touches a renderer, so commands and
 * `onTick` systems can drive VFX headlessly and tests can assert the requested effects.
 */
export interface ParticleDirector {
  /** Queue a one-shot burst (impact puff, debris, muzzle smoke). */
  burst(config: EmitterConfig, count: number, blending?: ParticleBlendHint, options?: ParticleAttachOptions): void;
  /** Create or replace a standing emitter under `id` (exhaust, dust plume, torch smoke). */
  attach(id: string, config: EmitterConfig, options?: ParticleAttachOptions): void;
  /** Patch a standing emitter's config in place (e.g. scale exhaust rate with speed). */
  retune(id: string, patch: Partial<EmitterConfig>, options?: Partial<ParticleAttachOptions>): void;
  /** Resume a named emitter while preserving its live particles. */
  start(id: string): void;
  /** Stop spawning; the renderer lets existing particles finish. */
  stop(id: string): void;
  /** Emit once through a named emitter's existing pool, including when stopped. */
  burstNamed(id: string, count: number): void;
  /** Renderer-to-game cosmetic event exchange, bounded by the director's event limit. */
  reportEvents(id: string, events: readonly ParticleEvent[]): void;
  drainEvents(): ParticleDirectorEvent[];
  /** Remove a standing emitter. Unknown ids are ignored. */
  detach(id: string): void;
  /** Drop every standing emitter and any unconsumed bursts. */
  clear(): void;
  /** The standing emitters, for renderers and assertions. */
  emitters(): readonly ParticleEmitterSpec[];
  /** Fixed registry and transient queue capacities for transactional preflight. */
  limits(): Required<ParticleDirectorOptions>;
  /** Return and forget the queued bursts — the renderer's consume-once read. */
  drainBursts(): ParticleBurst[];
  subscribe(listener: () => void): () => void;
  snapshot(): ParticleDirectorState;
  restore(state: ParticleDirectorState): void;
}

/**
 * Create the particle intent registry a `GameContext` exposes as `ctx.particles`.
 * State is data-only and serializable: standing emitters survive `snapshot`/`restore`,
 * queued bursts are transient. The renderer subscribes, drains bursts, and mirrors
 * the emitter list — the director never allocates particle pools itself.
 *
 * @capability particle-director named particle start/stop/burst/retune lifecycle, local/world following, render outputs, bounded cosmetic event exchange, and serializable emitter definitions
 */
export function createParticleDirector(options: ParticleDirectorOptions = {}): ParticleDirector {
  let nextSeq = 1;
  let bursts: ParticleBurst[] = [];
  const emitters = new Map<string, ParticleEmitterSpec>();
  const listeners = new Set<() => void>();
  let events: ParticleDirectorEvent[] = [];
  const limit = (n: number | undefined, fallback: number, cap: number) => Number.isFinite(n) ? Math.max(0, Math.min(cap, Math.floor(n!))) : fallback;
  const maxEmitters = limit(options.maxEmitters, 128, 1024);
  const maxBursts = limit(options.maxBursts, 32, 256);
  const maxEvents = limit(options.maxEvents, 128, 4096);

  function queue(config: EmitterConfig, count: number, blending?: ParticleBlendHint, emitterId?: string, attachOptions?: ParticleAttachOptions): void {
    const wanted = Number.isFinite(count) ? Math.min(65536, Math.floor(count)) : 0;
    if (wanted <= 0 || bursts.length >= maxBursts) return;
    bursts.push({ seq: nextSeq++, config: structuredClone(config), count: wanted,
      ...(blending === undefined ? {} : { blending }),
      ...(emitterId === undefined ? {} : { emitterId }),
      ...(attachOptions === undefined ? {} : { options: structuredClone(attachOptions) }) });
    notify();
  }

  function setActive(id: string, active: boolean): void {
    const current = emitters.get(id);
    if (current === undefined || (current.active ?? true) === active) return;
    emitters.set(id, { ...current, active });
    notify();
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    burst(config, count, blending, options) {
      queue(config, count, blending, undefined, options);
    },
    attach(id, config, options) {
      if (!emitters.has(id) && emitters.size >= maxEmitters) throw new RangeError(`Particle emitter capacity ${maxEmitters} exceeded by ${id}`);
      emitters.set(id, { id, config: structuredClone(config), ...structuredClone(options ?? {}) });
      notify();
    },
    retune(id, patch, options) {
      const current = emitters.get(id);
      if (current === undefined) return;
      emitters.set(id, { ...current, ...structuredClone(options ?? {}), config: { ...current.config, ...structuredClone(patch) } });
      notify();
    },
    start(id) { setActive(id, true); },
    stop(id) { setActive(id, false); },
    burstNamed(id, count) {
      const spec = emitters.get(id);
      if (spec === undefined) return;
      const { id: _, config, ...options } = spec;
      queue(config, count, spec.blending, id, options);
    },
    reportEvents(id, next) {
      for (let i = 0, n = Math.min(next.length, maxEvents - events.length); i < n; i++) {
        events.push({ ...structuredClone(next[i]!), emitterId: id });
      }
    },
    drainEvents() { const drained = events; events = []; return drained; },
    detach(id) {
      if (!emitters.delete(id)) return;
      notify();
    },
    clear() {
      if (emitters.size === 0 && bursts.length === 0 && events.length === 0) return;
      emitters.clear();
      bursts = [];
      events = [];
      notify();
    },
    emitters() {
      return Array.from(emitters.values());
    },
    limits() { return { maxEmitters, maxBursts, maxEvents }; },
    drainBursts() {
      if (bursts.length === 0) return [];
      const drained = bursts;
      bursts = [];
      return drained;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { nextSeq, emitters: structuredClone(Array.from(emitters.values())) };
    },
    restore(state) {
      nextSeq = Math.max(1, Number.isFinite(state.nextSeq) ? Math.floor(state.nextSeq) : 1);
      bursts = [];
      emitters.clear();
      events = [];
      for (const spec of state.emitters.slice(0, maxEmitters)) emitters.set(spec.id, structuredClone(spec));
      notify();
    },
  };
}

/**
 * Validate serializable binding, output, and bounded collision-child descriptors.
 * @capability particle-binding-validation validate named particle follow spaces, render outputs, environment influence, and bounded collision child effects
 */
export function validateParticleAttachOptions(value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return ["particle options must be an object"];
  const options = value as Record<string, unknown>;
  const errors: string[] = [];
  if (options.follow !== undefined && typeof options.follow !== "string") errors.push("follow must be an entity id");
  if (options.offset !== undefined && (!Array.isArray(options.offset) || options.offset.length !== 3 || options.offset.some((v) => typeof v !== "number" || !Number.isFinite(v)))) errors.push("offset must contain three finite numbers");
  if (options.space !== undefined && options.space !== "world" && options.space !== "local") errors.push("space must be world or local");
  if (options.active !== undefined && typeof options.active !== "boolean") errors.push("active must be boolean");
  const output = (render: unknown, blending: unknown, prefix: string) => {
    if (blending !== undefined && blending !== "normal" && blending !== "additive") errors.push(`${prefix}blending must be normal or additive`);
    if (render === undefined) return;
    if (render === null || typeof render !== "object" || Array.isArray(render)) { errors.push(`${prefix}render must be an output descriptor`); return; }
    const hint = render as Record<string, unknown>;
    if (!["point", "streak", "flake", "flame", "smoke", "ribbon", "ripple"].includes(hint.shape as string)) errors.push(`${prefix}render.shape is unsupported`);
    if (hint.stretch !== undefined && (typeof hint.stretch !== "number" || !Number.isFinite(hint.stretch) || hint.stretch < 0)) errors.push(`${prefix}render.stretch must be finite and nonnegative`);
  };
  output(options.render, options.blending, "");
  if (options.environment !== undefined) {
    const influence = options.environment as Record<string, unknown>;
    if (influence === null || typeof influence !== "object" || Array.isArray(influence)) errors.push("environment must be an influence descriptor");
    else {
      for (const name of ["windResponse", "maxAcceleration"]) if (influence[name] !== undefined && (typeof influence[name] !== "number" || !Number.isFinite(influence[name]) || influence[name] < 0 || influence[name] > 1e12)) errors.push(`environment.${name} must be finite in 0..1e12`);
      if (influence.mask !== undefined && (typeof influence.mask !== "number" || !Number.isInteger(influence.mask) || influence.mask < 0 || influence.mask > 0xffffffff)) errors.push("environment.mask must be an unsigned 32-bit integer");
    }
  }
  if (options.collisionEffect !== undefined) {
    const child = options.collisionEffect as Record<string, unknown>;
    if (child === null || typeof child !== "object" || Array.isArray(child)) errors.push("collisionEffect must be a child effect descriptor");
    else {
      errors.push(...validateEmitterConfig(child.config).map((error) => `collisionEffect.config.${error}`));
      if (typeof child.count !== "number" || !Number.isInteger(child.count) || child.count < 1 || child.count > 65536) errors.push("collisionEffect.count must be an integer in [1, 65536]");
      output(child.render, child.blending, "collisionEffect.");
    }
  }
  return errors;
}
