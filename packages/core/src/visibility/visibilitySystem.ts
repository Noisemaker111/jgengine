import type { Vec3, RenderBounds, BoundsSpec } from "./bounds";
import { DEFAULT_BOUNDS, createBoundsCache } from "./bounds";
import type { BoundsCache } from "./bounds";
import type { CameraVisibilityContext, CameraKind } from "./camera";
import { cameraInfluencesStreaming } from "./camera";
import { createFrustum, updateFrustum, dilateFrustum, boundsInFrustum } from "./frustum";
import { culledByDistance } from "./distance";
import type { SpatialIndex } from "./spatialIndex";
import { createSpatialIndex } from "./spatialIndex";
import type { CullingSettings, ObjectVisibilityOverrides, ResolvedOverrides } from "./settings";
import { DEFAULT_CULLING_SETTINGS, mergeCullingSettings, resolveOverrides } from "./settings";
import type { OcclusionTester } from "./occlusion";
import { noOcclusion } from "./occlusion";
import type { VisibilityStats } from "./diagnostics";
import { createVisibilityStats, resetCullingStats, nowMs } from "./diagnostics";

/**
 * A scene object the visibility system considers. A normal game object already carries a
 * position and a version counter, so it becomes cullable automatically — no separate
 * "cullable" component. Everything else is optional override.
 */
export interface Renderable {
  readonly id: string;
  readonly position: Vec3;
  /** Bumps when transform, geometry, bounds, or overrides change — gates bounds/override recompute. */
  readonly version: number;
  readonly bounds?: BoundsSpec;
  readonly overrides?: ObjectVisibilityOverrides;
  readonly layer?: string;
  /** Fast-path exemption for UI, skyboxes, debug overlays, camera-attached, marked always-visible. */
  readonly alwaysVisible?: boolean;
  /** Asset ids this object needs loaded; feeds the streaming preload/retain sets. */
  readonly assets?: readonly string[];
}

export interface VisibilitySystemOptions {
  readonly renderables: () => Iterable<Renderable>;
  readonly cameras: () => readonly CameraVisibilityContext[];
  readonly settings?: Partial<CullingSettings>;
  readonly sceneOverrides?: ObjectVisibilityOverrides;
  readonly globalOverrides?: ObjectVisibilityOverrides;
  readonly layerOverrides?: (layer: string) => ObjectVisibilityOverrides | undefined;
  readonly occlusion?: OcclusionTester;
  /** Injected shared index. Defaults to an internally-owned uniform 3D hash. */
  readonly index?: SpatialIndex;
  readonly boundsCache?: BoundsCache;
  readonly now?: () => number;
}

export interface VisibilityResult {
  /** Objects to submit to the renderer this frame. Valid until the next `update()` (reused set). */
  readonly visible: ReadonlySet<string>;
  /** Objects within the preload region — load their assets, whether or not they render. */
  readonly preload: ReadonlySet<string>;
  readonly stats: VisibilityStats;
}

export interface VisibilityDebugSnapshot {
  cameras: { id: string; kind: CameraKind; corners: number[]; preloadMargin: number }[];
  bounds: { id: string; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; visible: boolean }[];
  partitions: { key: string; count: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[];
  culled: string[];
  stats: VisibilityStats;
}

export interface VisibilitySystem {
  update(): VisibilityResult;
  isVisible(id: string): boolean;
  isPreloaded(id: string): boolean;
  boundsOf(id: string): RenderBounds | undefined;
  settings(): CullingSettings;
  setSettings(patch: Partial<CullingSettings>): void;
  stats(): VisibilityStats;
  /** Assets required by the preload set — hand to an AssetStreamingSystem. */
  requiredAssets(): ReadonlySet<string>;
  index(): SpatialIndex;
  debugSnapshot(): VisibilityDebugSnapshot;
  clear(): void;
}

interface ObjRecord {
  version: number;
  resolved: ResolvedOverrides;
  alwaysVisible: boolean;
  dynamic: boolean;
  assets: readonly string[] | undefined;
  lastSeen: number;
}

export function createVisibilitySystem(options: VisibilitySystemOptions): VisibilitySystem {
  let settings = mergeCullingSettings(DEFAULT_CULLING_SETTINGS, options.settings ?? {});
  const occlusion = options.occlusion ?? noOcclusion;
  const index = options.index ?? createSpatialIndex();
  const bounds = options.boundsCache ?? createBoundsCache();
  const clock = options.now ?? nowMs;

  const records = new Map<string, ObjRecord>();
  const stats = createVisibilityStats();

  let visible = new Set<string>();
  let prevVisible = new Set<string>();
  const preload = new Set<string>();
  const requiredAssets = new Set<string>();

  const candidateScratch: string[] = [];
  const consideredStamp = new Map<string, number>();
  let consideredCounter = 0;

  const baseFrustum = createFrustum();
  const preloadFrustum = createFrustum();
  const hysteresisFrustum = createFrustum();

  let updateCounter = 0;

  function specOf(r: Renderable, resolved: ResolvedOverrides): BoundsSpec {
    return resolved.bounds ?? r.bounds ?? DEFAULT_BOUNDS;
  }

  function recordFor(r: Renderable): ObjRecord {
    let record = records.get(r.id);
    if (record !== undefined && record.version === r.version) {
      record.lastSeen = updateCounter;
      return record;
    }
    const resolved = resolveOverrides(r.overrides, r.layer !== undefined ? options.layerOverrides?.(r.layer) : undefined, options.sceneOverrides, options.globalOverrides);
    const alwaysVisible = resolved.alwaysVisible || r.alwaysVisible === true;
    const dynamic = resolved.classification !== "static";
    if (record === undefined) {
      record = { version: r.version, resolved, alwaysVisible, dynamic, assets: r.assets, lastSeen: updateCounter };
      records.set(r.id, record);
    } else {
      record.version = r.version;
      record.resolved = resolved;
      record.alwaysVisible = alwaysVisible;
      record.dynamic = dynamic;
      record.assets = r.assets;
      record.lastSeen = updateCounter;
    }
    return record;
  }

  function maintain(): Renderable[] {
    const alwaysVisibleList: Renderable[] = [];
    for (const r of options.renderables()) {
      const record = recordFor(r);
      const b = bounds.get(r.id, r.version, specOf(r, record.resolved), r.position);
      index.insert(r.id, b, record.dynamic);
      stats.totalObjects += 1;
      if (record.alwaysVisible) alwaysVisibleList.push(r);
    }
    // Prune objects that vanished this frame.
    for (const [id, record] of records) {
      if (record.lastSeen === updateCounter) continue;
      index.remove(id);
      bounds.delete(id);
      records.delete(id);
    }
    return alwaysVisibleList;
  }

  function markConsidered(id: string): boolean {
    if (consideredStamp.get(id) === consideredCounter) return false;
    consideredStamp.set(id, consideredCounter);
    return true;
  }

  function distanceLimits(camera: CameraVisibilityContext, resolved: ResolvedOverrides): { min: number; max: number } {
    const min = resolved.minRenderDistance ?? settings.defaultMinRenderDistance;
    let max = resolved.maxRenderDistance ?? settings.defaultMaxRenderDistance;
    if (camera.maxRenderDistance !== undefined) max = Math.min(max, camera.maxRenderDistance);
    return { min, max };
  }

  function evaluateCamera(camera: CameraVisibilityContext): void {
    const streaming = cameraInfluencesStreaming(camera);
    updateFrustum(baseFrustum, camera.view);
    dilateFrustum(baseFrustum, settings.preloadMargin, preloadFrustum);
    dilateFrustum(baseFrustum, settings.hysteresis, hysteresisFrustum);

    const cullingOff = camera.cullingDisabled === true || !settings.enabled;
    const t0 = clock();
    index.queryFrustum(preloadFrustum, candidateScratch);
    stats.spatialQueryMs += clock() - t0;

    const t1 = clock();
    for (const id of candidateScratch) {
      const record = records.get(id);
      if (record === undefined) continue;
      const b = bounds.peek(id);
      if (b === undefined) continue;
      const fresh = markConsidered(id);
      if (fresh) stats.consideredForRender += 1;
      const resolved = record.resolved;
      const cx = camera.view.position[0], cy = camera.view.position[1], cz = camera.view.position[2];

      let isVisible: boolean;
      if (cullingOff || record.alwaysVisible || resolved.cullingDisabled) {
        isVisible = true;
      } else {
        const custom = resolved.customVisibility?.(camera);
        if (custom !== undefined) {
          isVisible = custom;
        } else {
          const frustum = prevVisible.has(id) ? hysteresisFrustum : baseFrustum;
          if (settings.frustumCulling && !boundsInFrustum(frustum, b)) {
            if (fresh) stats.rejectedByFrustum += 1;
            isVisible = false;
          } else {
            const limits = distanceLimits(camera, resolved);
            if (
              settings.distanceCulling &&
              culledByDistance(cx, cy, cz, b.centerX, b.centerY, b.centerZ, limits.min, limits.max, b.radius, settings.hysteresis)
            ) {
              if (fresh) stats.rejectedByDistance += 1;
              isVisible = false;
            } else if (
              settings.occlusionCulling &&
              occlusion.enabled &&
              occlusion.isOccluded({ camera: camera.view, bounds: b, occluders: [] })
            ) {
              if (fresh) stats.rejectedByOcclusion += 1;
              isVisible = false;
            } else {
              isVisible = true;
            }
          }
        }
      }

      // Preload region: candidates already come from the preload-dilated frustum. Anything
      // visible, or within the preload region and not distance-culled far past the margin, preloads.
      const inPreload = isVisible || resolved.pinned || (!cullingOff && withinPreloadDistance(camera, resolved, b));
      if (inPreload) {
        preload.add(id);
        if (streaming && record.assets !== undefined) {
          for (const asset of record.assets) requiredAssets.add(asset);
        }
      }
      if (isVisible) visible.add(id);
    }
    stats.cullingMs += clock() - t1;
  }

  function withinPreloadDistance(camera: CameraVisibilityContext, resolved: ResolvedOverrides, b: RenderBounds): boolean {
    const limits = distanceLimits(camera, resolved);
    const max = limits.max === Infinity ? Infinity : limits.max + settings.preloadMargin;
    return !culledByDistance(
      camera.view.position[0], camera.view.position[1], camera.view.position[2],
      b.centerX, b.centerY, b.centerZ,
      0, max, b.radius, 0,
    );
  }

  function addAlwaysVisible(list: readonly Renderable[]): void {
    for (const r of list) {
      visible.add(r.id);
      preload.add(r.id);
      const record = records.get(r.id);
      if (record?.assets !== undefined) {
        for (const asset of record.assets) requiredAssets.add(asset);
      }
    }
  }

  return {
    update() {
      updateCounter += 1;
      consideredCounter += 1;
      resetCullingStats(stats);
      // Swap current → prev, reuse the old prev as the new current (cleared).
      const swap = prevVisible;
      prevVisible = visible;
      visible = swap;
      visible.clear();
      preload.clear();
      requiredAssets.clear();

      const alwaysVisibleList = maintain();
      const cameras = options.cameras();
      for (const camera of cameras) evaluateCamera(camera);
      addAlwaysVisible(alwaysVisibleList);

      stats.visible = visible.size;
      stats.preloaded = preload.size;
      stats.drawCallsAvoided = Math.max(0, stats.totalObjects - visible.size);
      return { visible, preload, stats };
    },
    isVisible(id) {
      return visible.has(id);
    },
    isPreloaded(id) {
      return preload.has(id);
    },
    boundsOf(id) {
      return bounds.peek(id);
    },
    settings() {
      return settings;
    },
    setSettings(patch) {
      settings = mergeCullingSettings(settings, patch);
    },
    stats() {
      return stats;
    },
    requiredAssets() {
      return requiredAssets;
    },
    index() {
      return index;
    },
    debugSnapshot() {
      const cameras = options.cameras().map((camera) => {
        updateFrustum(baseFrustum, camera.view);
        return {
          id: camera.id,
          kind: camera.kind ?? "main",
          corners: Array.from(baseFrustum.corners),
          preloadMargin: settings.preloadMargin,
        };
      });
      const boundsOut: VisibilityDebugSnapshot["bounds"] = [];
      const culled: string[] = [];
      for (const id of records.keys()) {
        const b = bounds.peek(id);
        if (b === undefined) continue;
        const vis = visible.has(id);
        boundsOut.push({ id, minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ, visible: vis });
        if (!vis) culled.push(id);
      }
      return { cameras, bounds: boundsOut, partitions: index.cells(), culled, stats };
    },
    clear() {
      index.clear();
      bounds.clear();
      records.clear();
      visible.clear();
      prevVisible.clear();
      preload.clear();
      requiredAssets.clear();
      consideredStamp.clear();
    },
  };
}
