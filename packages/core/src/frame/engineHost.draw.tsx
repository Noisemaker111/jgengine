import { createContext, useContext, type ReactNode } from "react";

import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";

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
