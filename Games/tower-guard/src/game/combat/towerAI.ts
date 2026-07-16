import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { selectAutoTarget, type AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

import { editorLayers } from "../../editorLayers";
import { towerDef, type TowerDef } from "../entities/towers/catalog";
import { session } from "../session";
import { pushProjectile } from "./pendingProjectiles";

const TOWER_ID = "__tower__";

export interface TargetCandidate {
  id: string;
  position: EntityPosition;
  progress: number;
}

function distance(a: EntityPosition, b: EntityPosition): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function chooseTarget(
  policy: AutoTargetPolicy,
  towerPosition: EntityPosition,
  range: number,
  candidates: readonly TargetCandidate[],
): string | null {
  const inRange = candidates.filter((candidate) => distance(towerPosition, candidate.position) <= range);
  if (inRange.length === 0) return null;
  const byId = new Map(inRange.map((candidate) => [candidate.id, candidate]));
  return selectAutoTarget(policy, TOWER_ID, {
    candidates: () => inRange.map((candidate) => candidate.id),
    distance: (_from, toId) => {
      const candidate = byId.get(toId);
      return candidate === undefined ? null : distance(towerPosition, candidate.position);
    },
    progress: (toId) => byId.get(toId)?.progress ?? 0,
  });
}

function applyDamage(ctx: GameContext, def: TowerDef, towerId: string, targetId: string): void {
  ctx.scene.entity.effect({ from: towerId, to: targetId, effect: "damage", via: { amount: def.damage } });
  if (def.splashRadius <= 0) return;
  const target = ctx.scene.entity.get(targetId);
  if (target === null) return;
  const splashTargets = ctx.scene.entity.inRadius(target.position, def.splashRadius, (id) => id !== targetId);
  for (const id of splashTargets) {
    if (!session.creeps.has(id)) continue;
    ctx.scene.entity.effect({ from: towerId, to: id, effect: "damage", via: { amount: def.damage * 0.5 } });
  }
}

function applySlow(_ctx: GameContext, def: TowerDef, targetId: string, nowSeconds: number): void {
  if (def.slow === undefined) return;
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return;
  creep.speedStats.addSource(`slow:${def.id}`, { speed: { multiply: def.slow.factor } }, {
    expiresAtMs: nowSeconds + def.slow.durationMs / 1000,
  });
}

export function tickTowers(ctx: GameContext, dt: number): void {
  const now = ctx.time.now();
  const candidates: TargetCandidate[] = [];
  for (const creep of session.creeps.values()) {
    const entity = ctx.scene.entity.get(creep.instanceId);
    if (entity === null) continue;
    candidates.push({ id: creep.instanceId, position: entity.position, progress: creep.path.distanceTravelled });
  }

  for (const tower of session.towers.values()) {
    const def = towerDef(tower.catalogId, editorLayers);
    tower.cooldownSeconds = Math.max(0, tower.cooldownSeconds - dt);
    if (tower.cooldownSeconds > 0) continue;

    const entity = ctx.scene.entity.get(tower.instanceId);
    if (entity === null) continue;

    const targetId = chooseTarget(def.targeting, entity.position, def.range, candidates);
    if (targetId === null) continue;

    const target = ctx.scene.entity.get(targetId);
    if (target === null) continue;

    applyDamage(ctx, def, tower.instanceId, targetId);
    applySlow(ctx, def, targetId, now);
    pushProjectile(entity.position, target.position, def.boltColor, def.splashRadius, now);
    tower.cooldownSeconds = 1 / def.fireRateHz;
  }
}
