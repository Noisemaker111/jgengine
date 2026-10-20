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

/**
 * Watches clicks (pointer, Enter or Space on a button) and, right after the click's update commits, returns focus to `surface()` if the clicked control unmounted and focus fell to the body.
 * Chromium moves focus to `<body>` on removal without a `focusout`, so the click is the hook.
 * Returns the cleanup.
 * @internal
 */
export function installPlayFocusReclaim(doc: Document, surface: () => HTMLElement | null): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onClick = (event: MouseEvent) => {
    const clicked = event.target instanceof Element ? event.target : null;
    if (clicked === null) return;
    clearTimeout(timer);
    // React commits a click's update synchronously at the end of the event; a macrotask is enough and,
    // unlike a frame callback, does not stall when the page renders slowly.
    timer = setTimeout(() => {
      const target = surface();
      if (target === null || !target.isConnected) return;
      if (shouldReclaimPlayFocus(clicked, doc.activeElement, doc.body)) target.focus({ preventScroll: true });
    });
  };
  doc.addEventListener("click", onClick, true);
  return () => {
    clearTimeout(timer);
    doc.removeEventListener("click", onClick, true);
  };
}
