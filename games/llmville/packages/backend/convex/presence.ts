import { createPresenceFunctions } from "@jgengine/convex/server";
import { pickDatacenterSpawn } from "@llmville/game/datacenter/spawn";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import { WORLD_POSE_RULES, WORLD_SNAPSHOT_INTERVAL_MS, shouldPersistPresenceWorldSnapshot } from "@llmville/game/multiplayer/presencePolicy";
import { hashStructuralSeed } from "@llmville/game/world/cityHash";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { claimsNearOrigin } from "./datacenter";

/** How long an unwritten pose row stays listed and alive; the reaper collects it after that. */
export const PRESENCE_IDLE_TIMEOUT_MS = 4 * 60 * 1000;

/** Where a lab's avatar enters the shared datacenter: where it last stood, else a seeded free spot. */
export async function spawnForGame(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<{ x: number; y: number; z: number }> {
  const game = await ctx.db.get("games", gameId);
  const saved = game?.lastWorldPosition;
  if (saved) return { x: saved.x, y: 0, z: saved.z };
  const spawn = pickDatacenterSpawn(hashStructuralSeed(["spawn", gameId]), await claimsNearOrigin(ctx));
  return { x: spawn.x, y: 0, z: spawn.z };
}

/** Saves where a lab's avatar stands onto the lab, which spawns it there next time and shows it while offline. */
export async function persistGameWorldSnapshot(
  ctx: MutationCtx,
  gameId: Id<"games">,
  position: { x: number; z: number },
  now: number,
  force = false,
): Promise<void> {
  const game = await ctx.db.get("games", gameId);
  if (!game) return;
  if (!force && !shouldPersistPresenceWorldSnapshot(game.lastWorldPositionAt, now)) return;
  await ctx.db.patch(gameId, {
    lastWorldPosition: { x: position.x, z: position.z },
    lastWorldChunkKey: worldChunkKeyAt(position),
    lastWorldPositionAt: now,
  });
}

/** A checkpoint from the presence lane, run as its own transaction because the lane's mutations see only engine tables. */
export const saveLastWorldPosition = internalMutation({
  args: { homeGameId: v.string(), x: v.number(), z: v.number(), nowMs: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const gameId = ctx.db.normalizeId("games", args.homeGameId);
    if (gameId !== null) await persistGameWorldSnapshot(ctx, gameId, args, args.nowMs, true);
    return null;
  },
});

/**
 * The shell's presence lane (`createConvexPresenceSync` reads `presence:list`, `presence:sync`,
 * `presence:leave`). Rows live in the engine's `jgPoses`, shared with the bot API in
 * `multiplayer/worldPresence`; `ensureHumanPresence` stamps the lab, name and spawn on a human's row.
 */
export const { list, sync, leave } = createPresenceFunctions({
  freshWindowMs: PRESENCE_IDLE_TIMEOUT_MS,
  poseRules: WORLD_POSE_RULES,
  checkpoint: {
    intervalMs: WORLD_SNAPSHOT_INTERVAL_MS,
    write: async (ctx, row, nowMs) => {
      if (row.homeGameId === undefined) return;
      await ctx.scheduler.runAfter(0, internal.presence.saveLastWorldPosition, { homeGameId: row.homeGameId, x: row.position.x, z: row.position.z, nowMs });
    },
  },
});
