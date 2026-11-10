import { createContext, useCallback, useContext, type ReactNode } from "react";

import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";
import { joinFrameTask, type FrameTask } from "./frameBoard.draw";

/**
 * The render host a React subtree draws through: the engine loop's provider.
 * Draw wrappers read `frame` for the {@link EngineFrameState} facade; the
 * optional controls cover the frameloop APIs drivers use.
 */
export interface EngineHost {
  readonly frame: EngineFrameState;
  /** r3f's `advance(elapsed, true)`: render one frame now under `frameloop="never"`. */
  advance?(elapsed?: number): void;
  setFrameloop?(mode: EngineFrameloop): void;
  /** Cap rendered fps (0 uncaps). */
  setFpsLimit?(fps: number): void;
}

const EngineHostContext = createContext<EngineHost | null>(null);

/** Provide the render host to a React subtree. @internal */
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

/**
 * `joinFrameTask` for a component's effects, bound to the canvas the component renders under: a
 * task joined through it runs on that canvas's loop, with its camera and scene, even when other
 * canvases share the page. Outside a host it joins the primary loop.
 * @internal
 */
export function useFrameJoin(): (priority: number, task: FrameTask) => () => void {
  const owner = useContext(EngineHostContext)?.frame.frameOwner ?? null;
  return useCallback((priority: number, task: FrameTask) => joinFrameTask(priority, task, owner), [owner]);
}
