import { useDeferredValue, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let swaps = 0;

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mark a place change in progress until the returned function runs. */
function holdSceneSwap(): () => void {
  swaps += 1;
  if (swaps === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    swaps = Math.max(0, swaps - 1);
    if (swaps === 0) notify();
  };
}

/**
 * The place to draw, trailing `wanted` while React builds the new place in the background; the
 * swap stays marked (see {@link useSceneSwapping}) from the change until the build is in and
 * `prepare()` has settled. Use `useSceneSwap` (`@jgengine/core/render/sceneSwap.draw`), which
 * prepares by compiling the new place's shaders. @internal
 */
export function useDeferredSwap<T>(wanted: T, prepare: () => Promise<unknown>): T {
  const shown = useDeferredValue(wanted);
  const pending = !Object.is(shown, wanted);
  const held = useRef<(() => void) | null>(null);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  // A layout effect, so the card is up before the next frame draws the old place from the new camera.
  useLayoutEffect(() => {
    if (pending) {
      held.current ??= holdSceneSwap();
      return;
    }
    const release = held.current;
    if (release === null) return;
    let live = true;
    void prepareRef.current().catch(() => undefined).then(() => {
      if (!live || held.current !== release) return;
      held.current = null;
      release();
    });
    return () => {
      live = false;
    };
  }, [pending]);
  useEffect(() => () => {
    held.current?.();
    held.current = null;
  }, []);
  return shown;
}

/**
 * True while a `useSceneSwap` is still building or compiling its new place: paint the travel card,
 * opaque, over the canvas.
 * @capability scene-swap-card know when to show a travel card while the next place builds behind it
 */
export function useSceneSwapping(): boolean {
  return useSyncExternalStore(subscribe, sceneSwapping, () => false);
}

/** True while a scene swap's card is up, outside React (the frame breakdown marks stalls drawn behind it). */
export function sceneSwapping(): boolean {
  return swaps > 0;
}
