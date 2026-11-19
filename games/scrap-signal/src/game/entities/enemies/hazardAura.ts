import { createAreaEffectField, type AreaEffectField } from "@jgengine/core/area/areaEffectField";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

/**
 * Boss "overload field": a continuous, source-following damage aura built on the engine's
 * `area/areaEffectField` primitive. Each live boss emits a short-radius sphere that follows it; the
 * player takes shock damage on a fixed cadence while standing inside, and the aura is cleaned up the
 * moment its boss dies or despawns. Pure over its inputs so it can be unit-tested without a
 * GameContext — the caller (enemy AI tick) feeds live boss samples and routes the returned damage
 * through the normal effect pipeline.
 */

export interface BossAuraTuning {
  /** Aura sphere radius in metres. */
  readonly radius: number;
  readonly damagePerTick: number;
  /** Milliseconds between damage ticks. */
  readonly refreshMs: number;
}

export const BOSS_AURA: BossAuraTuning = { radius: 3, damagePerTick: 6, refreshMs: 700 };

export interface BossSample {
  readonly id: string;
  readonly position: EntityPosition;
  readonly level: number;
}

export interface AuraDamage {
  readonly bossId: string;
  readonly amount: number;
}

export function createBossAuraField(): AreaEffectField<{ level: number }> {
  return createAreaEffectField<{ level: number }>();
}

export function reconcileBossAuras(
  field: AreaEffectField<{ level: number }>,
  bosses: readonly BossSample[],
  player: { readonly id: string; readonly position: EntityPosition } | null,
  dtMs: number,
  levelDamageMult: (level: number) => number,
): AuraDamage[] {
  const live = new Set<string>();
  for (const boss of bosses) {
    live.add(boss.id);
    field.setSource({
      id: boss.id,
      shape: { kind: "sphere", center: [boss.position[0], 0, boss.position[2]], radius: BOSS_AURA.radius },
      payload: { level: boss.level },
      refreshMs: BOSS_AURA.refreshMs,
    });
  }
  for (const id of field.sourceIds()) if (!live.has(id)) field.removeSource(id);

  if (player === null) {
    field.step({ dtMs, candidates: () => [], positionOf: () => undefined });
    return [];
  }

  const playerId = player.id;
  const playerPos: EntityPosition = [player.position[0], 0, player.position[2]];
  const events = field.step({
    dtMs,
    candidates: () => [playerId],
    positionOf: (id) => (id === playerId ? playerPos : undefined),
  });

  const damage: AuraDamage[] = [];
  for (const event of events) {
    if (event.kind !== "refresh") continue;
    const perTick = Math.round(BOSS_AURA.damagePerTick * levelDamageMult(event.payload.level));
    damage.push({ bossId: event.sourceId, amount: perTick * (event.ticks ?? 1) });
  }
  return damage;
}
