import { footprintAabb, snapToGrid, type Aabb, type Footprint, type Vec2 } from "./geometry";
import { validatePlacement, type PlacementRules } from "./placement";

export type SnapMode = "grid" | "free" | "surface";

export type PlacementVec3 = readonly [number, number, number];

export interface PlacementHit {
  point: PlacementVec3;
  normal: PlacementVec3;
}

/** A fixed buildable slot the placement controller snaps to instead of grid/free positioning. */
export interface PlacementSlot {
  id: string;
  center: PlacementVec3;
  /** Capture radius around `center`. Defaults to `config.slotRadius`, then `1.5`. */
  radius?: number;
  /** `false` hides the slot from hover resolution without releasing it. Default `true`. */
  enabled?: boolean;
}

export interface PlacementControllerConfig {
  footprint: Footprint;
  rules?: PlacementRules;
  snapMode?: SnapMode;
  grid?: number;
  quarterTurns?: number;
  slots?: readonly PlacementSlot[];
  /** Fallback capture radius for slots that don't set their own. Default `1.5`. */
  slotRadius?: number;
}

export interface PlacementPreview {
  center: Vec2;
  y: number;
  quarterTurns: number;
  footprint: Footprint;
  aabb: Aabb;
  valid: boolean;
  reason?: "out-of-bounds" | "overlap" | "no-slot";
  snapMode: SnapMode;
  normal: PlacementVec3;
  /** Id of the resolved slot, when the controller is in slot mode and a slot matched. */
  slotId?: string;
}

export interface PlacementCommit {
  center: Vec2;
  y: number;
  rotationY: number;
  quarterTurns: number;
  footprint: Footprint;
  aabb: Aabb;
  /** Id of the slot this commit occupied, when the controller is in slot mode. */
  slotId?: string;
}

export interface PlacementController {
  hover(hit: PlacementHit): PlacementPreview;
  current(): PlacementPreview | null;
  rotate(steps?: number): PlacementPreview | null;
  setSnapMode(mode: SnapMode): PlacementPreview | null;
  cycleSnapMode(): SnapMode;
  setFootprint(footprint: Footprint): void;
  setRules(rules: PlacementRules): void;
  setGrid(grid: number): void;
  setSlots(slots: readonly PlacementSlot[]): void;
  /** Id of the currently hovered slot, or `null` when idle, out of slot mode, or unmatched. */
  hoveredSlotId(): string | null;
  /** Frees a previously committed slot so it can match again. */
  releaseSlot(id: string): void;
  commit(): PlacementCommit | null;
  reset(): void;
}

const SNAP_ORDER: readonly SnapMode[] = ["grid", "free", "surface"];
const DEFAULT_SLOT_RADIUS = 1.5;

function distanceVec3(a: PlacementVec3, b: PlacementVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Maps 0–3 quarter turns onto radians for ghost/commit rotation. */
export function quarterTurnsToRotationY(quarterTurns: number): number {
  const turns = ((quarterTurns % 4) + 4) % 4;
  return turns === 0 ? 0 : -turns * (Math.PI / 2);
}

/**
 * Headless placement ghost: hover → valid/invalid preview, rotate, grid/free/surface snap, commit.
 * Pair with `@jgengine/shell/structures` `PlacementGhost` and {@link placeAssetFromCommit}.
 * @capability placement-controller interactive build-mode ghost preview and commit
 */
export function createPlacementController(config: PlacementControllerConfig): PlacementController {
  let footprint = config.footprint;
  let rules = config.rules ?? {};
  let snapMode = config.snapMode ?? "grid";
  let grid = config.grid ?? rules.snap ?? 1;
  let quarterTurns = ((config.quarterTurns ?? 0) % 4 + 4) % 4;
  let slots = config.slots;
  const slotRadius = config.slotRadius ?? DEFAULT_SLOT_RADIUS;
  const occupiedSlots = new Set<string>();
  let lastHit: PlacementHit | null = null;
  let preview: PlacementPreview | null = null;

  function snapCenter(raw: Vec2): Vec2 {
    if (snapMode === "grid") return snapToGrid(raw, grid);
    return raw;
  }

  function nearestSlot(hit: PlacementHit): PlacementSlot | null {
    let best: PlacementSlot | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slots ?? []) {
      if (slot.enabled === false || occupiedSlots.has(slot.id)) continue;
      const distance = distanceVec3(hit.point, slot.center);
      if (distance <= (slot.radius ?? slotRadius) && distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    return best;
  }

  function computeSlotPreview(hit: PlacementHit): PlacementPreview {
    const slot = nearestSlot(hit);
    const center: Vec2 = slot === null ? [hit.point[0], hit.point[2]] : [slot.center[0], slot.center[2]];
    const next: PlacementPreview = {
      center,
      y: slot === null ? hit.point[1] : slot.center[1],
      quarterTurns,
      footprint,
      aabb: footprintAabb(center, footprint, quarterTurns),
      valid: slot !== null,
      snapMode,
      normal: hit.normal,
      ...(slot === null ? { reason: "no-slot" as const } : { slotId: slot.id }),
    };
    preview = next;
    return next;
  }

  function compute(hit: PlacementHit): PlacementPreview {
    if (slots !== undefined) return computeSlotPreview(hit);
    const raw: Vec2 = [hit.point[0], hit.point[2]];
    const center = snapCenter(raw);
    const rulesWithoutSnap: PlacementRules =
      snapMode === "grid" ? { ...rules, snap: undefined } : rules;
    const result = validatePlacement({ center, footprint, quarterTurns }, rulesWithoutSnap);
    const aabb =
      result.status === "ok" ? result.aabb : footprintAabb(center, footprint, quarterTurns);
    const next: PlacementPreview = {
      center: result.status === "ok" ? result.center : center,
      y: hit.point[1],
      quarterTurns,
      footprint,
      aabb,
      valid: result.status === "ok",
      snapMode,
      normal: hit.normal,
      ...(result.status === "rejected" ? { reason: result.reason } : {}),
    };
    preview = next;
    return next;
  }

  return {
    hover(hit) {
      lastHit = hit;
      return compute(hit);
    },
    current() {
      return preview;
    },
    rotate(steps = 1) {
      quarterTurns = ((quarterTurns + steps) % 4 + 4) % 4;
      return lastHit === null ? null : compute(lastHit);
    },
    setSnapMode(mode) {
      snapMode = mode;
      return lastHit === null ? null : compute(lastHit);
    },
    cycleSnapMode() {
      const index = SNAP_ORDER.indexOf(snapMode);
      snapMode = SNAP_ORDER[(index + 1) % SNAP_ORDER.length]!;
      if (lastHit !== null) compute(lastHit);
      return snapMode;
    },
    setFootprint(next) {
      footprint = next;
      if (lastHit !== null) compute(lastHit);
    },
    setRules(next) {
      rules = next;
      if (lastHit !== null) compute(lastHit);
    },
    setGrid(next) {
      grid = next;
      if (lastHit !== null) compute(lastHit);
    },
    setSlots(next) {
      slots = next;
      if (lastHit !== null) compute(lastHit);
    },
    hoveredSlotId() {
      return preview?.slotId ?? null;
    },
    releaseSlot(id) {
      occupiedSlots.delete(id);
      if (lastHit !== null) compute(lastHit);
    },
    commit() {
      if (preview === null || !preview.valid) return null;
      if (preview.slotId !== undefined) occupiedSlots.add(preview.slotId);
      return {
        center: preview.center,
        y: preview.y,
        rotationY: quarterTurnsToRotationY(quarterTurns),
        quarterTurns,
        footprint: preview.footprint,
        aabb: preview.aabb,
        ...(preview.slotId !== undefined ? { slotId: preview.slotId } : {}),
      };
    },
    reset() {
      lastHit = null;
      preview = null;
      quarterTurns = ((config.quarterTurns ?? 0) % 4 + 4) % 4;
    },
  };
}
