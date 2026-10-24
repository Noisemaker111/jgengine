import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVisibilitySystem, type Renderable } from "@jgengine/core/visibility/visibilitySystem";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import type { BoundsSpec, Vec3 } from "@jgengine/core/visibility/bounds";
import type { OcclusionTester } from "@jgengine/core/visibility/occlusion";
import { createOccluderGrid, type OccluderBox, type OccluderGridStats } from "@jgengine/core/world/occluderGrid";

type MutableRenderable = { -readonly [Key in keyof Renderable]: Renderable[Key] };

interface Entry {
  renderable: MutableRenderable;
  bounds: { kind: "sphere"; radius: number; offset: Vec3 };
  x: number;
  y: number;
  z: number;
  rotation: number;
  radius: number;
  seen: number;
}

const ENTITY_BOUNDS: BoundsSpec = { kind: "sphere", radius: 2, offset: [0, 1, 0] };
const EMPTY_CAMERAS: readonly CameraVisibilityContext[] = [];

/** Smallest placed-object radius trusted as an occluder; below it a prop is furniture, not a wall. */
export const OCCLUDER_MIN_RADIUS = 6;
/** Occluder cell edge in metres. One cell is rejected at a time, so this is the culling granularity. */
export const OCCLUDER_CELL_SIZE = 16;

/** A placed solid large enough to hide what stands behind it, as an AABB a grid can index. */
export function placedOccluderBox(
  position: Vec3,
  radius: number,
  minRadius = OCCLUDER_MIN_RADIUS,
): OccluderBox | null {
  if (radius < minRadius) return null;
  return {
    minX: position[0] - radius,
    maxX: position[0] + radius,
    minZ: position[2] - radius,
    maxZ: position[2] + radius,
    minY: 0,
    // Half the footprint radius: a box that is too tall only hides things that are really behind it,
    // while guessing high over-rejects, so the grid takes the shorter, safe reading.
    maxY: radius,
  };
}

function objectRadius(scale: number | readonly [number, number, number] | undefined): number {
  if (scale === undefined) return 1;
  const size = typeof scale === "number" ? Math.abs(scale) : Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
  return Math.max(0.75, size);
}

/** Builds the shell's live scene adapter for headless visibility. @internal */
export function buildCullingDriver(ctx: GameContext, config: VisibilityConfig | undefined) {
  const entries = new Map<string, Entry>();
  let frame = 0;
  let currentView: CameraView | null = null;

  function update(id: string, position: Vec3, rotation: number, radius: number, overrides: Renderable["overrides"], layer: string): Renderable {
    let entry = entries.get(id);
    if (entry === undefined) {
      entry = { renderable: { id, position, version: 0 }, bounds: { kind: "sphere", radius, offset: [0, 0.5, 0] }, x: NaN, y: NaN, z: NaN, rotation: NaN, radius: NaN, seen: frame };
      entries.set(id, entry);
    }
    const previous = entry.renderable;
    const changed = entry.x !== position[0] || entry.y !== position[1] || entry.z !== position[2] || entry.rotation !== rotation || entry.radius !== radius || previous.overrides !== overrides || previous.layer !== layer;
    if (changed) {
      // A retained renderable must belong to one row: the core may keep it for always-visible processing.
      entry.bounds.radius = radius;
      previous.position = position;
      previous.version += 1;
      previous.bounds = layer === "entity" ? ENTITY_BOUNDS : entry.bounds;
      previous.overrides = overrides;
      previous.layer = layer;
      entry.x = position[0];
      entry.y = position[1];
      entry.z = position[2];
      entry.rotation = rotation;
      entry.radius = radius;
    }
    entry.seen = frame;
    return entry.renderable;
  }

  function* renderables(): Iterable<Renderable> {
    frame += 1;
    for (const entity of ctx.scene.entity.list()) {
      yield update(entity.id, entity.position, entity.rotationY, 2, config?.entities?.[entity.name], "entity");
    }
    for (const object of ctx.scene.object.list()) {
      yield update(object.instanceId, object.position, object.rotationY, objectRadius(object.visual?.scale), config?.objects?.[object.catalogId], "object");
    }
    for (const [id, entry] of entries) {
      if (entry.seen !== frame) entries.delete(id);
    }
  }

  const occlusionEnabled = config?.culling?.occlusionCulling ?? true;
  let grid: ReturnType<typeof createOccluderGrid> | null = null;

  /** Build the occluder grid once from the placed solids already in the scene. */
  function ensureGrid(): ReturnType<typeof createOccluderGrid> {
    if (grid !== null) return grid;
    const boxes: OccluderBox[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const object of ctx.scene.object.list()) {
      const radius = objectRadius(object.visual?.scale);
      const extentX = object.position[0] + radius;
      const extentZ = object.position[2] + radius;
      const nearX = object.position[0] - radius;
      const nearZ = object.position[2] - radius;
      if (nearX < minX) minX = nearX;
      if (nearZ < minZ) minZ = nearZ;
      if (extentX > maxX) maxX = extentX;
      if (extentZ > maxZ) maxZ = extentZ;
      const box = placedOccluderBox(object.position, radius);
      if (box !== null) boxes.push(box);
    }
    if (boxes.length === 0) {
      grid = createOccluderGrid({ bounds: { minX: 0, minZ: 0, maxX: OCCLUDER_CELL_SIZE, maxZ: OCCLUDER_CELL_SIZE }, cellSize: OCCLUDER_CELL_SIZE });
      return grid;
    }
    const pad = OCCLUDER_CELL_SIZE;
    grid = createOccluderGrid({
      bounds: { minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad },
      cellSize: OCCLUDER_CELL_SIZE,
    });
    grid.build(boxes);
    return grid;
  }

  const occlusion: OcclusionTester = {
    enabled: occlusionEnabled,
    isOccluded({ camera, bounds }) {
      const built = ensureGrid();
      if (built.stats().occluders === 0) return false;
      return built.isBoxHidden(
        { x: camera.position[0], y: camera.position[1], z: camera.position[2] },
        { minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ, maxX: bounds.maxX, maxY: bounds.maxY, maxZ: bounds.maxZ },
      );
    },
  };

  const system = createVisibilitySystem({
    renderables,
    cameras: () => currentView === null ? EMPTY_CAMERAS : [{ id: "main", view: currentView }],
    settings: { occlusionCulling: occlusionEnabled, ...config?.culling },
    ...(config?.scene !== undefined ? { sceneOverrides: config.scene } : {}),
    occlusion,
  });
  return {
    system,
    setView(view: CameraView | null) {
      currentView = view;
    },
    trackedCount() {
      return entries.size;
    },
    /** Built-grid counters, so a run can state what occlusion cost and what it rejected. */
    occluderStats(): OccluderGridStats | null {
      return grid === null ? null : grid.stats();
    },
    /** Rebuild the occluder grid from the scene's placed solids on the next update. */
    refreshOccluders() {
      grid = null;
    },
  };
}
