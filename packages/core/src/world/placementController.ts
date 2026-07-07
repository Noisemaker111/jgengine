import { footprintAabb, snapToGrid, type Aabb, type Footprint, type Vec2 } from "./geometry";
import { validatePlacement, type PlacementRules } from "./placement";

export type SnapMode = "grid" | "free" | "surface";

export type PlacementVec3 = readonly [number, number, number];

export interface PlacementHit {
  point: PlacementVec3;
  normal: PlacementVec3;
}

export interface PlacementControllerConfig {
  footprint: Footprint;
  rules?: PlacementRules;
  snapMode?: SnapMode;
  grid?: number;
  quarterTurns?: number;
}

export interface PlacementPreview {
  center: Vec2;
  y: number;
  quarterTurns: number;
  footprint: Footprint;
  aabb: Aabb;
  valid: boolean;
  reason?: "out-of-bounds" | "overlap";
  snapMode: SnapMode;
  normal: PlacementVec3;
}

export interface PlacementCommit {
  center: Vec2;
  y: number;
  rotationY: number;
  quarterTurns: number;
  footprint: Footprint;
  aabb: Aabb;
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
  commit(): PlacementCommit | null;
  reset(): void;
}

const SNAP_ORDER: readonly SnapMode[] = ["grid", "free", "surface"];

export function quarterTurnsToRotationY(quarterTurns: number): number {
  const turns = ((quarterTurns % 4) + 4) % 4;
  return turns === 0 ? 0 : -turns * (Math.PI / 2);
}

export function createPlacementController(config: PlacementControllerConfig): PlacementController {
  let footprint = config.footprint;
  let rules = config.rules ?? {};
  let snapMode = config.snapMode ?? "grid";
  let grid = config.grid ?? rules.snap ?? 1;
  let quarterTurns = ((config.quarterTurns ?? 0) % 4 + 4) % 4;
  let lastHit: PlacementHit | null = null;
  let preview: PlacementPreview | null = null;

  function snapCenter(raw: Vec2): Vec2 {
    if (snapMode === "grid") return snapToGrid(raw, grid);
    return raw;
  }

  function compute(hit: PlacementHit): PlacementPreview {
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
    commit() {
      if (preview === null || !preview.valid) return null;
      return {
        center: preview.center,
        y: preview.y,
        rotationY: quarterTurnsToRotationY(quarterTurns),
        quarterTurns,
        footprint: preview.footprint,
        aabb: preview.aabb,
      };
    },
    reset() {
      lastHit = null;
      preview = null;
      quarterTurns = ((config.quarterTurns ?? 0) % 4 + 4) % 4;
    },
  };
}
