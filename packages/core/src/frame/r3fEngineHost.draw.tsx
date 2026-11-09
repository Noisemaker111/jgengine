import { useStore, type RootStore } from "@react-three/fiber";
import { useMemo, type ReactNode } from "react";

import { EngineHostProvider, type EngineHost } from "./engineHost.draw";
import { liveFrameStateFromR3F } from "./r3fFrameState.draw";

/**
 * Build the {@link EngineHost} over an r3f root store: the frame facade reads
 * the store live, and the controls forward to r3f's `advance`/`setFrameloop`.
 * Shared by {@link R3FEngineHost} (explicit provider) and `FrameBoardPump`
 * (the sibling-root probe fallback).
 * @internal
 */
export function r3fEngineHostFromStore(store: RootStore): EngineHost {
  const get = () => store.getState();
  return {
    frame: liveFrameStateFromR3F(get),
    r3f: true,
    advance: (elapsed?: number) => {
      const state = get();
      state.advance(elapsed ?? state.clock.elapsedTime, true);
    },
    setFrameloop: (mode) => get().setFrameloop(mode),
  };
}

/**
 * Provides the {@link EngineHost} for a React subtree inside an r3f Canvas.
 * Mount it as the Canvas's first child so every draw wrapper and scene
 * consumer below it sees the host; the engine loop replaces this provider
 * when the Canvas is gone.
 * @internal
 */
export function R3FEngineHost({ children }: { children?: ReactNode }) {
  const store = useStore();
  const host = useMemo(() => r3fEngineHostFromStore(store), [store]);
  return <EngineHostProvider host={host}>{children}</EngineHostProvider>;
}
