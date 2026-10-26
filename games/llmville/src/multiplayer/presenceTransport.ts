import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type {
  PresenceActions as EnginePresenceActions,
  PresenceFeeds as EnginePresenceFeeds,
  PresenceSession as EnginePresenceSession,
  PresenceTransport as EnginePresenceTransport,
  PresenceResidentRow,
} from "@jgengine/core/multiplayer/presenceContract";

export interface WorldPresenceRow extends PresenceResidentRow {
  presenceId: string;
  kind: "human" | "bot";
  actorExternalId: string;
  gameId: Id<"games">;
  label: string | null;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch?: number;
  online?: boolean;
}

export interface MyPresenceLocation {
  position: { x: number; y: number; z: number };
  rotationY: number;
}

export type WorldPresenceSession = EnginePresenceSession<Id<"games">>;
export type WorldPresenceFeeds = EnginePresenceFeeds<WorldPresenceRow, MyPresenceLocation>;
export type WorldPresenceActions = EnginePresenceActions<Id<"games">>;
export type WorldPresenceTransport = EnginePresenceTransport<WorldPresenceRow, MyPresenceLocation, Id<"games">>;
