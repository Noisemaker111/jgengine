/** @jsxImportSource @jgengine/core/ui/jsx */
import { ConvexProvider } from "convex/react";
import { useEffect, useMemo, type ComponentType } from "@jgengine/core/ui/jsx";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { LlmvilleBackend } from "../../app";
import { createConvexClient } from "../../auth/convexClient";
import { onContextDispose } from "@jgengine/core/runtime/contextDisposal";
import { perContext } from "@jgengine/core/runtime/perContext";
import { useGameContext } from "@jgengine/ui/provider";
import { usePlayerIdentity } from "../../auth";
import { RackHardwareDragVisualProvider } from "../../infrastructure/rackHardwareDragVisual";
import { TabletNavProvider } from "../../tablet/components/tabletNav";
import { useTabletNav } from "../../tablet/tablet";
import { LlmvilleSessionProvider, WorldSceneFeedProvider, createWorldSceneFeed } from "../llmvilleSession";
import { LlmvilleGameUI } from "./LlmvilleGameUI";

const hostedBackend = perContext((ctx) => {
  const client = createConvexClient();
  onContextDispose(ctx, () => void client.close());
  return { client, scene: createWorldSceneFeed() };
});

/** The world a host opens: `?world=<id>` when the page names one, the signed-in player's otherwise unknown one. */
function hostedWorldId(): Id<"games"> {
  // type-escape: a query value becomes a Convex id only here; the world query rejects one that is not a game.
  return (new URLSearchParams(window.location.search).get("world") ?? "") as Id<"games">;
}

function HostedSession({ scene }: { scene: ReturnType<typeof createWorldSceneFeed> }) {
  const { playerId, playerName } = usePlayerIdentity();
  const gameId = useMemo(hostedWorldId, []);
  const identity = useMemo(
    () => ({ user: { id: playerId, name: playerName }, convexUser: null, gameId }),
    [playerId, playerName, gameId],
  );
  const { nav, containerRef } = useTabletNav({ gameId });
  useEffect(() => {
    // The shell's canvas is not under the HUD here, so pointer-lock focus looks from the page's root.
    const root = document.getElementById("root");
    if (root instanceof HTMLDivElement) containerRef.current = root;
  }, [containerRef]);

  return (
    <LlmvilleSessionProvider identity={identity} tabletNav={nav} containerRef={containerRef} scene={scene}>
      <RackHardwareDragVisualProvider>
        <TabletNavProvider value={nav}>
          <LlmvilleGameUI />
        </TabletNavProvider>
      </RackHardwareDragVisualProvider>
    </LlmvilleSessionProvider>
  );
}

export function HostedGameUI() {
  const { client, scene } = hostedBackend(useGameContext());
  return (
    <LlmvilleBackend client={client}>
      <HostedSession scene={scene} />
    </LlmvilleBackend>
  );
}

export function hostedScenePart<Props extends object>(Part: ComponentType<Props>): ComponentType<Props> {
  return function HostedScenePart(props: Props) {
    const { client, scene } = hostedBackend(useGameContext());
    return (
      <ConvexProvider client={client}>
        <WorldSceneFeedProvider scene={scene}>
          <Part {...props} />
        </WorldSceneFeedProvider>
      </ConvexProvider>
    );
  };
}
