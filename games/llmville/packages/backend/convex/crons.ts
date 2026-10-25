import { cronJobs } from "convex/server";
import { jgengineCronSpecs } from "@jgengine/convex/server";
import { createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";
import { SERVER_TICK_HEARTBEAT_SECONDS } from "./tick";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Game simulation: one heartbeat runs the pipeline defined in tick.ts.
crons.interval("server tick", { seconds: SERVER_TICK_HEARTBEAT_SECONDS }, internal.tick.runServerTick);

crons.interval("prune old client errors", { hours: 1 }, internal.clientErrors.pruneOldClientErrors, {});

// Realtime lane, separate from the game tick: movement/presence sync is client-driven; this only reaps stale rows.
crons.interval("reap idle presences", { seconds: 15 }, internal.multiplayer.worldPresence.reapIdlePresences);

crons.interval("prune world chat", { hours: 1 }, internal.multiplayer.worldChat.pruneOldChatMessages, {});

for (const spec of jgengineCronSpecs({ runtimes: [createLlmvilleRuntime()] })) {
  if (spec.module === "runtime") crons.interval(spec.name, { seconds: spec.intervalSeconds }, internal.jgengine.runtime[spec.functionKey as "flushDirtyServers" | "tickActiveServers"]);
}
crons.interval("prune rate windows", { hours: 1 }, internal.clientErrors.pruneRateLimits, {});

export default crons;
