import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { useServerSession } from "@jgengine/react/useServerSession";
import { createConvexGameTransport } from "@jgengine/convex/createConvexGameTransport";
import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";

export type WorldJoinStatus = "joining" | "joined" | "failed";
export interface WorldServerSession {
  serverId: Id<"jgGameServers"> | null;
  status: WorldJoinStatus;
  failureReason: string | null;
  retry: () => void;
}
const WorldServerSessionContext = createContext<WorldServerSession>({ serverId: null, status: "joining", failureReason: null, retry: () => {} });
export function useWorldServerSession(playerId: string): WorldServerSession {
  const client = useConvex();
  const transport = useMemo(() => createConvexGameTransport(client, { runtime: api.jgengine.runtime }, { gameId: LLMVILLE_GAME_ID, userId: playerId }), [client, playerId]);
  const session = useServerSession(transport, LLMVILLE_GAME_ID);
  return { ...session, serverId: session.serverId as Id<"jgGameServers"> | null };
}
export function WorldServerSessionProvider({ playerId, children }: { playerId: string; children: ReactNode }) {
  const session = useWorldServerSession(playerId);
  return <WorldServerSessionContext.Provider value={session}>{children}</WorldServerSessionContext.Provider>;
}
export function useWorldServer(): WorldServerSession { return useContext(WorldServerSessionContext); }
