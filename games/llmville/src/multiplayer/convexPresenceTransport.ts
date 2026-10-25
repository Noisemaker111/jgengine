import { createConvexPresenceTransport } from "@jgengine/convex/convexPresenceTransport";
import { api } from "@llmville/backend/convex/_generated/api";
import type { MyPresenceLocation, WorldPresenceRow } from "./presenceTransport";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";

export const convexPresenceTransport = createConvexPresenceTransport<WorldPresenceRow, WorldPresenceRow, MyPresenceLocation, Id<"games">>(
  {
    snapshot: api.multiplayer.worldPresence.snapshot,
    cityResidents: api.multiplayer.worldPresence.cityResidents,
    ensurePresence: api.multiplayer.worldPresence.ensureHumanPresence,
    leavePresence: api.multiplayer.worldPresence.leaveHumanPresence,
    tick: api.multiplayer.worldPresence.tick,
  },
  (row) => row,
);
