/**
 * Per-frame visibility + streaming counters. The VisibilitySystem fills the culling and
 * timing fields; the AssetStreamingSystem fills the asset fields. Everything is a plain
 * number so a HUD or the devtools hub can read it without adapters.
 */
export interface VisibilityStats {
  totalObjects: number;
  consideredForRender: number;
  rejectedByFrustum: number;
  rejectedByDistance: number;
  rejectedByOcclusion: number;
  drawCallsAvoided: number;
  visible: number;
  preloaded: number;
  assetsQueued: number;
  assetsLoading: number;
  assetsLoaded: number;
  assetsUnloaded: number;
  streamedBytes: number;
  spatialQueryMs: number;
  cullingMs: number;
}

export function createVisibilityStats(): VisibilityStats {
  return {
    totalObjects: 0,
    consideredForRender: 0,
    rejectedByFrustum: 0,
    rejectedByDistance: 0,
    rejectedByOcclusion: 0,
    drawCallsAvoided: 0,
    visible: 0,
    preloaded: 0,
    assetsQueued: 0,
    assetsLoading: 0,
    assetsLoaded: 0,
    assetsUnloaded: 0,
    streamedBytes: 0,
    spatialQueryMs: 0,
    cullingMs: 0,
  };
}

export function resetCullingStats(stats: VisibilityStats): void {
  stats.totalObjects = 0;
  stats.consideredForRender = 0;
  stats.rejectedByFrustum = 0;
  stats.rejectedByDistance = 0;
  stats.rejectedByOcclusion = 0;
  stats.drawCallsAvoided = 0;
  stats.visible = 0;
  stats.preloaded = 0;
  stats.spatialQueryMs = 0;
  stats.cullingMs = 0;
}

/** High-resolution clock that degrades to a monotonic-ish fallback when `performance` is absent. */
export function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : 0;
}
