import type { FunctionReference } from "convex/server";
import { planServerTick, type TickSystemDefinition } from "@jgengine/core/time/serverTick";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const SERVER_TICK_HEARTBEAT_SECONDS = 1;

type ServerTickSystem = TickSystemDefinition & {
  handler: FunctionReference<"mutation", "internal">;
};

/**
 * What happens inside one LLMville server tick.
 *
 * A single cron heartbeat (every SERVER_TICK_HEARTBEAT_SECONDS) feeds this pipeline through the
 * engine's `planServerTick`: each system fires only when its own interval has elapsed, so slow
 * systems (bills, frontier) never bloat the fast lane. The tick itself is a pure dispatcher —
 * every system's logic lives in its owning domain module, never inline in the tick.
 *
 * Deliberately outside the tick:
 * - Player movement/presence is realtime and client-driven (multiplayer/worldPresence),
 *   not simulated; the game stays playable single-player if that lane is absent.
 * - Bankruptcy is decided inside billAutoPay when a payment fails, not polled every heartbeat.
 */
const SERVER_TICK_SYSTEMS: readonly ServerTickSystem[] = [
  /** Advance the runtime training queue: drain work, bill distill vendors, roll finished models. */
  { id: "trainingQueue", intervalMs: 5_000, scope: "onlinePlayers", batchSize: 25, handler: internal.models.tickTrainingQueues },
  /** Pay serving income (money) for served + hosted models. */
  { id: "servingIncome", intervalMs: 2_000, scope: "onlinePlayers", batchSize: 25, handler: internal.serving.tickAllServingIncome },
  /** Accrue tiered-scraping data tokens on scraping-lane GPUs. */
  { id: "scraping", intervalMs: 10_000, scope: "onlinePlayers", batchSize: 25, handler: internal.serving.tickAllScraping },
  /** Spawn cozy world events for eligible worlds. */
  { id: "eventSpawns", intervalMs: 20_000, scope: "onlinePlayers", batchSize: 25, handler: internal.world.spawnEventsForAllWorlds },
  /** Spawn the once-per-game-day utility bills (gated by game day inside the system). */
  { id: "billSpawns", intervalMs: 30_000, scope: "onlinePlayers", batchSize: 25, handler: internal.bills.spawnBillsForAllGames },
  /** Auto-deduct unpaid bills; insolvency triggers bankruptcy inside the system. */
  { id: "billAutoPay", intervalMs: 30_000, scope: "onlinePlayers", batchSize: 25, handler: internal.bills.autoPayBillsForAllGames },
  /** Bump the global frontier on frontier_release days (gated to once per UTC day inside). */
  { id: "frontierRelease", intervalMs: 3_600_000, handler: internal.bills.applyDailyFrontierRelease },
];

export const runServerTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db.query("serverTickState").first();
    const plan = planServerTick(SERVER_TICK_SYSTEMS, state?.anchors ?? {}, now);

    for (const system of SERVER_TICK_SYSTEMS) {
      if (!plan.due.some(run => run.id === system.id)) continue;
      await ctx.scheduler.runAfter(0, system.handler, {});
    }

    if (state) {
      await ctx.db.patch(state._id, { anchors: plan.anchors, updatedAt: now });
    } else {
      await ctx.db.insert("serverTickState", { anchors: plan.anchors, updatedAt: now });
    }

    return { ranSystems: plan.due };
  },
});
