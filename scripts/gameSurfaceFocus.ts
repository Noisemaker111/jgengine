/**
 * Play-mode key delivery for the browser drivers (`drive`, playtest).
 *
 * The shell's play-mode key handler is a React `onKeyDown` on the focusable
 * wrapper (`tabIndex={0}`) that owns the game canvas — not a `window` listener.
 * CDP `Input.dispatchKeyEvent` delivers a key to `document.activeElement`, so
 * unless that wrapper is the active element the keydown lands on `document.body`
 * (an *ancestor* of the React root) and never bubbles into the handler — the
 * player never moves. The shell auto-focuses the wrapper on context-ready, but a
 * prior `--click` on a menu/HUD button (or any focus change) moves focus off it,
 * so the driver must re-focus the surface itself before holding a key.
 *
 * {@link focusGameSurface} is intentionally self-contained (no external
 * references) so the driver can serialise it with `.toString()` and evaluate it
 * inside the page. Keep it dependency-free.
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
 * Decide when a frame-aware key hold may release. A held key drives movement one
 * simulation step per rendered frame, but a headless software-GL page can render
 * at a fraction of 1 fps — so a purely wall-clock hold can release before a
 * single frame ticks, leaving the player exactly where it spawned. The driver
 * therefore keeps the key down until the wall-clock budget has elapsed *and* at
 * least one frame rendered under it, bounded by a hard grace cap so a frozen page
 * never hangs the run.
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
