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
};

export type ThresholdWarning = { metric: string; message: string };

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

export function computeShotMetrics(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): ShotMetrics {
  const stepX = Math.max(1, Math.round(width / GRID_COLUMNS));
  const stepY = Math.max(1, Math.round(height / GRID_ROWS));
  const cols = Math.max(1, Math.floor((width - 1) / stepX) + 1);
  const rows = Math.max(1, Math.floor((height - 1) / stepY) + 1);

  const luminanceGrid: number[][] = [];
  const luminanceSamples: number[] = [];
  const bucketCounts = new Map<number, number>();
  let alphaPixels = 0;

  for (let row = 0; row < rows; row += 1) {
    const luminanceRow: number[] = [];
    const y = Math.min(row * stepY, height - 1);
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(col * stepX, width - 1);
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
      const deltaX = luminanceGrid[row][col + 1] - l;
      const deltaY = luminanceGrid[row + 1][col] - l;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > EDGE_LUMINANCE_DELTA) edgeCount += 1;
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
  };
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
