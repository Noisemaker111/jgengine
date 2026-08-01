import type { EmitterConfig, Vec3 } from "./particles";

/** How a particle effect composites on screen: `additive` for sparks/fire/glow, `normal` for smoke/dust. */
export type ParticleBlendHint = "additive" | "normal";

/** A one-shot burst request — consumed once by the renderer, never serialized. */
export interface ParticleBurst {
  /** Monotonic sequence id so a renderer can consume each burst exactly once. */
  seq: number;
  config: EmitterConfig;
  /** Particles to emit immediately. */
  count: number;
  blending?: ParticleBlendHint;
}

/** Options for {@link ParticleDirector.attach}. */
export interface ParticleAttachOptions {
  /** Scene entity id the emitter origin tracks each frame (plus `offset`). */
  follow?: string;
  /** World offset from the followed entity (or from the config position when unfollowed). */
  offset?: Vec3;
  blending?: ParticleBlendHint;
}

/** A keyed continuous emitter owned by the director until detached. */
export interface ParticleEmitterSpec {
  id: string;
  config: EmitterConfig;
  follow?: string;
  offset?: Vec3;
  blending?: ParticleBlendHint;
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
  burst(config: EmitterConfig, count: number, blending?: ParticleBlendHint): void;
  /** Create or replace a standing emitter under `id` (exhaust, dust plume, torch smoke). */
  attach(id: string, config: EmitterConfig, options?: ParticleAttachOptions): void;
  /** Patch a standing emitter's config in place (e.g. scale exhaust rate with speed). */
  retune(id: string, patch: Partial<EmitterConfig>): void;
  /** Remove a standing emitter. Unknown ids are ignored. */
  detach(id: string): void;
  /** Drop every standing emitter and any unconsumed bursts. */
  clear(): void;
  /** The standing emitters, for renderers and assertions. */
  emitters(): readonly ParticleEmitterSpec[];
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
 * @capability particle-director game-reachable VFX seam: queue one-shot particle bursts and keyed follow-capable standing emitters as serializable data for the shell to render
 */
export function createParticleDirector(): ParticleDirector {
  let nextSeq = 1;
  let bursts: ParticleBurst[] = [];
  const emitters = new Map<string, ParticleEmitterSpec>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    burst(config, count, blending) {
      const wanted = Math.floor(count);
      if (wanted <= 0) return;
      bursts.push({ seq: nextSeq++, config, count: wanted, ...(blending === undefined ? {} : { blending }) });
      notify();
    },
    attach(id, config, options) {
      emitters.set(id, {
        id,
        config,
        ...(options?.follow === undefined ? {} : { follow: options.follow }),
        ...(options?.offset === undefined ? {} : { offset: options.offset }),
        ...(options?.blending === undefined ? {} : { blending: options.blending }),
      });
      notify();
    },
    retune(id, patch) {
      const current = emitters.get(id);
      if (current === undefined) return;
      emitters.set(id, { ...current, config: { ...current.config, ...patch } });
      notify();
    },
    detach(id) {
      if (!emitters.delete(id)) return;
      notify();
    },
    clear() {
      if (emitters.size === 0 && bursts.length === 0) return;
      emitters.clear();
      bursts = [];
      notify();
    },
    emitters() {
      return Array.from(emitters.values());
    },
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
      return { nextSeq, emitters: Array.from(emitters.values()) };
    },
    restore(state) {
      nextSeq = state.nextSeq;
      bursts = [];
      emitters.clear();
      for (const spec of state.emitters) emitters.set(spec.id, spec);
      notify();
    },
  };
}
