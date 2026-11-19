/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";

/**
 * World-anchored entity frames — a data-first seam for floating overhead UI
 * (enemy nameplates + health bars, interaction prompts, objective pips) that
 * tracks entities in the 3D world. The game keeps owning its entities: it passes
 * a plain array of `{ id, worldPosition }` entries and a `project` function that
 * turns a world position into a screen point, and composes each frame's markup
 * itself (typically a `KitMeter` plus a name) drawn by the active UI kit. This primitive owns only the reusable behavior:
 * projecting, offsetting, culling entries that are off-screen or behind the
 * camera, and stacking nearer entities above farther ones.
 *
 * No `GameProvider`, entity store, or Three.js is required or
 * imported here — the same way {@link ./map!Minimap} takes display markers. An
 * game can get `project` for free from `useWorldProjection`/`WorldEntityFrames`
 * in `@jgengine/shell/world/WorldEntityFrames`, which samples the live camera and
 * composes this component.
 *
 * @capability entity-frames world-anchored overhead entity frames (nameplate/healthbar), data-first + caller-composed
 */

export interface EntityScreenProjection {
  /** CSS px from the viewport's left edge. */
  x: number;
  /** CSS px from the viewport's top edge. */
  y: number;
  /**
   * Stacking / draw-order key — larger means farther from the camera, so nearer
   * frames paint on top. Optional; defaults to 0 when the projection omits it.
   */
  depth?: number;
  behind?: boolean;
}

/**
 * Projects a world position to a screen point, or returns `null` to cull the
 * entry entirely (e.g. outside the frustum). Caller-owned so this seam never
 * depends on a specific camera or renderer.
 */
export type ProjectEntity = (
  worldPosition: readonly [number, number, number],
) => EntityScreenProjection | null;

/** The minimum an entry must carry; games extend it with their own display data. */
export interface EntityFrameEntry {
  /** Stable key across frames — used for UI keys and deterministic stacking. */
  id: string;
  /** World-space anchor, typically the entity's head (`[x, y + height, z]`). */
  worldPosition: readonly [number, number, number];
}

export interface EntityFramePlacement<E extends EntityFrameEntry> {
  entry: E;
  x: number;
  y: number;
  depth: number;
}

export interface EntityFrameLayoutOptions {
  /** Screen px added to every projected x. Default 0. */
  offsetX?: number;
  /** Screen px added to every projected y — negative lifts frames above the anchor. Default 0. */
  offsetY?: number;
  /**
   * Viewport size used to cull frames that project past the edges. Omit to keep
   * every in-front entry (the caller's `project` may already frustum-cull).
   */
  viewport?: { width: number; height: number };
  /** Extra px beyond each viewport edge still treated as on-screen. Default 64. */
  margin?: number;
  maxCount?: number;
}

export function layoutEntityFrames<E extends EntityFrameEntry>(
  entries: readonly E[],
  project: ProjectEntity,
  options: EntityFrameLayoutOptions = {},
): EntityFramePlacement<E>[] {
  const { offsetX = 0, offsetY = 0, viewport, margin = 64, maxCount } = options;
  const placed: EntityFramePlacement<E>[] = [];
  for (const entry of entries) {
    const projection = project(entry.worldPosition);
    if (projection === null || projection.behind === true) continue;
    const x = projection.x + offsetX;
    const y = projection.y + offsetY;
    if (viewport !== undefined) {
      if (
        x < -margin ||
        x > viewport.width + margin ||
        y < -margin ||
        y > viewport.height + margin
      ) {
        continue;
      }
    }
    placed.push({ entry, x, y, depth: projection.depth ?? 0 });
  }
  // Farthest first; ties resolved by id so the DOM/stacking order is deterministic.
  placed.sort((a, b) => (b.depth - a.depth) || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
  if (maxCount !== undefined && placed.length > maxCount) {
    // Keep the nearest `maxCount` (the tail of a farthest-first list).
    return placed.slice(placed.length - maxCount);
  }
  return placed;
}

export interface EntityFramesProps<E extends EntityFrameEntry> extends EntityFrameLayoutOptions {
  entries: readonly E[];
  project: ProjectEntity;
  renderFrame: (entry: E, placement: EntityFramePlacement<E>) => ReactNode;
  className?: string | undefined;
  style?: CSSProperties;
  anchorTransform?: string | undefined;
}

/** @capability entity-frames overlay that renders caller-composed frames over on-screen entities */
export function EntityFrames<E extends EntityFrameEntry>({
  entries,
  project,
  renderFrame,
  className,
  style,
  anchorTransform = "translate(-50%, -100%)",
  ...layout
}: EntityFramesProps<E>) {
  const placements = layoutEntityFrames(entries, project, layout);
  return (
    <div
      className={className}
      data-entity-frames=""
      style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
    >
      {placements.map((placement, index) => (
        <div
          key={placement.entry.id}
          data-entity-frame={placement.entry.id}
          style={{
            position: "absolute",
            left: placement.x,
            top: placement.y,
            transform: anchorTransform,
            // Nearer frames come last in a farthest-first list; index gives them
            // a higher z so overlapping plates stack front-over-back.
            zIndex: index,
          }}
        >
          {renderFrame(placement.entry, placement)}
        </div>
      ))}
    </div>
  );
}
