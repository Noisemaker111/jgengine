import { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { activeJobs, jobProgress, queuedJobs, tick as tickQueue } from "@jgengine/core/gameplay";

import { tickUnits } from "./ai/units";
import { combatantDef } from "./catalog";
import { hudStore } from "./hudStore";
import { TRAINING_CONFIG } from "./production";
import { GOLD, INCOME_TRICKLE, LUMBER } from "./tuning";
import { livingUnits, session, usedSupply, type UnitRuntime } from "./session";

function keepStat(ctx: GameContext, faction: "player" | "enemy"): { current: number; max: number } {
  const keep = livingUnits(faction, "building")[0];
  if (keep === undefined) return { current: 0, max: 1 };
  const stat = ctx.scene.entity.stats.get(keep.id, "health");
  return stat === null ? { current: 0, max: 1 } : { current: Math.max(0, Math.round(stat.current)), max: stat.max };
}

/** Spawn a freshly-trained unit at the Town Hall's muster point and walk it onto the field. */
function spawnTrained(ctx: GameContext, unitId: string): void {
  const keepUnit = livingUnits("player", "building")[0];
  if (keepUnit === undefined) return;
  const keep = ctx.scene.entity.get(keepUnit.id);
  if (keep === null) return;
  const def = combatantDef(unitId);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${unitId}_t${session.trainSeq}`;
  const lane = ((session.trainSeq % 5) - 2) * 1.8;
  const ex = keep.position[0] + lane;
  const ez = keep.position[2] - 8;
  ctx.scene.entity.spawn(unitId, { id, position: [ex, 0, ez], role: "npc" });
  const unit: UnitRuntime = {
    id,
    catalogId: unitId,
    faction: "player",
    kind: "unit",
    command: { kind: "move", x: ex, z: ez - 3 },
    guardPoint: { x: ex, z: ez },
    leash: 14,
    attackCooldown: 0,
  };
  session.units.set(id, unit);
}

/** The RTS heartbeat: unit orders + auto-combat resolve every frame. */
const aiSystem: SystemDefinition = defineSystem({
  id: "ironhold.ai",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    tickUnits(ctx, dt);
  },
});

/** Advance the Town Hall training queue; each completed job spawns and musters a unit. */
const productionSystem: SystemDefinition = defineSystem({
  id: "ironhold.production",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (session.over) return;
    const result = tickQueue(session.production, TRAINING_CONFIG, dt);
    session.production = result.state;
    for (const event of result.events) {
      if (event.type === "completed") spawnTrained(ctx, event.output.unitId);
    }
  },
});

/** A slow gold trickle so a stalled economy can still recover a little. */
const incomeSystem: SystemDefinition = defineSystem({
  id: "ironhold.income",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (session.over) return;
    ctx.game.economy.grant(ctx.player.userId, GOLD, INCOME_TRICKLE);
  },
});

/** Snapshot live economy + counts for the HUD a few times a second. */
const hudSystem: SystemDefinition = defineSystem({
  id: "ironhold.hud",
  tick: { type: "interval", every: 0.2 },
  update(ctx) {
    const enemyKeep = keepStat(ctx, "enemy");
    const playerKeep = keepStat(ctx, "player");
    const active = activeJobs(session.production);
    hudStore.set({
      gold: Math.floor(ctx.game.economy.balance(ctx.player.userId, GOLD)),
      lumber: Math.floor(ctx.game.economy.balance(ctx.player.userId, LUMBER)),
      foodUsed: usedSupply(),
      foodCap: session.supplyCap,
      playerUnits: livingUnits("player", "unit").length,
      enemyUnits: livingUnits("enemy", "unit").length,
      enemyKeepHp: enemyKeep.current,
      enemyKeepMax: enemyKeep.max,
      playerKeepHp: playerKeep.current,
      playerKeepMax: playerKeep.max,
      attackMoveArmed: session.attackMoveArmed,
      producing: active.length + queuedJobs(session.production).length,
      trainProgress: active.length > 0 ? jobProgress(active[0]!) : 0,
    });
  },
});

export const systems: readonly SystemDefinition[] = [aiSystem, productionSystem, incomeSystem, hudSystem];
