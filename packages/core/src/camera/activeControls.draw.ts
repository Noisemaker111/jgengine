/**
 * Camera control rigs a draw mounts (orbit, inspection, fly) register here so modal interactions —
 * the transform gizmo, a drag handle — can suspend them while they own the pointer. Replaces the
 * r3f `state.controls` slot drei's `makeDefault` used to fill.
 * @internal
 */
const active = new Set<{ enabled?: boolean }>();

/** Register a controls object; returns its unregister. @internal */
export function registerCameraControls<T extends { enabled?: boolean }>(controls: T): () => void {
  active.add(controls);
  return () => active.delete(controls);
}

/** Enable or disable every registered camera control rig. @internal */
export function setCameraControlsEnabled(enabled: boolean): void {
  for (const controls of active) controls.enabled = enabled;
}
