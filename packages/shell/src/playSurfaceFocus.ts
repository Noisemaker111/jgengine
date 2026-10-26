/**
 * Focus recovery for the play surface. Gameplay keys are read on the shell's focusable wrapper, so
 * when a focused menu button unmounts (a start screen's "Play", a closed panel's last control) the
 * browser drops focus to `<body>` and WASD silently does nothing until the player clicks the canvas.
 * The one decision: reclaim only when the clicked element is gone from the document and
 * nothing else took focus — a deliberate click elsewhere on the page keeps its focus.
 * @internal
 */
export function shouldReclaimPlayFocus(lost: Element | null, active: Element | null, body: Element | null): boolean {
  if (lost === null || lost.isConnected) return false;
  return active === null || active === body;
}

/** Controls inside these keep focus after a click: keyboard navigation there depends on it. */
const KEEPS_FOCUS = '[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [role="tablist"], [role="grid"], form, [data-jg-keep-focus]';

/**
 * The second decision: a HUD button clicked with the mouse or a finger stays mounted and keeps focus,
 * and the shell ignores gameplay keys while a button has focus (so Space and Enter press it). Return
 * focus to the play surface after such a click, so P, WASD and hotkeys keep working without every game
 * blocking mousedown. Keyboard activation (`detail` 0), dialogs, menus and forms keep their focus.
 * @internal
 */
export function shouldReturnPlayFocus(clicked: Element | null, active: Element | null, surface: Element | null, pointer: boolean): boolean {
  if (!pointer || clicked === null || active === null || surface === null || !clicked.isConnected) return false;
  const control = clicked.closest('button, [role="button"]');
  if (control === null || control !== active || !surface.contains(control)) return false;
  return control.closest(KEEPS_FOCUS) === null;
}

/**
 * Watches clicks (pointer, Enter or Space on a button) and keys (Escape closing a menu) and, right after the update commits, returns focus to `surface()` if the clicked control unmounted and focus fell to the body, or if a pointer click left focus on a HUD button (see {@link shouldReturnPlayFocus}).
 * Chromium moves focus to `<body>` on removal without a `focusout`, so the click is the hook.
 * Returns the cleanup.
 * @internal
 */
export function installPlayFocusReclaim(doc: Document, surface: () => HTMLElement | null): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onClick = (event: MouseEvent) => {
    const clicked = event.target instanceof Element ? event.target : null;
    if (clicked === null) return;
    const pointer = event.detail > 0;
    clearTimeout(timer);
    // React commits a click's update synchronously at the end of the event; a macrotask is enough and,
    // unlike a frame callback, does not stall when the page renders slowly.
    timer = setTimeout(() => {
      const target = surface();
      if (target === null || !target.isConnected) return;
      if (shouldReclaimPlayFocus(clicked, doc.activeElement, doc.body) || shouldReturnPlayFocus(clicked, doc.activeElement, target, pointer)) {
        target.focus({ preventScroll: true });
      }
    });
  };
  // A key can unmount the focused control too: Escape closing the pause menu drops focus to <body>,
  // and the next Escape never reaches the play surface. Watch the element that had focus at key-down.
  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  const onKeyDown = () => {
    const focused = doc.activeElement;
    if (focused === null || focused === doc.body) return;
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => {
      const target = surface();
      if (target === null || !target.isConnected) return;
      if (shouldReclaimPlayFocus(focused, doc.activeElement, doc.body)) target.focus({ preventScroll: true });
    });
  };
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown, true);
  return () => {
    clearTimeout(timer);
    clearTimeout(keyTimer);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
  };
}
