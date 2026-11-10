import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "./engineLoop.draw";
import { childFrameState } from "./engineLoop.draw";

/**
 * One in-flight or settled load per cache key, shared by every draw that asks
 * for it. Rejects are dropped so a later draw can retry.
 */
const loads = new Map<string | symbol, Promise<unknown>>();

/**
 * Drop every cached load (tests, scene teardown). Loads already handed to a
 * live draw keep their result; only the shared promise is forgotten.
 */
export function clearLoadDrawCache(): void {
  loads.clear();
}

export interface LoadDrawOptions<T> {
  /** Start (or join) the load. Called once per cache key. */
  load: () => Promise<T>;
  /**
   * Cache key sharing one load across draws. Defaults to a unique symbol per
   * draw, so every draw loads its own copy unless it opts in.
   */
  key?: string;
  /**
   * Called once the value arrives, with a group to fill. Whatever is added
   * stays until dispose; return a cleanup for non-Object3D resources.
   */
  build: (value: T, parent: THREE.Group) => (() => void) | void;
}

function sharedLoad<T>(cacheKey: string | symbol, load: () => Promise<T>): Promise<T> {
  let promise = loads.get(cacheKey) as Promise<T> | undefined;
  if (promise === undefined) {
    promise = load();
    loads.set(cacheKey, promise);
    promise.catch(() => loads.delete(cacheKey));
  }
  return promise;
}

/**
 * An {@link EngineDraw} that appears when an async load finishes — the
 * engine-side replacement for `useLoader` + `Suspense`. Nothing renders while
 * loading; on resolve `build` fills a group added under the draw's parent.
 * Dispose during flight cancels the mount (the load itself is shared and
 * cannot be aborted).
 */
export function loadDraw<T>({ load, key, build }: LoadDrawOptions<T>): EngineDraw {
  const group = new THREE.Group();
  const cacheKey: string | symbol = key ?? Symbol("loadDraw");
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  let mounted = false;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      mounted = true;
      void sharedLoad(cacheKey, load).then((value) => {
        if (cancelled || !mounted) return;
        const result = build(value, group);
        cleanup = typeof result === "function" ? result : null;
      });
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      state.scene.remove(group);
      cleanup?.();
      cleanup = null;
      group.clear();
    },
  };
}

/**
 * Like {@link loadDraw} but the built content is itself an {@link EngineDraw},
 * so it keeps its own priority/frame/dispose. `build` returns the draw; it is
 * mounted under the load group once the value arrives.
 */
export function loadDrawSystem<T>(options: Omit<LoadDrawOptions<T>, "build"> & { build: (value: T, parent: THREE.Group) => EngineDraw }): EngineDraw {
  const group = new THREE.Group();
  const cacheKey: string | symbol = options.key ?? Symbol("loadDrawSystem");
  let inner: { draw: EngineDraw; state: EngineFrameState } | null = null;
  let cancelled = false;
  let mounted = false;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      mounted = true;
      void sharedLoad(cacheKey, options.load).then((value) => {
        if (cancelled || !mounted) return;
        const draw = options.build(value, group);
        const childState = childFrameState(state, group);
        draw.mount?.(childState);
        inner = { draw, state: childState };
      });
    },
    frame(_state: EngineFrameState) {
      if (inner !== null) inner.draw.frame?.(inner.state, inner.state.delta);
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      if (inner !== null) inner.draw.dispose?.(inner.state);
      inner = null;
      state.scene.remove(group);
      group.clear();
    },
  };
}
