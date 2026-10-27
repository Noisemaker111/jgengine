import { HUD_ANCHOR_FRACTIONS, type HudAnchor, type HudRect, type HudSize } from "./hudLayout";
import { ZERO_INSETS, type HudPriority, type Insets, type LayoutRect } from "./hudPriority";

/**
 * One HUD panel asking for room. Panels that share an `anchor` stack outward from that edge in `order`;
 * the solver then moves, collapses or shrinks whatever would land on something else.
 */
export interface HudPanelClaim {
  id: string;
  /** The corner, edge or centre the panel hangs from. */
  anchor: HudAnchor;
  /** Stack position within the anchor, ascending away from the anchored edge. Default `0`. */
  order?: number | undefined;
  /** `critical` never collapses; `tertiary` is the first to fold into a toggle. Default `secondary`. */
  priority?: HudPriority | undefined;
  /** The panel's full size, in HUD pixels. */
  size: HudSize;
  /** The size of its collapsed toggle. A panel without one never collapses. */
  chipSize?: HudSize;
}

/** The screen the panels share. */
export interface HudPanelLayoutRequest {
  /** The HUD's on-screen size in CSS pixels. */
  viewport: HudSize;
  /** The zoom the HUD prefers. Default `1`. */
  scale?: number;
  /** The smallest zoom the HUD may shrink to before panels are allowed to overlap. Default `scale * 0.7`. */
  minScale?: number;
  /** Safe-area insets, in on-screen pixels. */
  insets?: Insets;
  /** Gap kept between a panel and the screen edge, in HUD pixels. Default `16`. */
  edgePad?: number;
  /** Gap kept between panels, in HUD pixels. Default `10`. */
  gap?: number;
  /** On-screen rectangles no panel may cover (a touch-control dock). */
  reserved?: readonly LayoutRect[];
}

/** Where every panel landed. */
export interface HudPanelLayout {
  /** The zoom the HUD draws at; smaller than the requested scale only when nothing else fit. */
  scale: number;
  /** Each panel's rectangle in HUD pixels from the HUD's top-left corner. */
  rects: Record<string, HudRect>;
  /** Panels drawn as their collapsed toggle. */
  collapsed: string[];
  /** Panels that found no free room even at the smallest zoom; they sit at their anchor. */
  overlapping: string[];
}

const DEFAULT_GAP = 10;
const DEFAULT_EDGE_PAD = 16;
const SCALE_STEP = 0.1;
const EPSILON = 0.01;

const PRIORITY_RANK: Record<HudPriority, number> = { critical: 0, secondary: 1, tertiary: 2 };

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function stackIdeals(claims: readonly HudPanelClaim[], sizeOf: (claim: HudPanelClaim) => HudSize, bounds: Bounds, gap: number): Map<string, { x: number; y: number }> {
  const groups = new Map<HudAnchor, { claim: HudPanelClaim; index: number }[]>();
  claims.forEach((claim, index) => {
    const members = groups.get(claim.anchor) ?? [];
    members.push({ claim, index });
    groups.set(claim.anchor, members);
  });
  const ideals = new Map<string, { x: number; y: number }>();
  for (const [anchor, members] of groups) {
    members.sort((a, b) => (a.claim.order ?? 0) - (b.claim.order ?? 0) || a.index - b.index);
    const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
    const sizes = members.map((member) => sizeOf(member.claim));
    const total = sizes.reduce((sum, size) => sum + size.height, 0) + gap * Math.max(0, sizes.length - 1);
    let cursor = fy === 0 ? bounds.top : fy === 1 ? bounds.bottom : (bounds.top + bounds.bottom - total) / 2;
    members.forEach((member, position) => {
      const size = sizes[position]!;
      const x = fx === 0 ? bounds.left : fx === 1 ? bounds.right - size.width : (bounds.left + bounds.right - size.width) / 2;
      if (fy === 1) {
        ideals.set(member.claim.id, { x, y: cursor - size.height });
        cursor -= size.height + gap;
      } else {
        ideals.set(member.claim.id, { x, y: cursor });
        cursor += size.height + gap;
      }
    });
  }
  return ideals;
}

function clear(rect: HudRect, obstacles: readonly HudRect[], gap: number): boolean {
  const reach = gap - EPSILON;
  for (const o of obstacles) {
    if (rect.x < o.x + o.width + reach && rect.x + rect.width > o.x - reach && rect.y < o.y + o.height + reach && rect.y + rect.height > o.y - reach) return false;
  }
  return true;
}

/**
 * The free spot nearest a panel's ideal position that keeps it on one of the ideal's axes: it slides along
 * its edge or steps along its stack, never wanders into the middle of the screen.
 */
function findSpot(ideal: { x: number; y: number }, size: HudSize, bounds: Bounds, obstacles: readonly HudRect[], gap: number): HudRect | null {
  const maxX = bounds.right - size.width;
  const maxY = bounds.bottom - size.height;
  if (maxX < bounds.left - EPSILON || maxY < bounds.top - EPSILON) return null;
  const ix = Math.min(Math.max(ideal.x, bounds.left), maxX);
  const iy = Math.min(Math.max(ideal.y, bounds.top), maxY);
  const xs = [ix, bounds.left, maxX, (bounds.left + maxX) / 2];
  const ys = [iy, bounds.top, maxY, (bounds.top + maxY) / 2];
  for (const o of obstacles) {
    xs.push(o.x + o.width + gap, o.x - gap - size.width);
    ys.push(o.y + o.height + gap, o.y - gap - size.height);
  }
  let best: HudRect | null = null;
  let bestScore = Infinity;
  const consider = (x: number, y: number) => {
    if (x < bounds.left - EPSILON || x > maxX + EPSILON || y < bounds.top - EPSILON || y > maxY + EPSILON) return;
    const score = Math.abs(x - ix) + Math.abs(y - iy);
    if (score >= bestScore) return;
    const rect = { x, y, width: size.width, height: size.height };
    if (!clear(rect, obstacles, gap)) return;
    best = rect;
    bestScore = score;
  };
  for (const x of xs) consider(x, iy);
  for (const y of ys) consider(ix, y);
  return best;
}

interface Attempt {
  rects: Record<string, HudRect>;
  collapsed: string[];
  overlapping: string[];
  /** Panels pushed off their anchored edge into the screen by more than their own depth. */
  strayed: string[];
}

/**
 * Whether a spot left the panel's anchored edge for the middle of the screen: a top or bottom panel
 * moved off its row by more than its height, a side panel off its column by more than its width, a
 * corner panel off both. Sliding along the edge or down a corner's stack is not straying.
 */
function strays(anchor: HudAnchor, ideal: { x: number; y: number }, spot: HudRect): boolean {
  const { fx, fy } = HUD_ANCHOR_FRACTIONS[anchor];
  const offRow = fy !== 0.5 && Math.abs(spot.y - ideal.y) > spot.height + EPSILON;
  const offColumn = fx !== 0.5 && Math.abs(spot.x - ideal.x) > spot.width + EPSILON;
  if (fx === 0.5) return offRow;
  if (fy === 0.5) return offColumn;
  return offRow && offColumn;
}

function attempt(claims: readonly HudPanelClaim[], bounds: Bounds, reserved: readonly HudRect[], gap: number): Attempt {
  const ranked = claims
    .map((claim, index) => ({ claim, index }))
    .sort((a, b) => PRIORITY_RANK[a.claim.priority ?? "secondary"] - PRIORITY_RANK[b.claim.priority ?? "secondary"] || a.index - b.index);
  const collapsed = new Set<string>();
  // Each pass either places everything or folds one more panel, so this ends within claims.length passes.
  for (;;) {
    const sizeOf = (claim: HudPanelClaim): HudSize => (collapsed.has(claim.id) && claim.chipSize !== undefined ? claim.chipSize : claim.size);
    const ideals = stackIdeals(claims, sizeOf, bounds, gap);
    const obstacles: HudRect[] = [...reserved];
    const rects: Record<string, HudRect> = {};
    const overlapping: string[] = [];
    const strayed: string[] = [];
    let folded = false;
    for (const { claim } of ranked) {
      const size = sizeOf(claim);
      const ideal = ideals.get(claim.id)!;
      const spot = findSpot(ideal, size, bounds, obstacles, gap);
      if (spot !== null) {
        rects[claim.id] = spot;
        obstacles.push(spot);
        if (strays(claim.anchor, ideal, spot)) strayed.push(claim.id);
        continue;
      }
      if (claim.chipSize !== undefined && (claim.priority ?? "secondary") !== "critical" && !collapsed.has(claim.id)) {
        collapsed.add(claim.id);
        folded = true;
        break;
      }
      const x = Math.max(bounds.left, Math.min(ideal.x, bounds.right - size.width));
      const y = Math.max(bounds.top, Math.min(ideal.y, bounds.bottom - size.height));
      rects[claim.id] = { x, y, width: size.width, height: size.height };
      overlapping.push(claim.id);
    }
    if (!folded) return { rects, collapsed: claims.filter((claim) => collapsed.has(claim.id)).map((claim) => claim.id), overlapping, strayed };
  }
}

/**
 * Lay out every HUD panel on one screen without overlap. Panels start stacked at their anchors; a panel
 * that would land on another slides along its edge or down its stack to the nearest free spot. When no
 * spot is free, the lowest-priority panel folds into its toggle, and when even that is not enough the
 * whole HUD shrinks a step at a time down to `minScale`. A panel that only fits by leaving its edge for
 * the middle of the screen (a bottom bar lifted over the play view by a touch dock) also shrinks the HUD,
 * and stays lifted only when no zoom down to `minScale` keeps it on its edge. Higher priority places
 * first, then declaration order. Pure: the same claims on the same screen give the same layout.
 *
 * @capability hud-auto-layout place HUD panels by anchor and priority so none overlap at any screen size
 */
export function arrangeHudPanels(claims: readonly HudPanelClaim[], request: HudPanelLayoutRequest): HudPanelLayout {
  const scale = request.scale ?? 1;
  const minScale = Math.min(scale, request.minScale ?? scale * 0.7);
  const insets = request.insets ?? ZERO_INSETS;
  const pad = request.edgePad ?? DEFAULT_EDGE_PAD;
  const gap = request.gap ?? DEFAULT_GAP;
  let best: (Attempt & { scale: number }) | null = null;
  const settle = ({ rects, collapsed, overlapping, scale: zoom }: Attempt & { scale: number }): HudPanelLayout => ({ scale: zoom, rects, collapsed, overlapping });
  for (let step = 0; ; step += 1) {
    const zoom = Math.max(minScale, scale * (1 - SCALE_STEP * step));
    const bounds: Bounds = {
      left: insets.left / zoom + pad,
      top: insets.top / zoom + pad,
      right: (request.viewport.width - insets.right) / zoom - pad,
      bottom: (request.viewport.height - insets.bottom) / zoom - pad,
    };
    const reserved = (request.reserved ?? []).map((zone) => ({
      x: zone.left / zoom,
      y: zone.top / zoom,
      width: (zone.right - zone.left) / zoom,
      height: (zone.bottom - zone.top) / zoom,
    }));
    const result = attempt(claims, bounds, reserved, gap);
    if (best === null || result.overlapping.length < best.overlapping.length || (result.overlapping.length === best.overlapping.length && result.strayed.length < best.strayed.length)) {
      best = { ...result, scale: zoom };
    }
    if ((result.overlapping.length === 0 && result.strayed.length === 0) || zoom <= minScale) return settle(best);
  }
}
