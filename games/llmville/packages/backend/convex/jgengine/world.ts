import { ConvexError } from "convex/values";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { helpers } from "./runtime";

const WORLD_SERVER_STATUSES = ["running", "open"] as const;

export async function worldServerRow(ctx: QueryCtx): Promise<Doc<"jgGameServers"> | null> {
  for (const status of WORLD_SERVER_STATUSES) {
    const row = await ctx.db
      .query("jgGameServers")
      .withIndex("by_game_and_status", (q) => q.eq("gameId", LLMVILLE_GAME_ID).eq("status", status))
      .first();
    if (row !== null) return row;
  }
  return null;
}

export async function runWorldCommand(
  ctx: MutationCtx,
  actorExternalId: string,
  command: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const server = await worldServerRow(ctx);
  if (server === null) {
    throw new ConvexError(`No ${LLMVILLE_GAME_ID} world server exists yet — a player must join before commands can run.`);
  }
  return helpers.runCommand(ctx, { serverId: server._id, actorUserId: actorExternalId, command, input });
}
