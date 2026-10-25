import { createGameServerFunctions } from "@jgengine/convex/server";
import { createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";

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
