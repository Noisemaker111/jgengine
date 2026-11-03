import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { spend } from "./cash";
import { bonus, talentTree } from "./characters";
import { playerDef } from "./entities/players/catalog";
import { respawnFee } from "./handroll";
import { MAX_LEVEL, xpRequiredForLevel } from "./progression/curves";
import { grantLevelUnlocks } from "./progression/unlocks";
import { discoveredStationsStore, talentRanksStore } from "./stores";
import { TRAVEL_STATIONS } from "./world/sites";
import { PLAYER_SPAWN, PLAYER_SPAWN_YAW } from "./world/setup";

/** The discovered station nearest the chassis (or the start), where a rebuilt chassis stands up. */
export function nearestDiscoveredStation(ctx: GameContext): { x: number; z: number; name: string | null } {
  const discovered = discoveredStationsStore.read(ctx);
  const from = ctx.scene.entity.get(ctx.player.userId)?.position ?? PLAYER_SPAWN;
  let best: { x: number; z: number; name: string | null } = { x: PLAYER_SPAWN[0], z: PLAYER_SPAWN[2], name: null };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of TRAVEL_STATIONS) {
    if (!discovered.includes(station.zoneId)) continue;
    const distance = Math.hypot(from[0] - station.x, from[2] - station.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: station.x + 4, z: station.z + 4, name: station.name };
    }
  }
  return best;
}

export interface ChassisRecovery {
  level: number;
  fee: number;
  station: string | null;
  /** What the save could not give back, in the words the notice uses. */
  lost: string[];
}

/**
 * A save that kept the run but lost the chassis (written while it was gone, or by an older build that
 * dropped it) would load into a world with nobody in it. Rebuild it at the nearest discovered station:
 * the level comes back from the talent build (every level grants one point, spent or banked), the
 * hotbar, wallet, quests and world stay as loaded, the rebuild fee is charged once (the rebuilt chassis
 * is in every save after this, so a reload never pays again), and the notice says what was lost.
 * Returns null when the chassis loaded.
 */
export function recoverChassis(ctx: GameContext): ChassisRecovery | null {
  const userId = ctx.player.userId;
  if (ctx.scene.entity.get(userId) !== null) return null;
  const station = nearestDiscoveredStation(ctx);
  const y = ctx.world.groundHeightAt(station.x, station.z);
  ctx.scene.entity.spawn(playerDef.id, { id: userId, position: [station.x, y, station.z], rotationY: PLAYER_SPAWN_YAW, role: "player" });

  const tree = talentTree();
  const ranks = tree?.snapshot().ranks ?? talentRanksStore.read(ctx);
  const spent = Object.values(ranks).reduce((sum, rank) => sum + rank, 0);
  const banked = tree?.pointsAvailable() ?? 0;
  const level = Math.min(MAX_LEVEL, 1 + spent + banked);
  ctx.scene.entity.stats.set(userId, "level", { current: level });
  ctx.scene.entity.stats.set(userId, "skillPoints", { current: banked });
  ctx.scene.entity.stats.set(userId, "xp", { max: xpRequiredForLevel(level), current: 0 });
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    const max = Math.round(health.max * (1 + bonus("maxHealth")));
    ctx.scene.entity.stats.set(userId, "health", { max, current: max });
  }
  grantLevelUnlocks(ctx, level);

  const fee = respawnFee(ctx.game.economy.balance(userId, "cash"));
  if (fee > 0) spend(ctx, "cash", fee, "respawn-fee");

  const lost = ["XP toward the next level", "reserve ammo and grenades beyond the starting kit"];
  const where = station.name === null ? "the drop point" : station.name;
  ctx.game.notices.push({
    text: `Your save had no chassis, so a new one was built at ${where}. Kept: level ${level}, gear, cash and missions. Fee: $${fee}. Lost: ${lost.join(", ")}.`,
    tone: "warn",
  });
  ctx.scene.entity.floatText({ instanceId: userId, text: fee > 0 ? `CHASSIS REBUILT — $${fee} FEE` : "CHASSIS REBUILT", kind: "warn" });
  return { level, fee, station: station.name, lost };
}
