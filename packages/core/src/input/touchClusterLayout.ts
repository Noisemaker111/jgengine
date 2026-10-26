import type { TouchAnchor, TouchButton, TouchScheme } from "@jgengine/core/input/touchScheme";

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

/** Bottom-edge space (px, excluding safe areas) the dock occupies in each third of the screen. */
export interface TouchDockInsets {
  left: number;
  center: number;
  right: number;
}

/** Dock geometry constants shared by the renderer and the clearance math. */
export const DOCK_GEOMETRY = {
  joystick: 132,
  joystickThumb: 52,
  railButton: 64,
  basePadding: 20,
  edgeMargin: 12,
} as const;

function sideOf(anchor: TouchAnchor): keyof TouchDockInsets | null {
  if (anchor === "bottom-left") return "left";
  if (anchor === "bottom-right") return "right";
  if (anchor === "bottom-center") return "center";
  return null;
}

/**
 * Height of the floating joystick's capture zone for a viewport height: `min(40vh, 260px)`, never shorter than the stick.
 *
 * @internal
 */
export function floatingJoystickZoneHeight(viewportHeight: number, scale = 1): number {
  return Math.max(DOCK_GEOMETRY.joystick * scale, Math.min(viewportHeight * 0.4, 260));
}

/**
 * Height of the slot strip / menu chip row stacked above an arc cluster, 0 when it holds nothing.
 *
 * @internal
 */
export function auxRowHeight(slotCount: number, utilityCount: number, sizes: TouchClusterSizes): number {
  return slotCount + utilityCount > 0 ? sizes.chip + sizes.gap : 0;
}

/**
 * Space each bottom third of the screen loses to the touch dock. Only the corners a cluster
 * actually occupies are reserved, so HUD at bottom-centre stays visible when the joystick and
 * the action cluster sit in the corners. Side rails and top clusters reserve their own rectangles
 * through the layout registry instead.
 *
 * @internal
 */
export function touchDockInsets(
  scheme: TouchScheme | null,
  scale = 1,
  shortSide = DEFAULT_TOUCH_SHORT_SIDE,
  /** Height of the movement control's touch zone; defaults to the fixed stick. The floating stick's capture zone is taller. */
  movementHeight = DOCK_GEOMETRY.joystick * scale,
): TouchDockInsets {
  const insets: TouchDockInsets = { left: 0, center: 0, right: 0 };
  if (scheme === null) return insets;
  const sizes = touchClusterSizes(shortSide);
  const layout = scheme.layout;
  const reserve = (anchor: TouchAnchor, height: number): void => {
    const side = sideOf(anchor);
    if (side === null || height <= 0) return;
    insets[side] = Math.max(insets[side], Math.round(height + DOCK_GEOMETRY.basePadding + DOCK_GEOMETRY.edgeMargin));
  };
  const { primary, utility } = partitionDockButtons(scheme);
  const slots = scheme.slots ?? [];
  if (scheme.joystick !== null) reserve(layout.movement, movementHeight);
  const arc = layout.actions === "bottom-left" || layout.actions === "bottom-right";
  const utilityJoinsActions = utility.length > 0 && layout.utility === layout.actions && arc;
  if (primary.length > 0 || slots.length > 0) {
    if (arc) {
      const cluster = primary.length > 0 ? touchClusterLayout(primary.length - 1, sizes).height : 0;
      reserve(layout.actions, cluster + auxRowHeight(slots.length, utilityJoinsActions ? utility.length : 0, sizes));
    } else {
      reserve(layout.actions, DOCK_GEOMETRY.railButton * scale);
    }
  }
  if (utility.length > 0 && !utilityJoinsActions) reserve(layout.utility, sizes.chip);
  for (const button of scheme.buttons) {
    if (button.anchor !== null) reserve(button.anchor, DOCK_GEOMETRY.railButton * scale);
  }
  return insets;
}
