import {
  HUD_ANCHOR_FRACTIONS,
  type HudAnchor,
  type HudRect,
  type HudSize,
} from "@jgengine/core/hud/hudLayout";

/**
 * One HUD block's claim on a lane. Two blocks that name the same `anchor` and
 * `lane` stack in `order` order; a lane is a column, so lanes in the same anchor
 * sit side by side. The shell resolves every claim into a rectangle, which is
 * what keeps blocks from arranging themselves into each other.
 */
export interface HudLaneSlot {
  id: string;
  /** The anchored corner/edge the lane hangs from. */
  anchor: HudAnchor;
  /** Lane name inside the anchor. Default `"main"`. */
  lane?: string;
  /** Stack position within the lane, ascending away from the anchored edge. Default `0`. */
  order?: number;
  /** Declared width in px. Falls back to the size the block measured. */
  width?: number;
  /** Declared height in px. Falls back to the size the block measured. */
  height?: number;
  /**
   * Game override: an exact rectangle in HUD space. The block is placed there
   * and takes no part in lane stacking, so a game keeps full control of its own
   * placement.
   */
  rect?: HudRect;
}

/** One block's resolved placement. */
export interface HudLanePlacement {
  id: string;
  anchor: HudAnchor;
  lane: string;
  rect: HudRect;
}

/** How the shell lays out lanes. */
export interface HudLaneConfig {
  /** Gap between stacked blocks and between lanes, in px. Default `10`. */
  gap?: number;
  /** Inset from the frame edge, in px. Default `0` — the HUD layer already carries its padding. */
  pad?: number;
  /** Size used for a block that declares and has not yet measured one. */
  fallback?: HudSize;
}

/** The resolved layout of every claimed block. */
export interface HudLaneLayout {
  placements: HudLanePlacement[];
  /** Rectangle by block id, for renderers that only lookup. */
  rects: Record<string, HudRect>;
}

const DEFAULT_GAP = 10;
const DEFAULT_FALLBACK: HudSize = { width: 240, height: 44 };

interface Claim {
  slot: HudLaneSlot;
  index: number;
}

/**
 * Resolve lane claims into non-overlapping rectangles for one frame.
 *
 * Blocks are grouped by anchor, then by lane (first-declared lane first), then
 * sorted by `order`. A lane is one column: its blocks stack top-to-bottom with
 * `gap` between them, and the anchor's lanes sit side by side with the same gap.
 * The whole group is aligned to its anchored edge and the block is aligned
 * within its lane, so a block added at any viewport can only take free space —
 * never a neighbour's. A block carrying `rect` is placed there untouched.
 *
 * @capability hud-lanes lay HUD blocks out in non-overlapping anchored lanes
 */
export function resolveHudLanes(
  slots: readonly HudLaneSlot[],
  viewport: HudSize,
  config: HudLaneConfig = {},
): HudLaneLayout {
  const gap = config.gap ?? DEFAULT_GAP;
  const pad = config.pad ?? 0;
  const fallback = config.fallback ?? DEFAULT_FALLBACK;
  const placements: HudLanePlacement[] = [];
  const rects: Record<string, HudRect> = {};

  const byAnchor = new Map<HudAnchor, Claim[]>();
  slots.forEach((slot, index) => {
    const claims = byAnchor.get(slot.anchor) ?? [];
    claims.push({ slot, index });
    byAnchor.set(slot.anchor, claims);
  });

  const place = (id: string, anchor: HudAnchor, lane: string, rect: HudRect): void => {
    placements.push({ id, anchor, lane, rect });
    rects[id] = rect;
  };

  for (const [anchor, claims] of byAnchor) {
    const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
    for (const claim of claims) {
      if (claim.slot.rect === undefined) continue;
      place(claim.slot.id, anchor, claim.slot.lane ?? "main", claim.slot.rect);
    }

    const flowing = claims.filter((claim) => claim.slot.rect === undefined);
    if (flowing.length === 0) continue;

    const lanes = new Map<string, Claim[]>();
    for (const claim of flowing) {
      const name = claim.slot.lane ?? "main";
      const members = lanes.get(name) ?? [];
      members.push(claim);
      lanes.set(name, members);
    }

    const sizeOf = (claim: Claim): HudSize => ({
      width: claim.slot.width ?? fallback.width,
      height: claim.slot.height ?? fallback.height,
    });

    const laneSize = new Map<string, { width: number; height: number }>();
    for (const [name, members] of lanes) {
      members.sort((a, b) => (a.slot.order ?? 0) - (b.slot.order ?? 0) || a.index - b.index);
      let width = 0;
      let height = 0;
      members.forEach((claim, position) => {
        const size = sizeOf(claim);
        width = Math.max(width, size.width);
        height += size.height + (position === 0 ? 0 : gap);
      });
      laneSize.set(name, { width, height });
    }

    const laneWidths = [...laneSize.values()].map((size) => size.width);
    const groupWidth = laneWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, laneWidths.length - 1);
    const groupHeight = Math.max(...[...laneSize.values()].map((size) => size.height));

    let groupLeft = pad;
    if (fx === 1) groupLeft = viewport.width - pad - groupWidth;
    else if (fx === 0.5) groupLeft = (viewport.width - groupWidth) / 2;

    let groupTop = pad;
    if (fy === 1) groupTop = viewport.height - pad - groupHeight;
    else if (fy === 0.5) groupTop = (viewport.height - groupHeight) / 2;

    let columnX = groupLeft;
    for (const [name, members] of lanes) {
      const lane = laneSize.get(name)!;
      const columnY = fy === 0 ? groupTop : fy === 1 ? groupTop + (groupHeight - lane.height) : groupTop + (groupHeight - lane.height) / 2;
      let cursor = columnY;
      for (const claim of members) {
        const size = sizeOf(claim);
        const alignedX =
          fx === 0 ? columnX : fx === 1 ? columnX + (lane.width - size.width) : columnX + (lane.width - size.width) / 2;
        place(claim.slot.id, anchor, name, {
          x: alignedX,
          y: cursor,
          width: size.width,
          height: size.height,
        });
        cursor += size.height + gap;
      }
      columnX += lane.width + gap;
    }
  }

  return { placements, rects };
}
