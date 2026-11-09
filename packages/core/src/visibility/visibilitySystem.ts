import type { RenderBounds, BoundsSpec } from "./bounds";
import { DEFAULT_BOUNDS, createBoundsCache } from "./bounds";
import type { BoundsCache } from "./bounds";
import type { CameraVisibilityContext, CameraKind } from "./camera";
import { cameraInfluencesStreaming } from "./camera";
import { createFrustum, updateFrustum, dilateFrustum, boundsInFrustum } from "./frustum";
import { culledByDistance } from "./distance";
import type { SpatialIndex } from "../spatial/spatialIndex";
import { createSpatialIndex } from "../spatial/spatialIndex";
import type { CullingSettings, ObjectVisibilityOverrides, ResolvedOverrides } from "./settings";
import { DEFAULT_CULLING_SETTINGS, mergeCullingSettings, resolveOverrides } from "./settings";
import type { OcclusionTester } from "./occlusion";
import { noOcclusion } from "./occlusion";
import type { VisibilityStats } from "./diagnostics";
import { nowMs } from "../devtools/frame";
import { createVisibilityStats, resetCullingStats } from "./diagnostics";
import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";

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
  readonly overrides?: ObjectVisibilityOverrides | undefined;
  readonly layer?: string;
  /** Fast-path exemption for UI, skyboxes, debug overlays, camera-attached, marked always-visible. */
  readonly alwaysVisible?: boolean;
  /** Asset ids this object needs loaded; feeds the streaming preload/retain sets. */
  readonly assets?: readonly string[];
}

/** One group of renderables a {@link VisibilitySystem} walks, such as the scene's actors or its props. */
export interface RenderableSource {
  /** Every renderable of the group. */
  readonly renderables: () => Iterable<Renderable>;
  /**
   * Moves whenever a renderable of the group is added, removed or changed. The group is walked only on
   * an update where it moved, so still props cost nothing while actors walk. Without it the group is
   * walked on every update.
   */
  readonly revision?: () => number;
}

export interface VisibilitySystemOptions {
  /** The scene's renderables, in groups; an id belongs to one group. */
  readonly sources: readonly RenderableSource[];
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

/** A read-only set of ids: membership, count and iteration. */
export interface IdSet extends Iterable<string> {
  readonly size: number;
  has(id: string): boolean;
}

export interface VisibilityResult {
  /** Objects to submit to the renderer this frame. Valid until the next `update()` (reused set). */
  readonly visible: IdSet;
  /** Objects within the preload region — load their assets, whether or not they render. */
  readonly preload: IdSet;
  readonly stats: VisibilityStats;
  /**
   * Counts the updates whose visible set differed from the one before. Unchanged means every id
   * visible last update is visible now and no other, so work keyed on the visible set can be skipped.
   */
  readonly generation: number;
  /**
   * The ids whose visibility differs from the update before: the ones that entered `visible` and the
   * ones that left it. Empty when the set is unchanged. Valid until the next `update()` (reused array).
   */
  readonly changed: readonly string[];
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
  /** The spatial index already holds this version's bounds. */
  indexed: boolean;
  /** The bounds the index holds for it, kept here so the per-frame loop does no second lookup. */
  bounds: RenderBounds | undefined;
  /** The last evaluation that considered it, so several cameras count it once. */
  considered: number;
  /** The last evaluation that drew it, and the one before that: the previous frame's set without a set lookup. */
  visibleIn: number;
  priorVisibleIn: number;
  /** The last evaluation that put it in the preload set. */
  preloadIn: number;
}

/**
 * The ids one evaluation put in a set, listed once each: membership is read from a stamp on the id's
 * record, so filling it costs a push, where a `Set` cleared and refilled every frame regrew its table
 * from empty. Ids without a record (none in practice) go in `loose`.
 */
class StampedIds implements IdSet {
  list: string[] = [];
  readonly loose = new Set<string>();

  constructor(private readonly stamped: (id: string) => boolean) {}

  get size(): number {
    return this.list.length + this.loose.size;
  }

  has(id: string): boolean {
    return this.stamped(id) || (this.loose.size > 0 && this.loose.has(id));
  }

  reset(): void {
    this.list.length = 0;
    if (this.loose.size > 0) this.loose.clear();
  }

  *[Symbol.iterator](): Iterator<string> {
    yield* this.list;
    yield* this.loose;
  }
}

/** What one source's last walk found: its revision then, its ids in walk order and its always-visible ones. */
interface SourceWalk {
  revision: number;
  ids: string[];
  spare: string[];
  always: Renderable[];
}

/** Numbers per camera that {@link sameCameras} compares: everything an evaluation reads from it. */
const CAMERA_STRIDE = 18;

function writeCamera(out: Float64Array, offset: number, camera: CameraVisibilityContext): void {
  const view = camera.view;
  out[offset] = view.kind === "perspective" ? 1 : 2;
  out[offset + 1] = view.position[0];
  out[offset + 2] = view.position[1];
  out[offset + 3] = view.position[2];
  out[offset + 4] = view.target[0];
  out[offset + 5] = view.target[1];
  out[offset + 6] = view.target[2];
  out[offset + 7] = view.up?.[0] ?? Number.NaN;
  out[offset + 8] = view.up?.[1] ?? Number.NaN;
  out[offset + 9] = view.up?.[2] ?? Number.NaN;
  out[offset + 10] = (view.kind === "perspective" ? view.fovDeg : view.halfWidth) ?? Number.NaN;
  out[offset + 11] = (view.kind === "perspective" ? view.aspect : view.halfHeight) ?? Number.NaN;
  out[offset + 12] = view.near ?? Number.NaN;
  out[offset + 13] = view.far ?? Number.NaN;
  out[offset + 14] = camera.cullingDisabled === true ? 1 : 0;
  out[offset + 15] = camera.maxRenderDistance ?? Number.NaN;
  out[offset + 16] = cameraInfluencesStreaming(camera) ? 1 : 0;
  out[offset + 17] = 0;
}

/** Whether `cameras` match the ones `written` holds, number for number (NaN matches NaN). */
function sameCameras(written: Float64Array, count: number, cameras: readonly CameraVisibilityContext[], scratch: Float64Array): boolean {
  if (count !== cameras.length) return false;
  for (let index = 0; index < cameras.length; index += 1) {
    const offset = index * CAMERA_STRIDE;
    writeCamera(scratch, 0, cameras[index]!);
    for (let field = 0; field < CAMERA_STRIDE; field += 1) {
      const a = written[offset + field]!;
      const b = scratch[field]!;
      if (a !== b && !(a !== a && b !== b)) return false;
    }
  }
  return true;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createVisibilitySystem(options: VisibilitySystemOptions): VisibilitySystem {
  let settings = mergeCullingSettings(DEFAULT_CULLING_SETTINGS, options.settings ?? {});
  const occlusion = options.occlusion ?? noOcclusion;
  const index = options.index ?? createSpatialIndex();
  const bounds = options.boundsCache ?? createBoundsCache();
  const clock = options.now ?? nowMs;

  const records = new Map<string, ObjRecord>();
  const stats = createVisibilityStats();

  let consideredCounter = 0;
  const visible = new StampedIds((id) => records.get(id)?.visibleIn === consideredCounter);
  // The previous evaluation's visible ids, for the ones that left and for record-less ids.
  let prevList: string[] = [];
  const prevLoose = new Set<string>();
  let generation = 0;
  const preload = new StampedIds((id) => records.get(id)?.preloadIn === consideredCounter);
  const requiredAssets = new Set<string>();

  const candidateScratch: string[] = [];

  const baseFrustum = createFrustum();
  const preloadFrustum = createFrustum();
  const hysteresisFrustum = createFrustum();

  let updateCounter = 0;

  const disposeProbe = devtools.probes.registerSystem("render/culling", {
    counters: () => ({
      totalObjects: stats.totalObjects,
      visible: stats.visible,
      preloaded: stats.preloaded,
      culled: stats.drawCallsAvoided,
      rejectedByFrustum: stats.rejectedByFrustum,
      rejectedByDistance: stats.rejectedByDistance,
      rejectedByOcclusion: stats.rejectedByOcclusion,
    }),
    timers: () => ({
      spatialQueryMs: round2(stats.spatialQueryMs),
      cullingMs: round2(stats.cullingMs),
    }),
    state: () =>
      `${stats.visible}/${stats.totalObjects} visible · ${stats.drawCallsAvoided} culled · ${round2(stats.cullingMs)}ms`,
  });

  function specOf(r: Renderable, resolved: ResolvedOverrides): BoundsSpec {
    return resolved.bounds ?? r.bounds ?? DEFAULT_BOUNDS;
  }

  /** Records whose overrides carry a `customVisibility`, which may answer differently for the same inputs. */
  let customRecords = 0;

  function recordFor(r: Renderable): ObjRecord {
    let record = records.get(r.id);
    if (record !== undefined && record.version === r.version) {
      record.lastSeen = updateCounter;
      return record;
    }
    const resolved = resolveOverrides(r.overrides, r.layer !== undefined ? options.layerOverrides?.(r.layer) : undefined, options.sceneOverrides, options.globalOverrides);
    const alwaysVisible = resolved.alwaysVisible || r.alwaysVisible === true;
    const dynamic = resolved.classification !== "static";
    if (resolved.customVisibility !== undefined) customRecords += 1;
    if (record === undefined) {
      record = { version: r.version, resolved, alwaysVisible, dynamic, assets: r.assets, lastSeen: updateCounter, indexed: false, bounds: undefined, considered: -1, visibleIn: -1, priorVisibleIn: -1, preloadIn: -1 };
      records.set(r.id, record);
    } else {
      if (record.resolved.customVisibility !== undefined) customRecords -= 1;
      record.version = r.version;
      record.resolved = resolved;
      record.alwaysVisible = alwaysVisible;
      record.dynamic = dynamic;
      record.assets = r.assets;
      record.lastSeen = updateCounter;
      record.indexed = false;
    }
    return record;
  }

  function prune(id: string): void {
    const record = records.get(id);
    if (record === undefined || record.lastSeen === updateCounter) return;
    if (record.resolved.customVisibility !== undefined) customRecords -= 1;
    index.remove(id);
    bounds.delete(id);
    records.delete(id);
  }

  const walks: SourceWalk[] = options.sources.map(() => ({ revision: Number.NaN, ids: [], spare: [], always: [] }));
  let trackedObjects = 0;

  /**
   * Walk every source whose revision moved: refresh its records and index entries, and drop the ids its
   * last walk had that this one did not. True when any source was walked.
   */
  function maintain(): boolean {
    let walkedAny = false;
    for (let s = 0; s < walks.length; s += 1) {
      const source = options.sources[s]!;
      const walk = walks[s]!;
      const revision = source.revision?.();
      if (revision !== undefined && revision === walk.revision) continue;
      walk.revision = revision ?? Number.NaN;
      walkedAny = true;
      const ids = walk.spare;
      ids.length = 0;
      walk.always.length = 0;
      for (const r of source.renderables()) {
        const record = recordFor(r);
        if (!record.indexed) {
          record.bounds = bounds.get(r.id, r.version, specOf(r, record.resolved), r.position);
          index.insert(r.id, record.bounds, record.dynamic);
          record.indexed = true;
        }
        ids.push(r.id);
        if (record.alwaysVisible) walk.always.push(r);
      }
      // Ids the last walk had and this one did not left the scene.
      for (const id of walk.ids) prune(id);
      walk.spare = walk.ids;
      walk.ids = ids;
    }
    if (walkedAny) {
      trackedObjects = 0;
      for (const walk of walks) trackedObjects += walk.ids.length;
    }
    return walkedAny;
  }

  // What the last evaluation read, so an update with the same inputs can keep its result.
  let cameraNumbers = new Float64Array(CAMERA_STRIDE);
  const cameraScratch = new Float64Array(CAMERA_STRIDE);
  let cameraCount = -1;
  let settingsChanged = true;

  function rememberCameras(cameras: readonly CameraVisibilityContext[]): void {
    if (cameraNumbers.length < cameras.length * CAMERA_STRIDE) cameraNumbers = new Float64Array(cameras.length * CAMERA_STRIDE);
    for (let index = 0; index < cameras.length; index += 1) writeCamera(cameraNumbers, index * CAMERA_STRIDE, cameras[index]!);
    cameraCount = cameras.length;
  }

  // Ids this evaluation drew that the last one did not: with equal sizes, none means the same set.
  let entered = 0;
  // The entered ids, then (once the evaluation is done) the ones that left.
  const changed: string[] = [];

  /** Draw `id` this evaluation; `record` carries the stamps that answer "drawn last frame?". */
  function show(id: string, record: ObjRecord | undefined): void {
    if (record === undefined) {
      if (visible.loose.has(id)) return;
      if (!prevLoose.has(id)) {
        entered += 1;
        changed.push(id);
      }
      visible.loose.add(id);
    } else if (record.visibleIn !== consideredCounter) {
      if (record.visibleIn !== consideredCounter - 1) {
        entered += 1;
        changed.push(id);
      }
      record.priorVisibleIn = record.visibleIn;
      record.visibleIn = consideredCounter;
      visible.list.push(id);
    }
  }

  /** Preload `id` this evaluation. */
  function preloadId(id: string, record: ObjRecord | undefined): void {
    if (record === undefined) preload.loose.add(id);
    else if (record.preloadIn !== consideredCounter) {
      record.preloadIn = consideredCounter;
      preload.list.push(id);
    }
  }

  /** Whether the last evaluation drew it: the frame hysteresis holds an object in. */
  function shownLastFrame(record: ObjRecord): boolean {
    const last = consideredCounter - 1;
    return record.visibleIn === last || (record.visibleIn === consideredCounter && record.priorVisibleIn === last);
  }

  /** Written by `distanceLimits` for every candidate, every frame: one object, read before the next call. */
  const limitScratch = { min: 0, max: 0 };
  function distanceLimits(camera: CameraVisibilityContext, resolved: ResolvedOverrides): { readonly min: number; readonly max: number } {
    limitScratch.min = resolved.minRenderDistance ?? settings.defaultMinRenderDistance;
    limitScratch.max = resolved.maxRenderDistance ?? settings.defaultMaxRenderDistance;
    if (camera.maxRenderDistance !== undefined) limitScratch.max = Math.min(limitScratch.max, camera.maxRenderDistance);
    return limitScratch;
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
    const cx = camera.view.position[0], cy = camera.view.position[1], cz = camera.view.position[2];
    for (let candidate = 0; candidate < candidateScratch.length; candidate += 1) {
      const id = candidateScratch[candidate]!;
      const record = records.get(id);
      if (record === undefined) continue;
      const b = record.bounds;
      if (b === undefined) continue;
      const fresh = record.considered !== consideredCounter;
      record.considered = consideredCounter;
      if (fresh) stats.consideredForRender += 1;
      const resolved = record.resolved;

      let isVisible: boolean;
      if (cullingOff || record.alwaysVisible || resolved.cullingDisabled) {
        isVisible = true;
      } else {
        const custom = resolved.customVisibility?.(camera);
        if (custom !== undefined) {
          isVisible = custom;
        } else {
          const frustum = shownLastFrame(record) ? hysteresisFrustum : baseFrustum;
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
        preloadId(id, record);
        if (streaming && record.assets !== undefined) {
          for (const asset of record.assets) requiredAssets.add(asset);
        }
      }
      if (isVisible) show(id, record);
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

  function addAlwaysVisible(): void {
    for (const walk of walks) for (const r of walk.always) {
      const record = records.get(r.id);
      show(r.id, record);
      preloadId(r.id, record);
      if (record?.assets !== undefined) {
        for (const asset of record.assets) requiredAssets.add(asset);
      }
    }
  }

  return {
    update() {
      updateCounter += 1;
      const walked = maintain();
      const cameras = options.cameras();
      // The same objects, cameras and settings as the last evaluation give the same sets: an object it
      // kept is tested against the wider hysteresis frustum and passes again, and one it dropped is
      // tested against the narrower one and fails again (so it needs a margin of at least 0). Custom
      // visibility and occlusion read state of their own, so with either in play every update evaluates.
      const occluding = settings.occlusionCulling && occlusion.enabled;
      if (!walked && !settingsChanged && customRecords === 0 && !occluding && settings.hysteresis >= 0 && sameCameras(cameraNumbers, cameraCount, cameras, cameraScratch)) {
        changed.length = 0;
        return { visible, preload, stats, generation, changed };
      }
      settingsChanged = false;
      rememberCameras(cameras);
      consideredCounter += 1;
      resetCullingStats(stats);
      stats.totalObjects = trackedObjects;
      // The current list becomes the previous one, and the old previous list is reused for the new one.
      const spare = prevList;
      prevList = visible.list;
      visible.list = spare;
      prevLoose.clear();
      for (const id of visible.loose) prevLoose.add(id);
      const previousSize = prevList.length + prevLoose.size;
      visible.reset();
      preload.reset();
      requiredAssets.clear();
      entered = 0;
      changed.length = 0;

      for (const camera of cameras) evaluateCamera(camera);
      addAlwaysVisible();

      stats.visible = visible.size;
      stats.preloaded = preload.size;
      stats.drawCallsAvoided = Math.max(0, stats.totalObjects - visible.size);
      if (entered > 0 || visible.size !== previousSize) {
        generation += 1;
        for (const id of prevList) if (records.get(id)?.visibleIn !== consideredCounter) changed.push(id);
        for (const id of prevLoose) if (!visible.has(id)) changed.push(id);
      }
      return { visible, preload, stats, generation, changed };
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
      settingsChanged = true;
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
      disposeProbe();
      index.clear();
      bounds.clear();
      records.clear();
      visible.reset();
      prevList.length = 0;
      prevLoose.clear();
      changed.length = 0;
      preload.reset();
      requiredAssets.clear();
      for (const walk of walks) {
        walk.revision = Number.NaN;
        walk.ids.length = 0;
        walk.always.length = 0;
      }
      trackedObjects = 0;
      customRecords = 0;
      settingsChanged = true;
    },
  };
}
