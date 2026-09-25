interface LockableElement {
  requestPointerLock?: (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;
}

/**
 * Request pointer lock with raw (unaccelerated) mouse deltas, falling back to a plain lock when
 * the browser or OS rejects `unadjustedMovement`.
 */
export function requestRawPointerLock(element: LockableElement): void {
  const request = element.requestPointerLock;
  if (request === undefined) return;
  let pending: Promise<void> | void;
  try {
    pending = request.call(element, { unadjustedMovement: true });
  } catch {
    pending = request.call(element);
  }
  if (pending !== undefined && typeof pending.catch === "function") {
    pending.catch(() => request.call(element)?.catch?.(() => undefined));
  }
}
