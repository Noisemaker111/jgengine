import { useEffect, useSyncExternalStore } from "react";

/** A page-wide declaration that some surface paints over the whole game canvas. */
export interface CanvasCover {
  /** True while at least one surface covers the canvas. */
  covered(): boolean;
  /** How many surfaces currently hold the cover. */
  holders(): number;
  subscribe(listener: () => void): () => void;
  /**
   * Declare the canvas fully covered until the returned function runs. Calling it twice declares
   * twice; the cover lifts when the last hold releases.
   */
  hold(): () => void;
}

const listeners = new Set<() => void>();
let holders = 0;

function notifyIfPresenceChanged(previous: number, next: number): void {
  if (previous > 0 === next > 0) return;
  for (const listener of [...listeners]) listener();
}

/**
 * The page's canvas cover. A full-screen menu (or a game's own opaque overlay) holds it; the
 * shell stops drawing the world, its shadow passes and postfx while it is held, and draws again
 * from the untouched scene when it lifts. A translucent scrim or a side panel must not hold it —
 * anything the scene shows through has to keep drawing.
 *
 * @capability canvas-cover stop world rendering behind a full-screen surface while input, audio, the HUD and the menu keep running
 */
export const canvasCover: CanvasCover = {
  covered: () => holders > 0,
  holders: () => holders,
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  hold() {
    const previous = holders;
    holders += 1;
    notifyIfPresenceChanged(previous, holders);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const was = holders;
      holders = Math.max(0, holders - 1);
      notifyIfPresenceChanged(was, holders);
    };
  },
};

/** Declare the canvas fully covered while `declared` is true, and release on unmount. */
export function useCanvasCover(declared: boolean): void {
  useEffect(() => {
    if (!declared) return;
    return canvasCover.hold();
  }, [declared]);
}

/** True while a surface covers the canvas. */
export function useCanvasCovered(): boolean {
  return useSyncExternalStore(canvasCover.subscribe, canvasCover.covered, () => false);
}
