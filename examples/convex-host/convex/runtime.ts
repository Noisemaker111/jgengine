import { createGameServerFunctions } from "@jgengine/convex/server";

export const {
  joinServer,
  leaveServer,
  runCommand,
  flushSave,
  getServer,
  getPlayerProfile,
  getFeed,
  pushFeedEntry,
  listOpenServers,
  tickActiveServers,
  flushDirtyServers,
} = createGameServerFunctions({ auth: "anonymous" });
