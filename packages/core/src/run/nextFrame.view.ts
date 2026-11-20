/** Resolves on the next animation frame, or a zero-delay timer in tests and SSR. */
export function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
