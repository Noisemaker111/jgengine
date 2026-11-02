import { ConvexError } from "convex/values";
import { createGameServerFunctions } from "@jgengine/convex/server";
import { LLMVILLE_GAME_ID, createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const {
  joinServer,
  leaveServer,
  runCommand,
  flushSave,
  getServerMeta,
  getServerCapacity,
  getPlayerProfile,
  getFeed,
  pushFeedEntry,
  listOpenServers,
  tickActiveServers,
  flushDirtyServers,
  helpers,
} = createGameServerFunctions({
  runtimes: [createLlmvilleRuntime()],
  topology: "shared",
  matchmaking: "singleton",
});

/** The one shared LLMville world, or `null` before anyone has joined it. */
export function worldServerRow(ctx: QueryCtx | MutationCtx): Promise<Doc<"jgGameServers"> | null> {
  return helpers.findServer(ctx, LLMVILLE_GAME_ID);
}

/** Runs a world command as the actor on the shared world. */
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
