import { useConvex } from "convex/react";
import { useEffect, useMemo } from "react";

import { createConvexGameTransport } from "@jgengine/convex/createConvexGameTransport";
import type { ShellMultiplayer } from "@jgengine/core/multiplayer/multiplayer.draw";
import type { PresenceSync } from "@jgengine/core/runtime/transport";
import { GameHost } from "@jgengine/shell/GameHost";
import { api } from "@llmville/backend/convex/_generated/api";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import { game } from "@/game.config";
import { RackHardwareDragVisualProvider } from "@/infrastructure/rackHardwareDragVisual";
import { LlmvilleSessionProvider, type LlmvilleSessionIdentity } from "@/runtime/llmvilleSession";
import { convexPresenceTransport } from "@/multiplayer/convexPresenceTransport";
import { PresenceTransportProvider } from "@/multiplayer/PresenceTransportProvider";
import { TabletNavProvider } from "@/tablet/components/tabletNav";
import { useTabletNav } from "@/tablet/tablet";

// framework-ok: player poses ride LLMville's world presence tables until milestone 6 moves them onto the engine's presence rows.
const POSES_ON_WORLD_PRESENCE: PresenceSync = {
  subscribe: () => () => undefined,
  syncPose: () => undefined,
};

/** The shell joins the shared world server; poses and chat stay on LLMville's own tables for now. */
function useWorldMultiplayer(userId: string): ShellMultiplayer {
  const client = useConvex();
  return useMemo(
    () => ({
      gameId: LLMVILLE_GAME_ID,
      userId,
      backend: {
        transport: createConvexGameTransport(client, { runtime: api.jgengine.runtime }, { gameId: LLMVILLE_GAME_ID, userId }),
        presenceSync: POSES_ON_WORLD_PRESENCE,
        pushFeedEntry: async () => undefined,
      },
      feedActions: [],
    }),
    [client, userId],
  );
}

export function GameSession({ user, convexUser, gameId }: LlmvilleSessionIdentity) {
  const identity = useMemo(() => ({ user, convexUser, gameId }), [user.id, user.name, convexUser, gameId]);
  const { nav: tabletNav, containerRef } = useTabletNav({ gameId: identity.gameId });
  const multiplayer = useWorldMultiplayer(identity.user.id);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = game.game.name;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <LlmvilleSessionProvider identity={identity} tabletNav={tabletNav} containerRef={containerRef}>
      <PresenceTransportProvider transport={convexPresenceTransport}>
        <RackHardwareDragVisualProvider>
          <TabletNavProvider value={tabletNav}>
            <div ref={containerRef} className="fixed inset-0 overflow-hidden bg-slate-950">
              <GameHost playable={game} gameId={LLMVILLE_GAME_ID} multiplayer={multiplayer} />
            </div>
          </TabletNavProvider>
        </RackHardwareDragVisualProvider>
      </PresenceTransportProvider>
    </LlmvilleSessionProvider>
  );
}
