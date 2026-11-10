// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";

import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { staticDrawPoolFor, type StaticDrawPool } from "@jgengine/core/instancing/staticDrawPool.draw";
import { preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import { useGameContext } from "@jgengine/react/provider";
import { boundCellStreaming, type CellStreaming } from "./cellStreaming";

const fetched = new Map<string, Promise<void>>();

/** Fetch a model file once into the browser cache and start its parse, off the frame. */
function fetchModel(url: string): Promise<void> {
  let known = fetched.get(url);
  if (known === undefined) {
    known = (typeof fetch === "undefined" ? Promise.resolve() : fetch(resolveAssetBaseUrl(url)).then((response) => response.arrayBuffer()).then(() => undefined))
      .catch(() => undefined)
      .then(() => preloadSceneModel(url).then(() => undefined));
    fetched.set(url, known);
  }
  return known;
}

/**
 * Draw a game's streamed cells: hold cells that are not ready on their far proxy, tell streaming when a
 * leaving cell's proxy is built so its props can go, and fetch every object model before a cell's
 * content is placed back. Mounted by the world scene; does nothing until a game binds its streaming.
 * @internal
 */
export function cellStreamingDraw(ctx: GameContext, getModelUrls: () => readonly string[]): EngineDraw {
  let pool: StaticDrawPool | null = null;
  let attached: { streaming: CellStreaming; detach: () => void } | null = null;
  let unregisterProbe: (() => void) | null = null;
  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.19,
    mount(state: EngineFrameState) {
      pool = staticDrawPoolFor(state.scene);
      unregisterProbe = devtools.probes.registerSystem("render/streaming", {
        counters: () => ({ ...(boundCellStreaming(ctx)?.stats() ?? {}) }),
        state: () => {
          const stats = boundCellStreaming(ctx)?.stats();
          return stats === undefined ? "off" : `${stats.ready}/${stats.cells} cells ready · ${stats.loading} loading · ${stats.leaving} leaving · ${stats.warming} warming · ${stats.lastTickMs.toFixed(2)} ms tick`;
        },
      });
    },
    frame(_state: EngineFrameState) {
      if (pool === null) return;
      const streaming = boundCellStreaming(ctx);
      if (attached?.streaming !== streaming) {
        attached?.detach();
        attached = null;
        pool.holdProxies(null);
        if (streaming !== null) {
          const detach = streaming.attachRenderer({ prepare: () => Promise.all(getModelUrls().map(fetchModel)).then(() => undefined) });
          attached = { streaming, detach };
          pool.holdProxies((x, z) => streaming.holdsProxy(x, z));
        }
      }
      if (streaming === null) return;
      for (const cell of streaming.leaving()) {
        const bounds = streaming.boundsOf(cell);
        if (pool.proxiesSettledIn(bounds.min, bounds.max)) streaming.proxyReady(cell);
      }
    },
    dispose(_state: EngineFrameState) {
      attached?.detach();
      attached = null;
      pool?.holdProxies(null);
      pool = null;
      unregisterProbe?.();
      unregisterProbe = null;
    },
  };
}

/**
 * Draw a game's streamed cells: hold cells that are not ready on their far proxy, tell streaming when a
 * leaving cell's proxy is built so its props can go, and fetch every object model before a cell's
 * content is placed back. Mounted by the world scene; does nothing until a game binds its streaming.
 * @internal
 */
export function CellStreamingDriver({ modelUrls }: { modelUrls: () => readonly string[] }) {
  const ctx = useGameContext();
  const urls = useRef(modelUrls);
  urls.current = modelUrls;
  useEngineDraw(() => cellStreamingDraw(ctx, () => urls.current()), [ctx]);
  return null;
}
