/** @jsxImportSource @jgengine/core/ui/jsx */
import { ConvexProvider } from "convex/react";
import { useEffect, useMemo, type ComponentType } from "@jgengine/core/ui/jsx";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { LlmvilleBackend } from "../../app";
import { convexClient } from "../../auth/convexClient";
import { usePlayerIdentity } from "../../auth";
import { RackHardwareDragVisualProvider } from "../../infrastructure/rackHardwareDragVisual";
import { TabletNavProvider } from "../../tablet/components/tabletNav";
import { useTabletNav } from "../../tablet/tablet";
import { LlmvilleSessionProvider, WorldSceneFeedProvider, createWorldSceneFeed } from "../llmvilleSession";
import { LlmvilleGameUI } from "./LlmvilleGameUI";

/**
 * LLMville's world for a host that mounts the shell itself (the dev runner), where nothing wraps the
 * HUD and the scene together: each side brings the backend, and both read one scene feed.
 */
const hostedScene = createWorldSceneFeed();

/** The world a host opens: `?world=<id>` when the page names one, the signed-in player's otherwise unknown one. */
function hostedWorldId(): Id<"games"> {
  // type-escape: a query value becomes a Convex id only here; the world query rejects one that is not a game.
  return (new URLSearchParams(window.location.search).get("world") ?? "") as Id<"games">;
}

function HostedSession() {
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
    <LlmvilleSessionProvider identity={identity} tabletNav={nav} containerRef={containerRef} scene={hostedScene}>
      <RackHardwareDragVisualProvider>
        <TabletNavProvider value={nav}>
          <LlmvilleGameUI />
        </TabletNavProvider>
      </RackHardwareDragVisualProvider>
    </LlmvilleSessionProvider>
  );
}

/** The shell's `GameUI` when a host mounts the shell: the world's HUD with its own backend and session. */
export function HostedGameUI() {
  return (
    <LlmvilleBackend>
      <HostedSession />
    </LlmvilleBackend>
  );
}

/** A scene component for a host-mounted shell: it reads the backend and the scene feed the hosted HUD writes. */
export function hostedScenePart<Props extends object>(Part: ComponentType<Props>): ComponentType<Props> {
  return function HostedScenePart(props: Props) {
    return (
      <ConvexProvider client={convexClient}>
        <WorldSceneFeedProvider scene={hostedScene}>
          <Part {...props} />
        </WorldSceneFeedProvider>
      </ConvexProvider>
    );
  };
}
