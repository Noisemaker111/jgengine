import { useConvex } from "convex/react";
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";

import { createConvexBackend } from "@jgengine/convex/createConvexBackend";
import type { ShellMultiplayer } from "@jgengine/core/multiplayer/multiplayer.draw";
import { GameHost } from "@jgengine/shell/GameHost";
import { LLMVILLE_GAME_ID } from "@llmville/game/game/runtime/definition";
import { game } from "../../game.config";
import { RackHardwareDragVisualProvider } from "../../infrastructure/rackHardwareDragVisual";
import { LlmvilleSessionProvider, type LlmvilleSessionIdentity } from "../llmvilleSession";
import { TabletNavProvider } from "../../tablet/components/tabletNav";
import { useTabletNav } from "../../tablet/tablet";

/** The shell joins the shared world (`runtime:*`) and carries poses on its presence lane (`presence:*`). */
function useWorldMultiplayer(userId: string): ShellMultiplayer {
  const client = useConvex();
  return useMemo(
    () => ({
      gameId: LLMVILLE_GAME_ID,
      userId,
      backend: createConvexBackend({ client, gameId: LLMVILLE_GAME_ID, userId }),
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
      <RackHardwareDragVisualProvider>
        <TabletNavProvider value={tabletNav}>
          <div ref={containerRef} className="fixed inset-0 overflow-hidden bg-slate-950">
            <GameHost playable={game} gameId={LLMVILLE_GAME_ID} multiplayer={multiplayer} />
          </div>
        </TabletNavProvider>
      </RackHardwareDragVisualProvider>
    </LlmvilleSessionProvider>
  );
}
