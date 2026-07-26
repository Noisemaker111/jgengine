/**
 * Pixel metrics for a captured screenshot: the objective rung between
 * `summarizeEnvironment` (content exists) and a human glancing at the PNG
 * (it looks good). Coarse grid sample over the decoded RGBA buffer feeds
 * four signals — color entropy, dominant-color share, edge density,
 * luminance contrast — that catch sparse, primitive-dominant, or
 * murky/foggy frames before anyone opens the image. See jgengine#788.
 */

export type LuminanceStats = { mean: number; p5: number; p95: number; contrast: number };

export type ShotMetrics = {
  colorEntropyBits: number;
  dominantColorShare: number;
  edgeDensity: number;
  luminance: LuminanceStats;
  nonblank: boolean;
  /** Fraction of the grid that survived masking; low means the HUD covers most of the region. */
  sampledShare?: number;
};

export type ThresholdWarning = { metric: string; message: string };

/** Pixel rectangle in image space. */
export type ShotRect = { x: number; y: number; width: number; height: number };

export interface ShotRegion {
  /** Restrict sampling to this rectangle — the 3D viewport, not the whole frame. */
  region?: ShotRect;
  /** Rectangles to skip inside `region` — HUD panels drawn over the viewport. */
  masks?: readonly ShotRect[];
}

/**
 * Share of the sampled region that must survive masking for a viewport verdict to mean
 * anything. Below this the HUD covers so much of the frame that the leftovers are noise.
 */
export const MIN_SAMPLED_SHARE = 0.15;

/** Above this share of one color the region is a single flat fill — a dead 3D view. */
export const DEAD_VIEW_DOMINANT_SHARE = 0.97;

function inside(rect: ShotRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export const GRID_COLUMNS = 160;
export const GRID_ROWS = 90;
export const COLOR_BUCKET_BITS = 4;
export const EDGE_LUMINANCE_DELTA = 12;

export const NONBLANK_MIN_ALPHA_PIXELS = 256;
export const NONBLANK_MIN_VARIANCE = 8;
export const NONBLANK_MIN_COLOR_BUCKETS = 3;

export const ENTROPY_SPARSE_THRESHOLD = 3.0;
export const DOMINANT_SHARE_SPARSE_THRESHOLD = 0.6;
export const EDGE_DENSITY_PRIMITIVE_THRESHOLD = 0.04;
export const CONTRAST_MURK_THRESHOLD = 60;

function luminanceOf(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorBucketCode(r: number, g: number, b: number): number {
  const shift = 8 - COLOR_BUCKET_BITS;
  const rb = r >> shift;
  const gb = g >> shift;
  const bb = b >> shift;
  return (rb << (COLOR_BUCKET_BITS * 2)) | (gb << COLOR_BUCKET_BITS) | bb;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index];
}

export function computeShotMetrics(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
  scope: ShotRegion = {},
): ShotMetrics {
  const region: ShotRect = scope.region ?? { x: 0, y: 0, width, height };
  const originX = Math.max(0, Math.round(region.x));
  const originY = Math.max(0, Math.round(region.y));
  const regionWidth = Math.max(1, Math.min(Math.round(region.width), width - originX));
  const regionHeight = Math.max(1, Math.min(Math.round(region.height), height - originY));
  const masks = scope.masks ?? [];
  const stepX = Math.max(1, Math.round(regionWidth / GRID_COLUMNS));
  const stepY = Math.max(1, Math.round(regionHeight / GRID_ROWS));
  const cols = Math.max(1, Math.floor((regionWidth - 1) / stepX) + 1);
  const rows = Math.max(1, Math.floor((regionHeight - 1) / stepY) + 1);

  const luminanceGrid: (number | null)[][] = [];
  const luminanceSamples: number[] = [];
  const bucketCounts = new Map<number, number>();
  let alphaPixels = 0;
  let maskedSamples = 0;

  for (let row = 0; row < rows; row += 1) {
    const luminanceRow: (number | null)[] = [];
    const y = Math.min(originY + row * stepY, originY + regionHeight - 1);
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(originX + col * stepX, originX + regionWidth - 1);
      if (masks.some((mask) => inside(mask, x, y))) {
        luminanceRow.push(null);
        maskedSamples += 1;
        continue;
      }
      const offset = (y * width + x) * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const a = rgba[offset + 3];
      const luminance = luminanceOf(r, g, b);
      luminanceRow.push(luminance);
      luminanceSamples.push(luminance);
      if (a > 0) alphaPixels += 1;
      const bucket = colorBucketCode(r, g, b);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }
    luminanceGrid.push(luminanceRow);
  }

  const gridSamples = cols * rows;
  const totalSamples = luminanceSamples.length;
  let entropyBits = 0;
  let dominantCount = 0;
  for (const count of bucketCounts.values()) {
    const p = count / totalSamples;
    entropyBits -= p * Math.log2(p);
    if (count > dominantCount) dominantCount = count;
  }
  const dominantColorShare = totalSamples > 0 ? dominantCount / totalSamples : 0;

  let edgeCount = 0;
  let edgeTotal = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const l = luminanceGrid[row][col];
      const right = luminanceGrid[row][col + 1];
      const below = luminanceGrid[row + 1][col];
      if (l === null || right === null || below === null) continue;
      if (Math.max(Math.abs(right - l), Math.abs(below - l)) > EDGE_LUMINANCE_DELTA) edgeCount += 1;
      edgeTotal += 1;
    }
  }
  const edgeDensity = edgeTotal > 0 ? edgeCount / edgeTotal : 0;

  const mean = luminanceSamples.reduce((sum, v) => sum + v, 0) / Math.max(1, totalSamples);
  const variance = luminanceSamples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, totalSamples);
  const sorted = [...luminanceSamples].sort((a, b) => a - b);
  const p5 = percentile(sorted, 0.05);
  const p95 = percentile(sorted, 0.95);

  const colorBuckets = bucketCounts.size;
  const nonblank =
    alphaPixels > NONBLANK_MIN_ALPHA_PIXELS && (variance > NONBLANK_MIN_VARIANCE || colorBuckets > NONBLANK_MIN_COLOR_BUCKETS);

  return {
    colorEntropyBits: entropyBits,
    dominantColorShare,
    edgeDensity,
    luminance: { mean, p5, p95, contrast: p95 - p5 },
    nonblank,
    sampledShare: gridSamples > 0 ? (gridSamples - maskedSamples) / gridSamples : 0,
  };
}

/** Signature grid size — small enough to store in a sidecar, dense enough to see a real change. */
export const SIGNATURE_COLUMNS = 32;
export const SIGNATURE_ROWS = 18;
/** Per-cell luminance delta (0-255) below which a cell counts as unchanged. */
export const SIGNATURE_CELL_DELTA = 3;
/** Share of changed cells below which two shots are the same picture. */
export const SIGNATURE_CHANGED_SHARE = 0.005;

/**
 * Coarse luminance fingerprint of a frame. Byte equality is useless for this: two captures
 * of an unchanged view differ in PNG bytes run to run (encoder and antialiasing noise), so
 * hashing would almost never fire on the case it exists to catch — a re-capture that shows
 * exactly the same picture as the one it replaced.
 */
export function shotSignature(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): number[] {
  const signature: number[] = [];
  for (let row = 0; row < SIGNATURE_ROWS; row += 1) {
    const y = Math.min(height - 1, Math.floor(((row + 0.5) * height) / SIGNATURE_ROWS));
    for (let col = 0; col < SIGNATURE_COLUMNS; col += 1) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) * width) / SIGNATURE_COLUMNS));
      const offset = (y * width + x) * 4;
      signature.push(Math.round(luminanceOf(rgba[offset], rgba[offset + 1], rgba[offset + 2])));
    }
  }
  return signature;
}

export interface SignatureDiff {
  changedShare: number;
  maxDelta: number;
  /** True when the two frames are the same picture within tolerance. */
  same: boolean;
}

export function compareSignatures(a: readonly number[], b: readonly number[]): SignatureDiff | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let changed = 0;
  let maxDelta = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = Math.abs(a[index]! - b[index]!);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > SIGNATURE_CELL_DELTA) changed += 1;
  }
  const changedShare = changed / a.length;
  return { changedShare, maxDelta, same: changedShare <= SIGNATURE_CHANGED_SHARE };
}

/**
 * Whether the sampled region rendered nothing — blank, or a single flat fill. Scored over
 * the 3D viewport with HUD panels masked out, because a busy HUD lifts whole-frame entropy
 * far enough to make a dead viewport read as a healthy screenshot.
 */
export function deadViewport(metrics: ShotMetrics): string | null {
  if ((metrics.sampledShare ?? 1) < MIN_SAMPLED_SHARE) return null;
  if (!metrics.nonblank) return "the 3D viewport is blank";
  if (metrics.dominantColorShare > DEAD_VIEW_DOMINANT_SHARE) {
    return `the 3D viewport is a single flat fill (${(metrics.dominantColorShare * 100).toFixed(1)}% one color)`;
  }
  return null;
}

export function evaluateThresholds(metrics: ShotMetrics): ThresholdWarning[] {
  const warnings: ThresholdWarning[] = [];
  if (metrics.colorEntropyBits < ENTROPY_SPARSE_THRESHOLD) {
    warnings.push({
      metric: "colorEntropyBits",
      message: `colorEntropyBits ${metrics.colorEntropyBits.toFixed(2)} < ${ENTROPY_SPARSE_THRESHOLD} — sparse`,
    });
  }
  if (metrics.dominantColorShare > DOMINANT_SHARE_SPARSE_THRESHOLD) {
    warnings.push({
      metric: "dominantColorShare",
      message: `dominantColorShare ${metrics.dominantColorShare.toFixed(2)} > ${DOMINANT_SHARE_SPARSE_THRESHOLD} — sparse`,
    });
  }
  if (metrics.edgeDensity < EDGE_DENSITY_PRIMITIVE_THRESHOLD) {
    warnings.push({
      metric: "edgeDensity",
      message: `edgeDensity ${metrics.edgeDensity.toFixed(3)} < ${EDGE_DENSITY_PRIMITIVE_THRESHOLD} — primitive-dominant`,
    });
  }
  if (metrics.luminance.contrast < CONTRAST_MURK_THRESHOLD) {
    warnings.push({
      metric: "luminance.contrast",
      message: `luminance.contrast ${metrics.luminance.contrast.toFixed(1)} < ${CONTRAST_MURK_THRESHOLD} — fog/darkness compression`,
    });
  }
  return warnings;
}
