/**
 * Shared mobile-composition geometry. Every UI subsystem (HUD, touch controls,
 * system chrome, screens) registers the physical rectangle it occupies; the
 * engine allocates the viewport once and detects when two subsystems collide,
 * instead of each independently claiming an edge. Pure math — no DOM, no React.
 */

import type { LayoutOrientation } from "../ui/orientation";
import type { HudRect, HudSize } from "./hudLayout";

/** The explicit composition mode a game renders for — not a scaled desktop layout. */
export type GameLayoutMode = "desktop-wide" | "desktop-compact" | "mobile-landscape" | "mobile-portrait";

/** Edge insets in CSS pixels (safe areas, reservations). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** All-zero insets. */
export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Axis-aligned rectangle in CSS pixels (origin top-left). Structurally compatible with a `DOMRect`'s edge fields. */
export interface LayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Width of a rect (clamped to ≥0).
 * @internal
 */
export function rectWidth(rect: LayoutRect): number {
  return Math.max(0, rect.right - rect.left);
}

/** Height of a rect (clamped to ≥0).
 * @internal
 */
export function rectHeight(rect: LayoutRect): number {
  return Math.max(0, rect.bottom - rect.top);
}

/** Area of a rect in px².
 * @internal
 */
export function rectArea(rect: LayoutRect): number {
  return rectWidth(rect) * rectHeight(rect);
}

/** Do the two rectangles share any interior area? Touching edges do not count.
 * @internal
 */
export function intersects(a: LayoutRect, b: LayoutRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Overlapping area in px²; 0 when the rectangles don't intersect.
 * @internal
 */
export function overlapArea(a: LayoutRect, b: LayoutRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Portrait when taller than wide, else landscape.
 * @internal
 */
export function orientationOf(width: number, height: number): LayoutOrientation {
  return height > width ? "portrait" : "landscape";
}

/** Inputs to `resolveLayoutMode`. */
export interface LayoutModeInput {
  /** Live visible viewport dimensions (prefer `visualViewport`). */
  width: number;
  height: number;
  /** Touchscreen is the primary input (`(pointer: coarse)`). */
  coarsePointer: boolean;
  /** Does the game support phones at all (`platforms` includes `"mobile"`)? Default true. */
  mobileSupported?: boolean;
  /** Desktop width below which the layout is "compact". Default 900. */
  compactWidth?: number;
}

const DEFAULT_COMPACT_WIDTH = 900;

/**
 * Resolve the explicit composition mode. A mobile layout is not a scaled
 * desktop layout: a coarse-pointer device on a game that supports mobile is
 * always a `mobile-*` mode, split by live orientation; everything else is a
 * desktop mode split by width.
  * @internal
  */
export function resolveLayoutMode(input: LayoutModeInput): GameLayoutMode {
  const orientation = orientationOf(input.width, input.height);
  const mobile = input.coarsePointer && (input.mobileSupported ?? true);
  if (mobile) return orientation === "portrait" ? "mobile-portrait" : "mobile-landscape";
  const compactWidth = input.compactWidth ?? DEFAULT_COMPACT_WIDTH;
  return input.width < compactWidth ? "desktop-compact" : "desktop-wide";
}

/** Whether a mode is one of the phone modes.
 * @internal
 */
export function isMobileMode(mode: GameLayoutMode): boolean {
  return mode === "mobile-portrait" || mode === "mobile-landscape";
}

/** What kind of UI a registered region belongs to. */
export type LayoutRegionKind = "hud" | "control" | "system" | "screen";
/** How a region participates in collision reporting. */
export type LayoutCollisionPolicy = "forbid" | "allow" | "warn";
/** Gameplay-importance tier of a HUD element. */
export type HudPriority = "critical" | "secondary" | "tertiary";
/** How a HUD element adapts on phones. */
export type MobileHudBehavior =
  | "persistent"
  | "compact"
  | "icon"
  | "transient"
  | "hidden"
  | "sheet"
  | "modal";

/** A physical rectangle a UI subsystem occupies, published to the shared registry. */
export interface LayoutRegion {
  id: string;
  kind: LayoutRegionKind;
  rect: LayoutRect;
  /** `forbid` reports any overlap, `warn` reports softly, `allow` opts this region out of collision reporting entirely. */
  collisionPolicy: LayoutCollisionPolicy;
  priority?: HudPriority | undefined;
  /** Region ids this one may overlap without a report. */
  allowOverlapWith?: readonly string[] | undefined;
  /** Regions sharing a non-empty group never report against each other. */
  collisionGroup?: string | undefined;
}

/** One detected forbidden/warned overlap between two regions. */
export interface LayoutCollision {
  a: string;
  b: string;
  kindA: LayoutRegionKind;
  kindB: LayoutRegionKind;
  /** Overlapping area in px². */
  area: number;
  severity: "forbid" | "warn";
}

function allowsOverlap(a: LayoutRegion, b: LayoutRegion): boolean {
  if (a.allowOverlapWith?.includes(b.id) === true) return true;
  if (b.allowOverlapWith?.includes(a.id) === true) return true;
  if (a.collisionGroup !== undefined && a.collisionGroup === b.collisionGroup) return true;
  return false;
}

/** Options for `detectLayoutCollisions`. */
export interface DetectCollisionsOptions {
  /** Ignore overlaps smaller than this many px² — avoids meaningless sub-pixel warnings. Default 64. */
  minArea?: number;
}

const DEFAULT_MIN_AREA = 64;

/**
 * Every forbidden or warned rectangle intersection across the registered
 * regions. A pair is skipped when either side's policy is `allow`, when either
 * opts into the other via `allowOverlapWith`, when they share a
 * `collisionGroup`, or when the overlap is below `minArea`.
  *
  * @capability layout-collisions every overlapping pair of registered HUD, control and system regions
  */
export function detectLayoutCollisions(
  regions: readonly LayoutRegion[],
  options?: DetectCollisionsOptions,
): LayoutCollision[] {
  const minArea = options?.minArea ?? DEFAULT_MIN_AREA;
  const out: LayoutCollision[] = [];
  for (const [i, a] of regions.entries()) {
    for (const b of regions.slice(i + 1)) {
      if (a.collisionPolicy === "allow" || b.collisionPolicy === "allow") continue;
      if (allowsOverlap(a, b)) continue;
      const area = overlapArea(a.rect, b.rect);
      if (area < minArea) continue;
      const severity = a.collisionPolicy === "forbid" || b.collisionPolicy === "forbid" ? "forbid" : "warn";
      out.push({ a: a.id, b: b.id, kindA: a.kind, kindB: b.kind, area: Math.round(area), severity });
    }
  }
  return out;
}

function withThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Human-readable diagnostic block for a set of collisions (empty string when there are none), naming
 * the viewport they collided at when given.
 *
 * @capability layout-collision-report format the overlapping HUD/control regions for a development console
 */
export function formatLayoutCollisions(collisions: readonly LayoutCollision[], viewport?: HudSize): string {
  if (collisions.length === 0) return "";
  const lines = collisions.map((c) => `${c.a} intersects ${c.b} by ${withThousands(c.area)} px²`);
  const at = viewport === undefined ? "" : ` at ${Math.round(viewport.width)}x${Math.round(viewport.height)}`;
  return [`JGENGINE LAYOUT COLLISION${at}`, ...lines].join("\n");
}

/**
 * A rendered HUD block (`{ x, y, width, height }`, as `HudCanvas` measures it or `resolveHudLanes`
 * places it) as a `forbid` HUD region, so HUD blocks check for overlap through
 * {@link detectLayoutCollisions} like every other region.
 */
export function hudBlockRegion(id: string, rect: HudRect): LayoutRegion {
  return {
    id,
    kind: "hud",
    rect: { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height },
    collisionPolicy: "forbid",
  };
}

/**
 * The usable gameplay rectangle after reserving physical zones for touch
 * controls and system UI. Starts from the safe-area-inset viewport and carves
 * each reserved zone from whichever edge it hugs.
  * @internal
  */
export function computeGameplayRect(
  viewport: LayoutRect,
  safeArea: Insets,
  reserved: readonly LayoutRect[],
): LayoutRect {
  let top = viewport.top + safeArea.top;
  let bottom = viewport.bottom - safeArea.bottom;
  let left = viewport.left + safeArea.left;
  let right = viewport.right - safeArea.right;
  const midX = (viewport.left + viewport.right) / 2;
  const midY = (viewport.top + viewport.bottom) / 2;
  for (const zone of reserved) {
    const zoneMidX = (zone.left + zone.right) / 2;
    const zoneMidY = (zone.top + zone.bottom) / 2;
    const spanX = zone.right - zone.left;
    const spanY = zone.bottom - zone.top;
    if (zoneMidY > midY) bottom = Math.min(bottom, zone.top);
    else if (zoneMidY < midY && spanX >= spanY) top = Math.max(top, zone.bottom);
    else if (zoneMidX < midX) left = Math.max(left, zone.right);
    else right = Math.min(right, zone.left);
  }
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

/** The shared live geometry the engine allocates once and every UI subsystem reads. */
export interface GameViewportLayout {
  /** The layout (CSS-pixel) viewport. */
  viewport: LayoutRect;
  /** The live visible viewport (`window.visualViewport`), which excludes mobile browser chrome. */
  visualViewport: LayoutRect;
  safeArea: Insets;
  mode: GameLayoutMode;
  orientation: LayoutOrientation;
  /** All registered regions with their live rects. */
  regions: readonly LayoutRegion[];
  /** Rects reserved by touch controls and system UI. */
  controlZones: readonly LayoutRect[];
  /** Usable world/gameplay area after reservations. */
  gameplayRect: LayoutRect;
}
