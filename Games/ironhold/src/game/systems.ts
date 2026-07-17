import { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { activeJobs, jobProgress, queuedJobs, tick as tickQueue } from "@jgengine/core/gameplay";

import { tickUnits } from "./ai/units";
import { tickEnemyWaves } from "./ai/director";
import { BUILDINGS, combatantDef, isHostile } from "./catalog";
import { BUILD_CONFIG, type BuildSpec } from "./building";
import { hudStore } from "./hudStore";
import { TRAINING_CONFIG } from "./production";
import { GOLD, INCOME_TRICKLE, LUMBER } from "./tuning";
import { livingUnits, session, usedSupply, type UnitRuntime } from "./session";
import { grantResearch, RESEARCH_CONFIG, resolveDamage, upgradeHave, upgradeRank } from "./upgrades";

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

/** The Marauder AI director: musters escalating reinforcement waves from the enemy Warcamp. */
const enemyAiSystem: SystemDefinition = defineSystem({
  id: "ironhold.enemyAi",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    tickEnemyWaves(ctx, dt);
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

/** Raise a finished building at its placed spot; a Farm lifts the supply cap. */
function raiseBuilding(ctx: GameContext, spec: BuildSpec): void {
  const def = combatantDef(spec.type);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${spec.type}_b${session.trainSeq}`;
  ctx.scene.entity.spawn(spec.type, { id, position: [spec.x, 0, spec.z], role: "npc" });
  session.units.set(id, {
    id,
    catalogId: spec.type,
    faction: "player",
    kind: "building",
    command: { kind: "idle" },
    guardPoint: { x: spec.x, z: spec.z },
    leash: 0,
    attackCooldown: 0,
  });
  const supply = BUILDINGS[spec.type]?.supply;
  if (supply !== undefined) session.supplyCap += supply;
}

/** Advance construction; each finished job raises its building. */
const constructionSystem: SystemDefinition = defineSystem({
  id: "ironhold.construction",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (session.over) return;
    const result = tickQueue(session.buildQueue, BUILD_CONFIG, dt);
    session.buildQueue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") raiseBuilding(ctx, event.output);
    }
  },
});

/** Advance the research queue; each finished job raises its upgrade's rank permanently. */
const researchSystem: SystemDefinition = defineSystem({
  id: "ironhold.research",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (session.over) return;
    const result = tickQueue(session.research.queue, RESEARCH_CONFIG, dt);
    session.research.queue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") grantResearch(event.output);
    }
  },
});

/** Guard Towers auto-fire at the nearest hostile within range. */
const towerSystem: SystemDefinition = defineSystem({
  id: "ironhold.towers",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (session.over) return;
    for (const u of session.units.values()) {
      if (u.kind !== "building") continue;
      const def = combatantDef(u.catalogId);
      if (def === null || def.damage <= 0) continue; // only armed structures
      u.attackCooldown = Math.max(0, u.attackCooldown - dt);
      const self = ctx.scene.entity.get(u.id);
      if (self === null) continue;
      let targetId: string | null = null;
      let best = def.attackRange;
      for (const other of session.units.values()) {
        if (!isHostile(u.faction, other.faction)) continue;
        const ent = ctx.scene.entity.get(other.id);
        if (ent === null) continue;
        const d = Math.hypot(self.position[0] - ent.position[0], self.position[2] - ent.position[2]);
        if (d <= best) {
          best = d;
          targetId = other.id;
        }
      }
      if (targetId !== null && u.attackCooldown <= 0) {
        const defender = session.units.get(targetId)?.faction ?? "enemy";
        const amount = resolveDamage(def.damage, u.faction, defender);
        ctx.scene.entity.effect({ from: u.id, to: targetId, effect: "damage", via: { amount } });
        u.attackCooldown = def.attackCooldown;
      }
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
      wavesSent: session.enemyWave.sent,
      nextWaveIn: Math.max(0, Math.ceil(session.enemyWave.timer)),
      producing: active.length + queuedJobs(session.production).length,
      trainProgress: active.length > 0 ? jobProgress(active[0]!) : 0,
      hasBarracks: livingUnits("player", "building").some((u) => u.catalogId === "barracks"),
      buildArmed: session.buildArmed,
      building: activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length,
      weaponsRank: upgradeRank("weapons"),
      weaponsHave: upgradeHave("weapons"),
      armorRank: upgradeRank("armor"),
      armorHave: upgradeHave("armor"),
      researching: activeJobs(session.research.queue).length + queuedJobs(session.research.queue).length,
    });
  },
});

export const systems: readonly SystemDefinition[] = [
  aiSystem,
  enemyAiSystem,
  productionSystem,
  constructionSystem,
  researchSystem,
  towerSystem,
  incomeSystem,
  hudSystem,
];
