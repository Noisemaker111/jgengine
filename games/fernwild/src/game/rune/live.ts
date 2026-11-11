import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { creaturesView, type CreaturesView } from "../creatures";
import { survivorView, type SurvivorView } from "../survivor";

/** Wall-clock milliseconds a frame read stays fresh: many bound leaves read one view per drawn frame. */
const FRAME_MS = 12;

function frameCached<T>(compute: (ctx: GameContext) => T): (ctx: GameContext) => T {
  const cache = perContext((_ctx: GameContext) => ({ at: -Infinity, value: undefined as T | undefined }));
  return (ctx) => {
    const slot = cache(ctx);
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    if (slot.value === undefined || now - slot.at >= FRAME_MS) {
      slot.value = compute(ctx);
      slot.at = now;
    }
    return slot.value;
  };
}

/** The survivor's view as bound leaves read it: computed at most once a frame. */
export const liveSurvivor: (ctx: GameContext) => SurvivorView = frameCached(survivorView);
/** The aimed, viewed and ridden creature cards as bound leaves read them. */
export const liveCreatures: (ctx: GameContext) => CreaturesView = frameCached(creaturesView);

export const same = <T,>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

const blobs = new Map<string, string>();

/**
 * A `data:` image as a short `blob:` URL, made once per page: the island bake is a 350 KB PNG data URI, which
 * every native spec carrying it would otherwise repeat. Outside a browser the data URI is returned as-is.
 */
export function imageUrl(dataUri: string): string {
  const made = blobs.get(dataUri);
  if (made !== undefined) return made;
  if (typeof URL.createObjectURL !== "function" || typeof atob !== "function" || !dataUri.startsWith("data:")) return dataUri;
  const [head, body = ""] = dataUri.split(",", 2);
  const type = /^data:([^;,]+)/.exec(head ?? "")?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  blobs.set(dataUri, url);
  return url;
}
