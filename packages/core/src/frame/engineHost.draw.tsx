/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useCallback, useContext, type ReactNode } from "@jgengine/core/ui/jsx";

import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";
import { joinFrameTask, type FrameTask } from "./frameBoard.draw";

export interface EngineHost {
  readonly frame: EngineFrameState;
  /** Render one frame now under `frameloop="never"`. */
  advance?(elapsed?: number): void;
  setFrameloop?(mode: EngineFrameloop): void;
  /** Cap rendered fps (0 uncaps). */
  setFpsLimit?(fps: number): void;
}

const EngineHostContext = createContext<EngineHost | null>(null);

/** @internal */
export function EngineHostProvider({ host, children }: { host: EngineHost; children?: ReactNode }) {
  return <EngineHostContext.Provider value={host}>{children}</EngineHostContext.Provider>;
}

/**
 * The nearest render host. Throws when absent: every draw wrapper and scene
 * consumer runs inside `EngineHostProvider`, so a missing host is a
 * composition bug.
 * @internal
 */
export function useEngineHost(): EngineHost {
  const host = useContext(EngineHostContext);
  if (host === null) {
    throw new Error("useEngineHost: no EngineHostProvider above this component");
  }
  return host;
}

/** @internal */
export function useFrameJoin(): (priority: number, task: FrameTask) => () => void {
  const owner = useContext(EngineHostContext)?.frame.frameOwner ?? null;
  return useCallback((priority: number, task: FrameTask) => joinFrameTask(priority, task, owner), [owner]);
}
