import { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { tickUnits } from "./ai/units";
import { hudStore } from "./hudStore";
import { GOLD, INCOME_PER_SECOND } from "./tuning";
import { livingUnits, session } from "./session";

function keepStat(ctx: GameContext, faction: "player" | "enemy"): { current: number; max: number } {
  const keep = livingUnits(faction, "building")[0];
  if (keep === undefined) return { current: 0, max: 1 };
  const stat = ctx.scene.entity.stats.get(keep.id, "health");
  return stat === null ? { current: 0, max: 1 } : { current: Math.max(0, Math.round(stat.current)), max: stat.max };
}

/** The RTS heartbeat: unit orders + auto-combat resolve every frame. */
const aiSystem: SystemDefinition = defineSystem({
  id: "ironhold.ai",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    tickUnits(ctx, dt);
  },
});

/** Passive gold trickle so losses can be replaced — the macro layer that keeps a fight recoverable. */
const incomeSystem: SystemDefinition = defineSystem({
  id: "ironhold.income",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (session.over) return;
    ctx.game.economy.grant(ctx.player.userId, GOLD, INCOME_PER_SECOND);
  },
});

/** Snapshot live counts for the HUD a few times a second (the store only re-renders on change). */
const hudSystem: SystemDefinition = defineSystem({
  id: "ironhold.hud",
  tick: { type: "interval", every: 0.2 },
  update(ctx) {
    const enemyKeep = keepStat(ctx, "enemy");
    const playerKeep = keepStat(ctx, "player");
    hudStore.set({
      gold: Math.floor(ctx.game.economy.balance(ctx.player.userId, GOLD)),
      playerUnits: livingUnits("player", "unit").length,
      enemyUnits: livingUnits("enemy", "unit").length,
      enemyKeepHp: enemyKeep.current,
      enemyKeepMax: enemyKeep.max,
      playerKeepHp: playerKeep.current,
      playerKeepMax: playerKeep.max,
      attackMoveArmed: session.attackMoveArmed,
    });
  },
});

export const systems: readonly SystemDefinition[] = [aiSystem, incomeSystem, hudSystem];
