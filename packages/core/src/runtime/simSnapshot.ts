import { rngStateOf, restoreRng } from "../random/rng";
import type { GameContext } from "./gameContext";

/** One piece of simulation state that can be captured and restored by id. */
export interface SimSnapshotContributor<T = unknown> {
  id: string;
  capture(): T;
  restore(data: T): void;
}

/** Captured contributor data keyed by contributor id. */
export type SimSnapshot = Record<string, unknown>;

/** Registry of {@link SimSnapshotContributor}s that captures and restores them together. */
export interface SimSnapshotRegistry {
  register<T>(contributor: SimSnapshotContributor<T>): () => void;
  capture(): SimSnapshot;
  /** Alias of {@link capture}, matching the engine's snapshot/restore naming. */
  snapshot(): SimSnapshot;
  /** Restore every contributor present in `snapshot`; contributors missing from it are left untouched. */
  restore(snapshot: SimSnapshot): void;
  ids(): string[];
}

/**
 * A registry of everything that must round-trip for a simulation to resume bit-for-bit: world state, the
 * clock, the rng cursor, the loop accumulator, and whatever a physics backend or game adds. Pair with
 * {@link createInputRecorder} for replay.
 *
 * @capability sim-snapshot capture and restore whole-simulation state for replay, rollback, and regression tests
 */
export function createSimSnapshotRegistry(): SimSnapshotRegistry {
  const contributors = new Map<string, SimSnapshotContributor>();
  function capture(): SimSnapshot {
    const out: SimSnapshot = {};
    for (const [id, contributor] of contributors) out[id] = contributor.capture();
    return out;
  }
  return {
    register(contributor) {
      if (contributors.has(contributor.id)) {
        throw new Error(`sim snapshot contributor "${contributor.id}" is already registered`);
      }
      contributors.set(contributor.id, contributor as SimSnapshotContributor);
      return () => {
        contributors.delete(contributor.id);
      };
    },
    capture,
    snapshot: capture,
    restore(snapshot) {
      for (const [id, contributor] of contributors) {
        if (id in snapshot) contributor.restore(snapshot[id]);
      }
    },
    ids: () => Array.from(contributors.keys()),
  };
}

/**
 * The engine's own contributors for a context: replicated world state, the sim clock, the loop and pose
 * history, and the rng cursor when `ctx.rng` is a seeded stream. Games register theirs on the same registry.
 */
export function createContextSimSnapshot(ctx: GameContext): SimSnapshotRegistry {
  const registry = createSimSnapshotRegistry();
  // ctx.snapshot() hands back live rows; clone both ways so a captured snapshot stays frozen while the sim keeps running.
  registry.register({
    id: "world",
    capture: () => structuredClone(ctx.snapshot()),
    restore: (data) => ctx.hydrate(structuredClone(data)),
  });
  registry.register({ id: "clock", capture: () => ctx.time.snapshot(), restore: (data) => ctx.time.hydrate(data) });
  registry.register({ id: "sim", capture: () => ctx.sim.snapshot(), restore: (data) => ctx.sim.restore(data) });
  if (rngStateOf(ctx.rng) !== null) {
    registry.register<number>({
      id: "rng",
      capture: () => rngStateOf(ctx.rng) ?? 0,
      restore: (cursor) => restoreRng(ctx.rng, cursor),
    });
  }
  return registry;
}
