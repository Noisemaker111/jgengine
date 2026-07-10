export interface PointerAxisState {
  /** Horizontal pointer position over the play surface in `[-1, 1]`: `-1` at the left edge, `+1` at the right. */
  x: number;
  /** Vertical pointer position over the play surface in `[-1, 1]`, screen convention: `-1` at the top edge, `+1` at the bottom — negate for aim-up. */
  y: number;
  /** `false` after the pointer leaves the surface; the last position is retained. */
  active: boolean;
}

/** Maps one pointer axis onto an analog axis target — the pointer-backed counterpart of an `AxisBinding`'s key lists. */
export interface PointerAxisBinding {
  source: "x" | "y";
  invert?: boolean;
  /** Fraction of the half-range around center treated as zero; the remainder rescales to the full `[-1, 1]`. */
  deadzone?: number;
  /** Response-curve exponent on the magnitude: `1` linear (default), `>1` finer control near center. */
  curve?: number;
}

export interface PointerSurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Normalize client coordinates against a surface rect into a `PointerAxisState`, clamped to `[-1, 1]` per axis. */
export function normalizePointerToAxis(clientX: number, clientY: number, rect: PointerSurfaceRect): PointerAxisState {
  const width = rect.width > 0 ? rect.width : 1;
  const height = rect.height > 0 ? rect.height : 1;
  return {
    x: clampUnit(((clientX - rect.left) / width) * 2 - 1),
    y: clampUnit(((clientY - rect.top) / height) * 2 - 1),
    active: true,
  };
}

/**
 * Resolve a pointer binding against the current pointer state: `null` when no pointer is active
 * (callers fall back to their digital target), otherwise the deadzone/curve-shaped value in `[-1, 1]`.
 */
export function pointerAxisValue(
  binding: PointerAxisBinding,
  state: PointerAxisState | null | undefined,
): number | null {
  if (state === null || state === undefined || !state.active) return null;
  let value = binding.source === "x" ? state.x : state.y;
  if (binding.invert === true) value = -value;
  const deadzone = binding.deadzone ?? 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const scaled = (magnitude - deadzone) / (1 - deadzone);
  const curved = Math.pow(Math.min(scaled, 1), binding.curve ?? 1);
  return Math.sign(value) * curved;
}

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
