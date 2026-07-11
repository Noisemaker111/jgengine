export const DEFAULT_GRASS_COUNT = 1500;
export const DEFAULT_GRASS_DENSITY = 1;

export function resolveGrassInstanceBudget(count: number, density: number, budget?: number): number {
  const capped = budget === undefined ? count : Math.min(count, Math.max(0, Math.floor(budget)));
  return Math.floor(Math.max(0, Math.min(1, density)) * capped);
}
