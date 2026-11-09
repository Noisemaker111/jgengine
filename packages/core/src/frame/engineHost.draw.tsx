import { createContext, useContext, type ReactNode } from "react";

import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";

/**
 * The render host a React subtree draws through. Two hosts exist while the
 * migration lands: `R3FEngineHost` inside a Canvas (r3f still renders) and the
 * engine loop's provider (plain three.js). Draw wrappers read `frame` for the
 * {@link EngineFrameState} facade and the optional controls for the few
 * frameloop APIs r3f exposed; `r3f` tells JSX bridges whether a reconciler
 * parents their objects or they must attach to the scene themselves.
 */
export interface EngineHost {
  readonly frame: EngineFrameState;
  /** True while r3f's reconciler parents scene objects; false under the engine loop. */
  readonly r3f: boolean;
  /** r3f's `advance(elapsed, true)`: render one frame now under `frameloop="never"`. */
  advance?(elapsed?: number): void;
  setFrameloop?(mode: EngineFrameloop): void;
  /** Engine loop only: cap rendered fps (0 uncaps). r3f has no equivalent. */
  setFpsLimit?(fps: number): void;
}

const EngineHostContext = createContext<EngineHost | null>(null);

/**
 * Transitional fallback while the Canvas still owns rendering: `FrameBoardPump`
 * binds the r3f host here so test roots that render the pump as a *sibling* of
 * the components under test (no provider ancestor) still resolve a host.
 * Context always wins; the probe exists only for roots that cannot wrap their
 * tree. Deleted with the pump when the Canvas is gone.
 * @internal
 */
let engineHostProbe: (() => EngineHost) | null = null;

/** @internal */
export function bindEngineHostProbe(probe: (() => EngineHost) | null): void {
  engineHostProbe = probe;
}

/** Provide the render host to a React subtree. @internal */
export function EngineHostProvider({ host, children }: { host: EngineHost; children?: ReactNode }) {
  return <EngineHostContext.Provider value={host}>{children}</EngineHostContext.Provider>;
}

/**
 * The nearest render host. Throws when absent: every draw wrapper and scene
 * consumer runs inside either `R3FEngineHost`/`EngineHostProvider` or a root
 * with `FrameBoardPump`, so a missing host is a composition bug.
 * @internal
 */
export function useEngineHost(): EngineHost {
  const host = useContext(EngineHostContext) ?? engineHostProbe?.() ?? null;
  if (host === null) {
    throw new Error("useEngineHost: no EngineHostProvider or FrameBoardPump above this component");
  }
  return host;
}
