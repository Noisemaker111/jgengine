import type { TouchButton, TouchScheme } from "@jgengine/core/input/touchScheme";

/** Button sizes for the thumb cluster, in CSS px, derived from the screen's short side. */
export interface TouchClusterSizes {
  /** The main (fire/attack) button. */
  main: number;
  /** Each secondary button on the arcs around it. */
  secondary: number;
  /** Slot-strip and menu chips. */
  chip: number;
  gap: number;
}

/** Fallback short side when no viewport is measurable (tests, SSR): a phone held in landscape. */
export const DEFAULT_TOUCH_SHORT_SIDE = 390;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Cluster sizes scaled to the viewport's short side: the main button about a fifth of it, secondaries
 * about an eighth, with floors that stay tappable on small phones and caps so tablets do not get
 * dinner plates.
 *
 * @internal
 */
export function touchClusterSizes(shortSide: number): TouchClusterSizes {
  const side = Number.isFinite(shortSide) && shortSide > 0 ? shortSide : DEFAULT_TOUCH_SHORT_SIDE;
  return {
    main: Math.round(clamp(side * 0.2, 64, 112)),
    secondary: Math.round(clamp(side * 0.12, 40, 66)),
    chip: Math.round(clamp(side * 0.085, 30, 44)),
    gap: Math.round(clamp(side * 0.02, 6, 12)),
  };
}

/** A button box's offset from the cluster's bottom-right corner, in px. */
export interface ClusterPlacement {
  right: number;
  bottom: number;
}

/** Where every cluster button sits, plus the cluster box size. */
export interface TouchClusterLayout {
  sizes: TouchClusterSizes;
  main: ClusterPlacement;
  secondaries: ClusterPlacement[];
  width: number;
  height: number;
}

/**
 * Places the main button in the bottom-right corner and its secondaries on concentric arcs around
 * it, inner ring first. Each ring spans from just below "left of the main button" to just past
 * "above it", as wide as fits without a button leaving the cluster box, and holds as many buttons
 * as fit edge to edge with a gap. Mirror it for a bottom-left cluster by swapping `right` for `left`.
 *
 * @internal
 */
export function touchClusterLayout(secondaryCount: number, sizes: TouchClusterSizes): TouchClusterLayout {
  const { main, secondary, gap } = sizes;
  const center = main / 2;
  const secondaries: ClusterPlacement[] = [];
  let remaining = Math.max(0, Math.floor(secondaryCount));
  for (let ring = 0; remaining > 0; ring += 1) {
    const radius = center + gap + secondary / 2 + ring * (secondary + gap);
    const lowest = Math.asin(clamp((secondary / 2 - center) / radius, -1, 0));
    const highest = Math.PI / 2 - lowest;
    const step = 2 * Math.asin(clamp((secondary + gap) / (2 * radius), 0, 1));
    const capacity = Math.max(1, Math.floor((highest - lowest) / step + 1e-6) + 1);
    const count = Math.min(remaining, capacity);
    const spacing = count === capacity && count > 1 ? (highest - lowest) / (count - 1) : step;
    const start = count === capacity ? lowest : Math.max(lowest, Math.PI / 4 - (spacing * (count - 1)) / 2);
    for (let index = 0; index < count; index += 1) {
      const angle = count === 1 && capacity > 1 ? Math.PI / 4 : start + index * spacing;
      secondaries.push({
        right: Math.round(center + radius * Math.cos(angle) - secondary / 2),
        bottom: Math.round(center + radius * Math.sin(angle) - secondary / 2),
      });
    }
    remaining -= count;
  }
  let width = main;
  let height = main;
  for (const placement of secondaries) {
    width = Math.max(width, placement.right + secondary);
    height = Math.max(height, placement.bottom + secondary);
  }
  return { sizes, main: { right: 0, bottom: 0 }, secondaries, width, height };
}

/**
 * The cluster's main button: the one the game marked `main`, else the first fire/shoot/attack
 * verb, else the first button. -1 for an empty list.
 *
 * @internal
 */
export function mainButtonIndex(buttons: readonly Pick<TouchButton, "action" | "main">[]): number {
  if (buttons.length === 0) return -1;
  const marked = buttons.findIndex((button) => button.main === true);
  if (marked !== -1) return marked;
  const verb = buttons.findIndex((button) => /fire|shoot|attack/i.test(button.action));
  return verb === -1 ? 0 : verb;
}

/**
 * Docked buttons split the way the dock draws them: the arc cluster and the small menu-type buttons.
 *
 * @internal
 */
export function partitionDockButtons(scheme: Pick<TouchScheme, "buttons">): { primary: TouchButton[]; utility: TouchButton[] } {
  const primary: TouchButton[] = [];
  const utility: TouchButton[] = [];
  for (const button of scheme.buttons) {
    if (button.anchor !== null) continue;
    (button.kind === "utility" ? utility : primary).push(button);
  }
  return { primary, utility };
}

/** Utility buttons past this count fold into one overflow button. */
export const UTILITY_INLINE_LIMIT = 2;

/** Dock geometry constants the renderer sizes the stick and side rails from. */
export const DOCK_GEOMETRY = {
  joystick: 132,
  joystickThumb: 52,
  railButton: 64,
  basePadding: 20,
} as const;
