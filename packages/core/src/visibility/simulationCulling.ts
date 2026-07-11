import type { LodBand } from "../world/lod";
import { createLodScheduler } from "../world/lod";

/**
 * Simulation culling is a SEPARATE, opt-in system from render culling. Render culling only
 * decides what is drawn; this decides whether a low-priority off-screen entity updates this
 * tick. It is disabled by default and never throttles a protected entity — physics-critical,
 * networking-critical, audio-critical, scripted, or explicitly-active entities always update.
 * Gameplay correctness must never depend on an entity being on-screen, so opt in only where
 * skipping updates is provably safe.
 */
export interface SimulationCullingOptions {
  /** Off by default. */
  readonly enabled?: boolean;
  /** Distance bands → update interval (seconds). Nearer bands update every tick; far bands throttle. */
  readonly bands?: readonly LodBand[];
  /** Interval for entities beyond the last band. null = never throttle (still update). Default null. */
  readonly beyondInterval?: number | null;
  /** Return true for entities that must never be throttled (physics/net/audio/scripted/active). */
  readonly isProtected?: (id: string) => boolean;
}

export interface SimulationDecision {
  /** Whether the entity should run its update this tick. */
  update: boolean;
  /** Seconds of accumulated time delivered when `update` is true (for catch-up integration). */
  elapsed: number;
}

export interface SimulationCuller {
  enabled(): boolean;
  setEnabled(value: boolean): void;
  /** Decide whether `id` at `distance` from the nearest camera updates this tick. */
  step(id: string, distance: number, dt: number): SimulationDecision;
  forget(id: string): void;
  clear(): void;
}

const DEFAULT_BANDS: readonly LodBand[] = [
  { maxDistance: 40, interval: 0 },
  { maxDistance: 90, interval: 0.1 },
  { maxDistance: 160, interval: 0.25 },
];

export function createSimulationCuller(options: SimulationCullingOptions = {}): SimulationCuller {
  let enabled = options.enabled ?? false;
  const isProtected = options.isProtected;
  const scheduler = createLodScheduler({
    bands: options.bands ?? DEFAULT_BANDS,
    beyondInterval: options.beyondInterval ?? null,
    stagger: true,
  });

  return {
    enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = value;
    },
    step(id, distance, dt) {
      if (!enabled || (isProtected !== undefined && isProtected(id))) {
        return { update: true, elapsed: dt };
      }
      const elapsed = scheduler.step(id, distance, dt);
      return elapsed > 0 ? { update: true, elapsed } : { update: false, elapsed: 0 };
    },
    forget(id) {
      scheduler.remove(id);
    },
    clear() {
      scheduler.clear();
    },
  };
}
