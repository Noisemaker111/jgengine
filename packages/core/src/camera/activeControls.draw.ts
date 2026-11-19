/** @internal */
const active = new Set<{ enabled?: boolean }>();

/** @internal */
export function registerCameraControls<T extends { enabled?: boolean }>(controls: T): () => void {
  active.add(controls);
  return () => active.delete(controls);
}

/** @internal */
export function setCameraControlsEnabled(enabled: boolean): void {
  for (const controls of active) controls.enabled = enabled;
}
