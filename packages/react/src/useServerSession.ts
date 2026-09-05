import { useCallback, useEffect, useState } from "react";
import type { GameRuntimeTransport } from "@jgengine/core/runtime/transport";

/**
 * Joins a host and exposes a retryable blocking state until membership is confirmed.
 * @capability server-session join a multiplayer host with status, retry, and teardown
 */
export function useServerSession(transport: GameRuntimeTransport, gameId: string, preferredServerId?: string) {
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<{ serverId: string | null; status: "joining" | "joined" | "failed"; failureReason: string | null }>({ serverId: null, status: "joining", failureReason: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let disposed = false;
    let serverId: string | null = null;
    setSession({ serverId: null, status: "joining", failureReason: null });
    void transport.joinServer({ gameId, serverId: preferredServerId }).then((result) => {
      if (!result.ok) {
        if (!disposed) setSession({ serverId: null, status: "failed", failureReason: result.reason });
        return;
      }
      if (disposed) {
        void transport.leaveServer({ serverId: result.serverId }).catch(() => undefined);
        return;
      }
      serverId = result.serverId;
      setSession({ serverId, status: "joined", failureReason: null });
    }).catch((error: unknown) => {
      if (!disposed) setSession({ serverId: null, status: "failed", failureReason: error instanceof Error ? error.message : "Connection failed" });
    });
    return () => {
      disposed = true;
      if (serverId !== null) void transport.leaveServer({ serverId }).catch(() => undefined);
    };
  }, [transport, gameId, preferredServerId, attempt]);
  return { ...session, retry };
}
