import type { StatValue } from "./entityStats";

export interface MovementSpeedModifiers {
  multiplier?: number;
  flatBonus?: number;
}

/** `base * (multiplier ?? 1) + (flatBonus ?? 0)`, clamped to never go negative. */
export function deriveWalkSpeed(base: number, modifiers: MovementSpeedModifiers): number {
  const multiplier = modifiers.multiplier ?? 1;
  const flatBonus = modifiers.flatBonus ?? 0;
  return Math.max(0, base * multiplier + flatBonus);
}

export interface MovementSpeedDeps {
  stats: { get(instanceId: string, statId: string): StatValue | null };
  entities: {
    get(id: string): { movement?: { walkSpeed?: number } } | null;
    update(id: string, patch: { movement: { walkSpeed: number } }): boolean;
  };
}

export interface MovementSpeedConfig {
  baseSpeed: number;
  multiplierStat?: string;
  flatBonusStat?: string;
}

/**
 * Recomputes `movement.walkSpeed` for an entity from its stats and writes it back via `deps.entities.update`.
 * Either stat id is optional; an omitted or unresolved stat contributes its neutral value (multiplier 1,
 * flat bonus 0) rather than failing. Returns false only when the entity itself doesn't exist.
 */
export function applyStatDrivenSpeed(
  deps: MovementSpeedDeps,
  instanceId: string,
  config: MovementSpeedConfig,
): boolean {
  const entity = deps.entities.get(instanceId);
  if (entity === null) return false;

  const multiplier =
    config.multiplierStat !== undefined ? deps.stats.get(instanceId, config.multiplierStat)?.current : undefined;
  const flatBonus =
    config.flatBonusStat !== undefined ? deps.stats.get(instanceId, config.flatBonusStat)?.current : undefined;

  const walkSpeed = deriveWalkSpeed(config.baseSpeed, { multiplier, flatBonus });
  return deps.entities.update(instanceId, { movement: { ...entity.movement, walkSpeed } });
}
