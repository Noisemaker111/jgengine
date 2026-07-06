import { internalMutation } from "../_generated/server";
import type { SaveConfig } from "@jgengine/core/runtime/save";
import { getGameRuntime } from "./registry";
import { flushServerIfDue, loadServerSnapshot, persistServerSnapshot } from "./persistence";
import { clearDirtyFlags } from "@jgengine/core/runtime/snapshot";

export const JG_RUNTIME_TICK_MS = 1_000;

export const tickActiveServers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const servers = await ctx.db.query("jgGameServers").collect();
    let ticked = 0;
    let saved = 0;

    for (const server of servers) {
      if (server.status !== "running") continue;
      if (server.memberUserIds.length === 0) continue;

      const elapsedMs = now - server.tickAnchorMs;
      if (elapsedMs < JG_RUNTIME_TICK_MS) continue;

      const runtime = getGameRuntime(server.gameId);
      let snapshot = await loadServerSnapshot(ctx, server);
      snapshot = runtime.tick(snapshot, elapsedMs / 1_000);
      await persistServerSnapshot(ctx, server, snapshot, server.save as SaveConfig);
      await ctx.db.patch(server._id, { tickAnchorMs: now, updatedAt: now });
      ticked += 1;

      const refreshed = await ctx.db.get("jgGameServers", server._id);
      if (refreshed && (await flushServerIfDue(ctx, refreshed, now))) {
        saved += 1;
      }
    }

    return { ticked, saved };
  },
});

export const flushDirtyServers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const servers = await ctx.db.query("jgGameServers").collect();
    let saved = 0;

    for (const server of servers) {
      if (server.dirtyAt === undefined) continue;
      const snapshot = await loadServerSnapshot(ctx, server);
      await persistServerSnapshot(ctx, server, clearDirtyFlags(snapshot), server.save as SaveConfig);
      saved += 1;
      void now;
    }

    return { saved };
  },
});
