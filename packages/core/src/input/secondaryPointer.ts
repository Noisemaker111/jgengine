/** What the shell needs from a `contextmenu` event to decide whether the browser's menu may open. */
export interface ContextMenuEventLike {
  target: EventTarget | null;
  preventDefault(): void;
}

const EDITABLE = "input,textarea,select,[contenteditable=''],[contenteditable='true']";

/**
 * Right-click never opens the browser's own menu over a game: the right button belongs to the camera
 * (right-drag orbits) and to the game's secondary action. Text fields keep the native menu so the player
 * can still paste a name or a code. Returns true when the menu was suppressed.
 * @internal
 */
export function suppressBrowserContextMenu(event: ContextMenuEventLike): boolean {
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (target !== null && typeof target.closest === "function" && target.closest(EDITABLE) !== null) return false;
  event.preventDefault();
  return true;
}

/**
 * True when a right-button press travelled far enough before release to count as a camera drag, so the
 * release must not also fire the game's right-click action.
 * @internal
 */
export function isSecondaryDrag(
  start: { x: number; y: number } | null,
  end: { x: number; y: number },
  thresholdPx: number,
): boolean {
  if (start === null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy > thresholdPx * thresholdPx;
}
