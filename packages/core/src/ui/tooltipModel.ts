/**
 * Headless model for HUD tooltips and popovers — the shared description seam games have been
 * hand-rolling with a bare DOM `title=` attribute. {@link actionTooltip} turns a
 * {@link ResolvedAction} into structured {@link TooltipContent} (title, cost, cooldown, blocking
 * notes), and {@link placePopover} is the pure, SSR-safe positioning math the React tooltip uses to
 * flip and clamp against the viewport. Both are rendering-agnostic.
 */

import type { ActionCooldown, ActionCost, ResolvedAction } from "./actionModel";

/** Structured tooltip content — a renderer lays these fields out; the model owns what is shown. */
export interface TooltipContent {
  title: string;
  subtitle?: string;
  body?: string;
  /** Hotkey label to echo (e.g. `"Q"`). */
  hotkey?: string;
  costs?: readonly ActionCost[];
  cooldown?: ActionCooldown | null;
  /** Blocking reasons rendered as a warning footer (why the action is unavailable). */
  notes?: readonly string[];
}

/**
 * Build {@link TooltipContent} from a {@link ResolvedAction}: title from the label, the group as a
 * subtitle, the description as the body, and the blocking reasons as warning notes. The single place
 * an action's tooltip copy is assembled, so every renderer shows the same thing.
 */
export function actionTooltip(action: ResolvedAction): TooltipContent {
  const content: TooltipContent = { title: action.label };
  if (action.group !== undefined) content.subtitle = action.group;
  if (action.description !== undefined) content.body = action.description;
  if (action.hotkey !== undefined) content.hotkey = action.hotkey;
  if (action.costs.length > 0) content.costs = action.costs;
  if (action.cooldown !== null && !action.cooldown.ready) content.cooldown = action.cooldown;
  if (action.reasons.length > 0) content.notes = action.reasons.map((reason) => reason.message);
  return content;
}

/** Which side of its anchor a popover opens toward. */
export type PopoverSide = "top" | "bottom" | "left" | "right";

/** A positioned rectangle (viewport/anchor space, top-left origin, pixels). */
export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A width/height pair (pixels). */
export interface UiSize {
  width: number;
  height: number;
}

/** The resolved popover position — the side it actually opened on and its clamped top-left. */
export interface PopoverPlacement {
  side: PopoverSide;
  left: number;
  top: number;
}

/** Options for {@link placePopover}. */
export interface PopoverOptions {
  /** Side to try first (default `"top"`). Flips to the opposite when it would overflow. */
  preferred?: PopoverSide;
  /** Gap between the anchor and the popover, in pixels (default 8). */
  gap?: number;
  /** Minimum inset from the viewport edges, in pixels (default 8). */
  margin?: number;
}

const OPPOSITE: Record<PopoverSide, PopoverSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, max < min ? min : value));

/** @internal Room in pixels between the anchor and the viewport edge on a given side. */
function roomOn(side: PopoverSide, anchor: UiRect, viewport: UiSize): number {
  if (side === "top") return anchor.y;
  if (side === "bottom") return viewport.height - (anchor.y + anchor.height);
  if (side === "left") return anchor.x;
  return viewport.width - (anchor.x + anchor.width);
}

/** @internal The top-left of `content` placed on `side` of `anchor`, before viewport clamping. */
function topLeftFor(side: PopoverSide, anchor: UiRect, content: UiSize, gap: number): { left: number; top: number } {
  if (side === "top") {
    return { left: anchor.x + anchor.width / 2 - content.width / 2, top: anchor.y - gap - content.height };
  }
  if (side === "bottom") {
    return { left: anchor.x + anchor.width / 2 - content.width / 2, top: anchor.y + anchor.height + gap };
  }
  if (side === "left") {
    return { left: anchor.x - gap - content.width, top: anchor.y + anchor.height / 2 - content.height / 2 };
  }
  return { left: anchor.x + anchor.width + gap, top: anchor.y + anchor.height / 2 - content.height / 2 };
}

/**
 * Position a popover/tooltip of `content` size against its `anchor` rectangle inside `viewport`:
 * open on the `preferred` side, flip to the opposite when that side lacks room and the opposite has
 * more, then clamp the top-left so the box stays fully on screen (respecting `margin`). Pure and
 * deterministic — no DOM reads — so it is SSR-safe and unit-testable, and the React tooltip is a thin
 * shell over it.
 */
export function placePopover(
  anchor: UiRect,
  content: UiSize,
  viewport: UiSize,
  options?: PopoverOptions,
): PopoverPlacement {
  const gap = options?.gap ?? 8;
  const margin = options?.margin ?? 8;
  const preferred = options?.preferred ?? "top";
  const needed = preferred === "top" || preferred === "bottom" ? content.height : content.width;
  let side = preferred;
  const opposite = OPPOSITE[preferred];
  if (roomOn(preferred, anchor, viewport) < needed + gap && roomOn(opposite, anchor, viewport) > roomOn(preferred, anchor, viewport)) {
    side = opposite;
  }
  const { left, top } = topLeftFor(side, anchor, content, gap);
  return {
    side,
    left: clamp(left, margin, viewport.width - content.width - margin),
    top: clamp(top, margin, viewport.height - content.height - margin),
  };
}
