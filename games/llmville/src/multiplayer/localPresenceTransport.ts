import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { createLocalPresenceTransport } from "@jgengine/core/multiplayer/presenceContract";
import type { MyPresenceLocation, PresenceTransport, WorldPresenceRow } from "@/multiplayer/presenceTransport";

const local = createLocalPresenceTransport<WorldPresenceRow, MyPresenceLocation, Id<"games">>();

export const localPresenceTransport: PresenceTransport = local.transport;
export const localPresenceActions = local.actions;
