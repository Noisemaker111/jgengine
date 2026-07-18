import { useSyncExternalStore } from "react";

import {
  getGlbThumbnailState,
  requestGlbThumbnail,
  subscribeGlbThumbnail,
  type ThumbnailState,
} from "./glbThumbnailCache";

const IDLE: ThumbnailState = { status: "idle", dataUrl: null };

/**
 * Subscribes to the offscreen GLB thumbnail cache for a model URL.
 * Without a URL (catalog markers, generators with no mesh) stays idle so the
 * caller can keep a typed glyph — never invents imagery.
 * @internal
 */
export function useGlbThumbnail(url: string | undefined): ThumbnailState {
  const subscribe = (onStoreChange: () => void) => {
    if (url === undefined || url.length === 0) return () => {};
    requestGlbThumbnail(url);
    return subscribeGlbThumbnail(url, onStoreChange);
  };
  const getSnapshot = () => getGlbThumbnailState(url);
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}
