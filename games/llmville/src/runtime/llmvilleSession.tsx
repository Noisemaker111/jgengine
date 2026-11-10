import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode, type RefObject } from "@jgengine/core/ui/jsx";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { TabletNavState } from "@/tablet/tablet";
import type { WorldSceneProps } from "@/scene/components/GameScene";

/** Who is playing which world: what the route knows before the shell mounts. */
export interface LlmvilleSessionIdentity {
  user: { id: string; name: string | null };
  convexUser: { displayName: string; avatarId?: string | null } | null;
  gameId: Id<"games">;
}

/** The latest world props the HUD derived, read by the scene inside the shell's canvas. */
export interface WorldSceneFeed {
  read(): WorldSceneProps | null;
  publish(props: WorldSceneProps | null): void;
  subscribe(listener: () => void): () => void;
}

function createWorldSceneFeed(): WorldSceneFeed {
  let current: WorldSceneProps | null = null;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    publish(props) {
      if (props === current) return;
      current = props;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface LlmvilleSession extends LlmvilleSessionIdentity {
  tabletNav: TabletNavState;
  containerRef: RefObject<HTMLDivElement | null>;
  scene: WorldSceneFeed;
}

const LlmvilleSessionContext = createContext<LlmvilleSession | null>(null);

/** Shares one session with both shell trees: the HUD (`GameUI`) and the scene (`WorldOverlay`). */
export function LlmvilleSessionProvider({
  identity,
  tabletNav,
  containerRef,
  children,
}: {
  identity: LlmvilleSessionIdentity;
  tabletNav: TabletNavState;
  containerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const scene = useMemo(createWorldSceneFeed, [identity.gameId, identity.user.id]);
  const value = useMemo(
    () => ({ ...identity, tabletNav, containerRef, scene }),
    [identity, tabletNav, containerRef, scene],
  );
  return <LlmvilleSessionContext.Provider value={value}>{children}</LlmvilleSessionContext.Provider>;
}

export function useLlmvilleSession(): LlmvilleSession {
  const session = useContext(LlmvilleSessionContext);
  if (session === null) throw new Error("LLMville: the game UI mounted outside LlmvilleSessionProvider");
  return session;
}

export function useWorldSceneProps(): WorldSceneProps | null {
  const { scene } = useLlmvilleSession();
  return useSyncExternalStore(scene.subscribe, scene.read, scene.read);
}
