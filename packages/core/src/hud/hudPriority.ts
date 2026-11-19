/**
 * Shared mobile-composition geometry. Every UI subsystem (HUD, touch controls,
 * system chrome, screens) registers the physical rectangle it occupies; the
 * engine allocates the viewport once and detects when two subsystems collide,
 * instead of each independently claiming an edge. Pure math — no DOM, no UI runtime.
 */

import type { LayoutOrientation } from "../ui/orientation";
import type { HudRect, HudSize } from "./hudLayout";

export type GameLayoutMode = "desktop-wide" | "desktop-compact" | "mobile-landscape" | "mobile-portrait";

/** Edge insets in CSS pixels (safe areas, reservations). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

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

/** @internal */
export function orientationOf(width: number, height: number): LayoutOrientation {
  return height > width ? "portrait" : "landscape";
}

export interface LayoutModeInput {
  width: number;
  height: number;
  coarsePointer: boolean;
  mobileSupported?: boolean;
  compactWidth?: number;
}

const DEFAULT_COMPACT_WIDTH = 900;

/** @internal */
export function resolveLayoutMode(input: LayoutModeInput): GameLayoutMode {
  const orientation = orientationOf(input.width, input.height);
  const mobile = input.coarsePointer && (input.mobileSupported ?? true);
  if (mobile) return orientation === "portrait" ? "mobile-portrait" : "mobile-landscape";
  const compactWidth = input.compactWidth ?? DEFAULT_COMPACT_WIDTH;
  return input.width < compactWidth ? "desktop-compact" : "desktop-wide";
}

/** @internal */
export function isMobileMode(mode: GameLayoutMode): boolean {
  return mode === "mobile-portrait" || mode === "mobile-landscape";
}

export type LayoutRegionKind = "hud" | "control" | "system" | "screen";
export type LayoutCollisionPolicy = "forbid" | "allow" | "warn";
export type HudPriority = "critical" | "secondary" | "tertiary";
export type MobileHudBehavior =
  | "persistent"
  | "compact"
  | "icon"
  | "transient"
  | "hidden"
  | "sheet"
  | "modal";

export interface LayoutRegion {
  id: string;
  kind: LayoutRegionKind;
  rect: LayoutRect;
  collisionPolicy: LayoutCollisionPolicy;
  priority?: HudPriority | undefined;
  allowOverlapWith?: readonly string[] | undefined;
  /** Regions sharing a non-empty group never report against each other. */
  collisionGroup?: string | undefined;
}

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

export interface DetectCollisionsOptions {
  /** Ignore overlaps smaller than this many px² — avoids meaningless sub-pixel warnings. Default 64. */
  minArea?: number;
}

const DEFAULT_MIN_AREA = 64;

/** @capability layout-collisions every overlapping pair of registered HUD, control and system regions */
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

/** @capability layout-collision-report format the overlapping HUD/control regions for a development console */
export function formatLayoutCollisions(collisions: readonly LayoutCollision[], viewport?: HudSize): string {
  if (collisions.length === 0) return "";
  const lines = collisions.map((c) => `${c.a} intersects ${c.b} by ${withThousands(c.area)} px²`);
  const at = viewport === undefined ? "" : ` at ${Math.round(viewport.width)}x${Math.round(viewport.height)}`;
  return [`JGENGINE LAYOUT COLLISION${at}`, ...lines].join("\n");
}

export function hudBlockRegion(id: string, rect: HudRect): LayoutRegion {
  return {
    id,
    kind: "hud",
    rect: { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height },
    collisionPolicy: "forbid",
  };
}

/** @internal */
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

export interface GameViewportLayout {
  /** The layout (CSS-pixel) viewport. */
  viewport: LayoutRect;
  visualViewport: LayoutRect;
  safeArea: Insets;
  mode: GameLayoutMode;
  orientation: LayoutOrientation;
  regions: readonly LayoutRegion[];
  controlZones: readonly LayoutRect[];
  gameplayRect: LayoutRect;
}
