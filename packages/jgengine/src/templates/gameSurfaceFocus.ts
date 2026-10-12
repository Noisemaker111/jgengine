/**
 * The shell's focusable canvas wrapper owns play keyboard events. Browser
 * drivers restore its focus before key holds. Helpers remain self-contained
 * for serialization into the page with `.toString()`.
 */

/** Minimal focusable element shape (browser `HTMLElement` satisfies it). */
export interface FocusableElement {
  focus(options?: { preventScroll?: boolean }): void;
  closest?(selector: string): FocusableElement | null;
}

/** Minimal document shape (browser `Document` satisfies it). */
export interface FocusableDocument {
  querySelector(selector: string): FocusableElement | null;
  readonly activeElement: FocusableElement | null;
}

/**
 * Focus the game's key-input surface so CDP-dispatched keys reach the play-mode
 * handler. Prefers the focusable ancestor of the play `canvas` (3D games), then
 * falls back to the first `[tabindex]` element (HUD-only games share the same
 * wrapper). Returns `true` when a surface is now the active element.
 *
 * Self-contained by contract — serialised into the page via `.toString()`; do
 * not reference module-scope identifiers from inside this function.
 */
export function focusGameSurface(doc: FocusableDocument): boolean {
  const canvas = doc.querySelector("canvas");
  const viaCanvas =
    canvas !== null && typeof canvas.closest === "function" ? canvas.closest("[tabindex]") : null;
  const target = viaCanvas ?? doc.querySelector("[tabindex]");
  if (target === null) return false;
  target.focus({ preventScroll: true });
  return doc.activeElement === target;
}

/**
 * Release after the requested duration and a rendered frame, or at the hard cap
 * when rendering stalls. Self-contained for browser serialization.
 */
export function holdComplete(input: {
  nowMs: number;
  deadlineMs: number;
  hardCapMs: number;
  framesElapsed: number;
}): boolean {
  if (input.nowMs >= input.hardCapMs) return true;
  return input.nowMs >= input.deadlineMs && input.framesElapsed >= 1;
}
