import { type CSSProperties, type ReactNode } from "react";

import type { FloatingTextView } from "@jgengine/core/ui/floatingText";

import type { EntityScreenProjection, ProjectEntity } from "./entityFrames";

/**
 * World-anchored floating text — the presentation half of the data-first
 * `@jgengine/core/ui/floatingText` seam. The game keeps owning the simulation: it
 * passes the field's `active()` views plus a `project` function (world → screen),
 * exactly the transport {@link ./entityFrames!EntityFrames} uses, so an R3F game
 * gets it for free from `useWorldProjection`. This component owns only the
 * reusable presentation: projecting each entry, culling ones behind the camera or
 * off-screen, and rendering absolutely-positioned text with the entry's color,
 * current alpha, and pop-in scale — reskinnable per `kind` through `styleFor`.
 *
 * No `GameProvider`, Three.js, or React Three Fiber is imported here — the same
 * way `EntityFrames` stays renderer-agnostic. An R3F game gets the one-line drop-in
 * from `@jgengine/shell/vfx/WorldFloatingText`, which binds the live camera and
 * advances the field.
 *
 * @capability floating-text world-anchored floating combat text / damage numbers overlay, data-first + caller-projected + per-kind skinnable
 */

/** One projected, on-screen floating-text entry ready to render. */
export interface FloatingTextPlacement {
  view: FloatingTextView;
  /** Final screen x in CSS px after `offsetX`. */
  x: number;
  /** Final screen y in CSS px after `offsetY`. */
  y: number;
  /** Projected depth (0 when the projection omitted one); larger = farther. */
  depth: number;
}

/** Anchoring and culling options shared by the layout core and the component. */
export interface FloatingTextLayoutOptions {
  /** Screen px added to every projected x. Default 0. */
  offsetX?: number;
  /** Screen px added to every projected y — negative lifts text above the anchor. Default 0. */
  offsetY?: number;
  /** Viewport size used to cull entries past the edges. Omit to keep every in-front entry. */
  viewport?: { width: number; height: number };
  /** Extra px beyond each viewport edge still treated as on-screen. Default 96. */
  margin?: number;
}

/**
 * Pure layout core: projects each view, drops the ones behind the camera or
 * (when `viewport` is set) off-screen, and returns the survivors sorted
 * farthest-first so nearer text paints on top. No React, no DOM — unit-testable.
 *
 * @capability floating-text pure world→screen layout for floating-text views (project, cull, depth-sort)
 */
export function layoutFloatingText(
  views: readonly FloatingTextView[],
  project: ProjectEntity,
  options: FloatingTextLayoutOptions = {},
): FloatingTextPlacement[] {
  const { offsetX = 0, offsetY = 0, viewport, margin = 96 } = options;
  const placed: FloatingTextPlacement[] = [];
  for (const view of views) {
    const projection: EntityScreenProjection | null = project(view.position);
    if (projection === null || projection.behind === true) continue;
    const x = projection.x + offsetX;
    const y = projection.y + offsetY;
    if (
      viewport !== undefined &&
      (x < -margin || x > viewport.width + margin || y < -margin || y > viewport.height + margin)
    ) {
      continue;
    }
    placed.push({ view, x, y, depth: projection.depth ?? 0 });
  }
  placed.sort((a, b) => b.depth - a.depth || a.view.id - b.view.id);
  return placed;
}

/** Props for {@link FloatingText}. */
export interface FloatingTextProps extends FloatingTextLayoutOptions {
  /** The field's live views (`field.active()`), refreshed each frame. */
  entries: readonly FloatingTextView[];
  /** World→screen projector; return `null` to cull. Same shape `EntityFrames` takes. */
  project: ProjectEntity;
  /**
   * Per-`kind` art direction: return extra CSS (color, font, weight, shadow) for a
   * view. Merged over the defaults, so returning `{}` keeps them. The default look
   * uses `view.color` (or white), a bold sans stack, and a readable shadow.
   */
  styleFor?: (view: FloatingTextView) => CSSProperties;
  /** Base font size in px at `size === 1`; scaled by each view's `size`. Default 20. */
  fontSizePx?: number;
  /** Class on the fullscreen overlay layer. */
  className?: string;
  /** Style on the fullscreen overlay layer (merged over the absolute-fill default). */
  style?: CSSProperties;
  /** Per-entry render override; return your own node instead of the default text chip. */
  renderEntry?: (placement: FloatingTextPlacement) => ReactNode;
}

/**
 * Absolutely-positioned overlay that renders every on-screen floating-text entry
 * as text with its color, current alpha, and pop-in scale. Drop it inside a
 * positioned ancestor (e.g. an `<Html fullscreen>` overlay or `HudCanvas`) and feed
 * it fresh `entries`/`project` each frame. Every part carries `data-*` hooks
 * (`data-floating-text`, `data-floating-text-entry="<id>"`, `data-kind="<kind>"`)
 * for tests and skins.
 *
 * @capability floating-text overlay that renders on-screen floating combat text with per-kind color, alpha, and pop-in scale
 */
export function FloatingText({
  entries,
  project,
  styleFor,
  fontSizePx = 20,
  className,
  style,
  renderEntry,
  ...layout
}: FloatingTextProps) {
  const placements = layoutFloatingText(entries, project, layout);
  return (
    <div
      className={className}
      data-floating-text=""
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", ...style }}
    >
      {placements.map((placement, index) => {
        const { view } = placement;
        const custom = styleFor?.(view);
        return (
          <div
            key={view.id}
            data-floating-text-entry={view.id}
            data-kind={view.kind}
            style={{
              position: "absolute",
              left: placement.x,
              top: placement.y,
              transform: `translate(-50%, -50%) scale(${view.size})`,
              transformOrigin: "center",
              opacity: view.alpha,
              zIndex: index,
              whiteSpace: "nowrap",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 800,
              fontSize: fontSizePx,
              lineHeight: 1,
              color: view.color ?? "#ffffff",
              textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)",
              ...custom,
            }}
          >
            {renderEntry !== undefined ? renderEntry(placement) : view.text}
          </div>
        );
      })}
    </div>
  );
}
