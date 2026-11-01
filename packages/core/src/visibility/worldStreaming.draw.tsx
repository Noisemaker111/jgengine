// @skill jgengine-world
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { devtools } from "@jgengine/core/devtools/devtools";
import { staticDrawPoolFor } from "@jgengine/core/instancing/staticDrawPool.draw";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { useGameContext } from "@jgengine/react/provider";
import { boundWorldStreaming, type WorldStreaming } from "./worldStreaming";

const fetched = new Map<string, Promise<void>>();

/** Fetch a model file once into the browser cache and start its parse, off the frame. */
function fetchModel(url: string): Promise<void> {
  let known = fetched.get(url);
  if (known === undefined) {
    known = (typeof fetch === "undefined" ? Promise.resolve() : fetch(url).then((response) => response.arrayBuffer()).then(() => undefined))
      .catch(() => undefined)
      .then(() => useLoader.preload(sharedGltfLoader, url));
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
export function WorldStreamingDriver({ modelUrls }: { modelUrls: () => readonly string[] }) {
  const ctx = useGameContext();
  const scene = useThree((state) => state.scene);
  const pool = staticDrawPoolFor(scene);
  const attached = useRef<{ streaming: WorldStreaming; detach: () => void } | null>(null);
  const urls = useRef(modelUrls);
  urls.current = modelUrls;
  useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
      pool.holdProxies(null);
    },
    [pool],
  );
  useEffect(
    () =>
      devtools.probes.registerSystem("render/streaming", {
        counters: () => ({ ...(boundWorldStreaming(ctx)?.stats() ?? {}) }),
        state: () => {
          const stats = boundWorldStreaming(ctx)?.stats();
          return stats === undefined ? "off" : `${stats.ready}/${stats.cells} cells ready · ${stats.loading} loading · ${stats.leaving} leaving · ${stats.warming} warming · ${stats.lastTickMs.toFixed(2)} ms tick`;
        },
      }),
    [ctx],
  );
  useFrame(() => {
    const streaming = boundWorldStreaming(ctx);
    if (attached.current?.streaming !== streaming) {
      attached.current?.detach();
      attached.current = null;
      pool.holdProxies(null);
      if (streaming !== null) {
        const detach = streaming.attachRenderer({ prepare: () => Promise.all(urls.current().map(fetchModel)).then(() => undefined) });
        attached.current = { streaming, detach };
        pool.holdProxies((x, z) => streaming.holdsProxy(x, z));
      }
    }
    if (streaming === null) return;
    for (const cell of streaming.leaving()) {
      const bounds = streaming.boundsOf(cell);
      if (pool.proxiesSettledIn(bounds.min, bounds.max)) streaming.proxyReady(cell);
    }
  }, CAMERA_POST_FRAME_PRIORITY + 0.19);
  return null;
}
