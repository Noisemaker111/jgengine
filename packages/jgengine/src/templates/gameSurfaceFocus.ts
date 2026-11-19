export interface FocusableElement {
  focus(options?: { preventScroll?: boolean }): void;
  closest?(selector: string): FocusableElement | null;
}

export interface FocusableDocument {
  querySelector(selector: string): FocusableElement | null;
  readonly activeElement: FocusableElement | null;
}

/**
 * Keep a focused UI control as the key target, otherwise focus the game's input
 * surface. Prefers the focusable ancestor of the play `canvas` (3D games), then
 * falls back to the first `[tabindex]` element (HUD-only games share the same
 * wrapper). Returns `true` when a surface is now the active element.
 *
 * Self-contained by contract — serialised into the page via `.toString()`; do
 * not reference module-scope identifiers from inside this function.
 */
export function focusGameSurface(doc: FocusableDocument): boolean {
  const active = doc.activeElement;
  if (active?.closest?.(":is(input, textarea, select, button, a[href], [contenteditable=true], [role=button], [role=tab], [tabindex]):not(body):not(html)") != null) return true;
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

export function mouseButtonForCode(code: string): { button: "left" | "middle" | "right"; buttons: number } | null {
  if (code === "mouse0") return { button: "left", buttons: 1 };
  if (code === "mouse1") return { button: "middle", buttons: 4 };
  if (code === "mouse2") return { button: "right", buttons: 2 };
  return null;
}

/**
 * Centre of the play canvas in CSS viewport pixels, or `null` without one: where a held mouse
 * button lands. Self-contained for browser serialization.
 */
export function gameSurfaceCenter(doc: { querySelector(selector: string): { getBoundingClientRect(): { left: number; top: number; width: number; height: number } } | null }): { x: number; y: number } | null {
  const canvas = doc.querySelector("canvas");
  if (canvas === null) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}
