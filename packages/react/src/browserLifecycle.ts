import { useEffect, useRef } from "react";

/** Browser events that can interrupt active play. The caller decides whether to pause. */
export type BrowserSuspensionReason = "blur" | "hidden" | "pointer-lock-lost";

/** Select suspension events; all are observed by default. No callback runs on attachment. */
export interface BrowserSuspensionOptions {
  blur?: boolean;
  hidden?: boolean;
  pointerLockLost?: boolean;
}

/** Event sources for a browser window, an iframe, or a test. */
export interface BrowserSuspensionSources {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
    readonly hidden: boolean;
    readonly pointerLockElement: Element | null;
  };
}

/**
 * Observe interruption events until detached. Lock loss requires a preceding lock; SSR attaches nothing.
 * @capability browser-suspension-observer observe browser interruptions outside React with caller-owned pause policy and event sources
 */
export function observeBrowserSuspension(
  onSuspend: (reason: BrowserSuspensionReason) => void,
  options: BrowserSuspensionOptions = {},
  sources: BrowserSuspensionSources | null = typeof window === "undefined" || typeof document === "undefined" ? null : { window, document },
): () => void {
  if (sources === null) return () => {};
  const { window: win, document: doc } = sources;
  let locked = doc.pointerLockElement !== null;
  const blur = () => onSuspend("blur");
  const visibility = () => { if (doc.hidden) onSuspend("hidden"); };
  const lock = () => {
    const next = doc.pointerLockElement !== null;
    const lost = locked && !next;
    locked = next;
    if (lost) onSuspend("pointer-lock-lost");
  };
  if (options.blur !== false) win.addEventListener("blur", blur);
  if (options.hidden !== false) doc.addEventListener("visibilitychange", visibility);
  if (options.pointerLockLost !== false) doc.addEventListener("pointerlockchange", lock);
  return () => {
    win.removeEventListener("blur", blur);
    doc.removeEventListener("visibilitychange", visibility);
    doc.removeEventListener("pointerlockchange", lock);
  };
}

/**
 * Observe browser interruptions while mounted, invoking the latest callback without replacing listeners.
 * @capability browser-suspension observe blur, hidden-page and pointer-lock loss while the game owns pause and input policy
 */
export function useBrowserSuspension(onSuspend: (reason: BrowserSuspensionReason) => void, options: BrowserSuspensionOptions = {}): void {
  const callback = useRef(onSuspend);
  useEffect(() => { callback.current = onSuspend; }, [onSuspend]);
  const { blur, hidden, pointerLockLost } = options;
  useEffect(() => observeBrowserSuspension((reason) => callback.current(reason), { blur, hidden, pointerLockLost }), [blur, hidden, pointerLockLost]);
}
