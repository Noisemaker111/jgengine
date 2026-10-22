/**
 * The graphics-tier particle budget. A tier caps the live particle count across every effect on
 * screen; when the requested effects do not fit, whole effects are dropped in a defined order
 * (lowest {@link ParticleBudgetEntry.priority} first) rather than every effect thinning out.
 */

/** One effect asking for particle capacity this frame. */
export interface ParticleBudgetEntry {
  /** Emitter or burst id; unique within the request. */
  id: string;
  /** Drop order: higher survives, lower is dropped first. */
  priority: number;
  /** Particles this effect wants (its pool maximum, or a burst's count). */
  requested: number;
}

/** An admitted effect and the particles it may hold. */
export interface ParticleBudgetGrant {
  id: string;
  particles: number;
}

/** What the tier cap admits, and what it drops. */
export interface ParticleBudgetPlan {
  /** Admitted effects in priority order, each with its granted particle count. */
  grants: ParticleBudgetGrant[];
  /** Dropped effect ids, lowest priority first — the defined drop order. */
  dropped: string[];
  /** Sum of the granted particle counts, never above the cap. */
  particles: number;
}

function count(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/**
 * Allocate a tier's particle cap across the effects that want it.
 *
 * Effects are visited highest priority first (ties keep authoring order) and each takes
 * `min(requested, remaining)`. An effect that receives nothing is dropped, so the drop list comes
 * out lowest priority first: ambient dressing (dust, weather) yields before gameplay-loud effects
 * (explosions, muzzle flashes). The granted total never exceeds the cap, so the live particle
 * count cannot either.
 *
 * @capability plan-particle-budget cap live particles to a graphics tier and drop whole effects lowest-priority-first when over budget
 */
export function planParticleBudget(entries: readonly ParticleBudgetEntry[], cap: number): ParticleBudgetPlan {
  const limit = count(cap);
  const ordered = entries
    .map((entry, index) => ({ entry, index, priority: Number.isFinite(entry.priority) ? entry.priority : 0, wanted: count(entry.requested) }))
    .sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
  const grants: ParticleBudgetGrant[] = [];
  const dropped: string[] = [];
  let remaining = limit;
  for (const { entry, wanted } of ordered) {
    const particles = Math.min(wanted, remaining);
    if (particles <= 0) {
      dropped.push(entry.id);
      continue;
    }
    grants.push({ id: entry.id, particles });
    remaining -= particles;
  }
  dropped.reverse();
  return { grants, dropped, particles: limit - remaining };
}
