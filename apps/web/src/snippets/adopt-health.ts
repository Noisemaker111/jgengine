import { applyStatPoolDelta, createStatPool, type StatPool } from "@jgengine/core/stats/statPool";

// Your state, in whatever shape you already keep it.
const pools: Record<string, Record<string, StatPool>> = {
  hero: { health: createStatPool({ current: 100, max: 100 }) },
};

// Two methods: how the engine reads and writes it.
export const access = {
  get: (id: string, stat: string) => pools[id]?.[stat] ?? null,
  set: (id: string, stat: string, next: StatPool) => {
    pools[id]![stat] = next;
  },
};

export const onHit = () => applyStatPoolDelta(access, "hero", "health", -12);
export const onPotion = () => applyStatPoolDelta(access, "hero", "health", 20);
// Each result says what was really applied, and whether it hit 0 or the max.
