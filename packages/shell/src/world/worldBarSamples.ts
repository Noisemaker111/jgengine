import type { SceneEntity, EntityPosition } from "@jgengine/core/scene/entityStore";
import { worldHealthBarAllowsRole } from "@jgengine/core/game/playableGame";
import type { CatalogEntityRole, GameContext } from "@jgengine/core/runtime/gameContext";

export interface WorldBarSample {
  /** Live anchor id used by retained samples; omitted for caller-painted screen samples. */
  entityId?: string;
  x: number;
  y: number;
  percent: number;
  /** Screen pixels per world metre at the anchor, so painted bars shrink with distance and zoom. */
  pxPerMeter?: number;
}

export interface Projectable {
  set(x: number, y: number, z: number): this;
  project(camera: { matrixWorldInverse: unknown; projectionMatrix: unknown }): this;
  x: number;
  y: number;
  z: number;
}

/** Render camera matrices; world translation supplies the overlay's viewpoint. */
export interface WorldOverlayCamera {
  matrixWorld: { elements: ArrayLike<number> };
  matrixWorldInverse: { elements: ArrayLike<number> };
  projectionMatrix: unknown;
  /** Clipping distance; bounds every derived overlay range. */
  far?: number;
}

/** Sampling policy shared by health bars and nameplates. */
export interface WorldOverlaySampleOptions {
  /** Maximum sampled overlays and visibility rays per refresh. Default 64; unchecked entities stay hidden. */
  maxSamples?: number;
  /** Match a renderer's visibility or membership policy. */
  isVisible?: (id: string) => boolean;
  /** Authored display name; return null to omit the nameplate. */
  resolveName?: (entity: SceneEntity) => string | null;
}

/** True when blocking scene geometry lies between the render camera and overlay anchor. @internal */
export function worldBarOccluded(
  ctx: GameContext,
  from: EntityPosition,
  target: EntityPosition,
): boolean {
  const dx = target[0] - from[0];
  const dy = target[1] - from[1];
  const dz = target[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return false;
  return ctx.scene.raycast({
    origin: from,
    direction: [dx / length, dy / length, dz / length],
    maxDistance: length - 0.001,
    filter: { entities: false },
    accept: (hit) => hit.blocks,
  }) !== null;
}

function cameraOrigin(camera: WorldOverlayCamera): EntityPosition {
  const matrix = camera.matrixWorld.elements;
  return [matrix[12]!, matrix[13]!, matrix[14]!];
}

/** Screen height at which an annotated target is still plainly visible. */
const MIN_TARGET_PX = 18;
/** `1 / tan(fovY / 2)` for the engine's default 55° camera, used when the projection is not perspective. */
const FALLBACK_PROJECTION_SCALE = 1 / Math.tan((55 * Math.PI) / 360);

/**
 * Overlay range for a camera that configured none. Two measured factors replace the magic
 * distance: the camera's own view of the ground (the frustum corner at the depth it looks down
 * through, so an overhead camera always reaches the units below it) and the distance at which an
 * `anchorHeight`-tall target stops covering {@link MIN_TARGET_PX} pixels. Clamped to the camera's
 * far plane.
 * @internal
 */
export function deriveWorldBarRange(
  camera: WorldOverlayCamera,
  viewport: { width: number; height: number },
  anchorHeight: number,
): number {
  const elements = camera.matrixWorld.elements;
  const cameraY = elements[13] ?? 0;
  const projection = (camera.projectionMatrix as { elements?: ArrayLike<number> } | null)?.elements;
  const perspective = projection !== undefined && projection[15] === 0 && (projection[5] ?? 0) > 0;
  const scale = perspective ? projection![5]! : FALLBACK_PROJECTION_SCALE;
  const tanHalf = 1 / scale;

  const height = Math.max(0.1, anchorHeight);
  const readable = viewport.height * 0.5 * scale * height / MIN_TARGET_PX;

  const depth = Math.max(0, cameraY - height);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const groundReach = depth * Math.sqrt(1 + tanHalf * tanHalf * (1 + aspect * aspect));

  const reach = Math.max(readable, groundReach);
  const far = camera.far;
  const clamped = Number.isFinite(far) && far !== undefined && far! > 0 ? Math.min(reach, far!) : reach;
  return Math.max(1, clamped);
}

/**
 * Nearest on-screen target the overlay would annotate, in world units from the render camera, or
 * `null` when nothing it covers is in view. Used to name the real distance when a configured
 * range hides every bar. Scans one frozen list and compares squared distances — no per-target
 * allocation — inside `searchRadius`.
 * @internal
 */
export function nearestOverlayTargetDistance(
  ctx: GameContext,
  camera: WorldOverlayCamera,
  anchorHeight: number,
  searchRadius: number,
  project: Projectable,
  options: WorldOverlaySampleOptions,
  accept: (entity: SceneEntity) => boolean,
): number | null {
  if (!Number.isFinite(searchRadius) || searchRadius <= 0) return null;
  const origin = cameraOrigin(camera);
  const limitSquared = searchRadius * searchRadius;
  let nearest = Infinity;
  for (const id of ctx.scene.entity.inRadius(origin, searchRadius)) {
    const entity = eligibleEntity(ctx, id, options);
    if (entity === null || !accept(entity)) continue;
    const dx = entity.position[0] - origin[0];
    const dy = entity.position[1] - origin[1];
    const dz = entity.position[2] - origin[2];
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared > limitSquared || distanceSquared >= nearest) continue;
    if (projectAnchor(entity, anchorHeight, camera, project) === null) continue;
    nearest = distanceSquared;
  }
  return Number.isFinite(nearest) ? Math.sqrt(nearest) : null;
}

/**
 * One-shot warning text for a configured overlay range that hides everything in view, or `null`
 * once it has reported the same block and distance.
 * @internal
 */
export function createOverlayRangeWarn(): (
  block: string,
  configured: number,
  nearest: number,
) => string | null {
  let reported = "";
  return (block, configured, nearest) => {
    const key = `${block}:${configured}`;
    if (reported === key) return null;
    reported = key;
    const suggested = Math.ceil(nearest + 1);
    return `[jgengine] ${block}.maxDistance ${configured} hides every overlay on screen: the nearest target is ${nearest.toFixed(1)} world units away. Raise ${block}.maxDistance to about ${suggested}, or drop it to derive the range from the camera.`;
  };
}

function projectAnchor(entity: SceneEntity, height: number, camera: WorldOverlayCamera, project: Projectable): EntityPosition | null {
  const anchor: EntityPosition = [entity.position[0], entity.position[1] + height, entity.position[2]];
  const inverse = camera.matrixWorldInverse.elements;
  const cameraZ = inverse[2]! * anchor[0] + inverse[6]! * anchor[1] + inverse[10]! * anchor[2] + inverse[14]!;
  if (!Number.isFinite(cameraZ) || cameraZ >= 0) return null;
  project.set(...anchor).project(camera);
  if (!Number.isFinite(project.x) || !Number.isFinite(project.y) || !Number.isFinite(project.z)) return null;
  if (Math.abs(project.x) > 1 || Math.abs(project.y) > 1 || Math.abs(project.z) > 1) return null;
  return anchor;
}

/**
 * Screen pixels per world metre at `anchor`: project a point one metre along the camera's right
 * axis and measure the gap. Call after reading the anchor's own projection — `project` is reused.
 */
function pixelsPerMeter(anchor: EntityPosition, camera: WorldOverlayCamera, project: Projectable, viewport: { width: number; height: number }, x: number, y: number): number {
  const m = camera.matrixWorld.elements;
  project.set(anchor[0] + m[0]!, anchor[1] + m[1]!, anchor[2] + m[2]!).project(camera);
  const px = (project.x * 0.5 + 0.5) * viewport.width;
  const py = (-project.y * 0.5 + 0.5) * viewport.height;
  const scale = Math.hypot(px - x, py - y);
  return Number.isFinite(scale) ? scale : 0;
}

function healthFraction(stat: { min: number; max: number; current: number }): number {
  const range = stat.max - stat.min;
  return range <= 0 ? 0 : Math.max(0, Math.min(1, (stat.current - stat.min) / range));
}

function eligibleEntity(ctx: GameContext, id: string, options: WorldOverlaySampleOptions): SceneEntity | null {
  if (id === ctx.player.userId || id === ctx.player.possession.active(ctx.player.userId) || options.isVisible?.(id) === false) return null;
  const entity = ctx.scene.entity.get(id);
  if (entity === null || entity.hidden === true) return null;
  const health = ctx.scene.entity.stats.get(id, "health");
  if (health !== null && health.current <= health.min) return null;
  return entity;
}

function sampleLimit(options: WorldOverlaySampleOptions): number {
  return Math.max(0, Math.min(256, Math.floor(options.maxSamples ?? 64) || 0));
}

/** Target filter mirroring the bars' own eligibility, for range diagnostics. @internal */
export function worldBarTargetFilter(
  ctx: GameContext,
  statId: string,
  roles: readonly CatalogEntityRole[] | undefined,
  resolveRole: ((entity: SceneEntity) => CatalogEntityRole | undefined) | undefined,
): (entity: SceneEntity) => boolean {
  return (entity) =>
    worldHealthBarAllowsRole(roles, resolveRole?.(entity)) && ctx.scene.entity.stats.get(entity.id, statId) !== null;
}

/** Target filter mirroring the nameplates' own eligibility, for range diagnostics. @internal */
export function worldNameplateTargetFilter(
  roles: readonly CatalogEntityRole[] | undefined,
  resolveRole: ((entity: SceneEntity) => CatalogEntityRole | undefined) | undefined,
  resolveName: ((entity: SceneEntity) => string | null) | undefined,
): (entity: SceneEntity) => boolean {
  return (entity) =>
    worldHealthBarAllowsRole(roles, resolveRole?.(entity)) &&
    Boolean((resolveName ?? defaultDisplayName)(entity)?.trim());
}

/** Project nearby live non-local entities carrying `statId`; occlusion defaults on. @internal */
export function collectWorldBarSamples(
  ctx: GameContext,
  statId: string,
  height: number,
  roles: readonly CatalogEntityRole[] | undefined,
  resolveRole: ((entity: SceneEntity) => CatalogEntityRole | undefined) | undefined,
  camera: WorldOverlayCamera,
  viewport: { width: number; height: number },
  into: WorldBarSample[],
  project: Projectable,
  maxDistance?: number,
  occlude = true,
  options: WorldOverlaySampleOptions = {},
): number {
  into.length = 0;
  const origin = cameraOrigin(camera);
  const limit = sampleLimit(options);
  const range = maxDistance ?? deriveWorldBarRange(camera, viewport, height);
  if (limit === 0 || !Number.isFinite(range) || range <= 0) return 0;
  let checked = 0;
  for (const id of ctx.scene.entity.inRadius(origin, range)) {
    const entity = eligibleEntity(ctx, id, options);
    if (entity === null || !worldHealthBarAllowsRole(roles, resolveRole?.(entity))) continue;
    const stat = ctx.scene.entity.stats.get(id, statId);
    if (stat === null) continue;
    const anchor = projectAnchor(entity, height, camera, project);
    if (anchor === null) continue;
    if (checked++ >= limit) break;
    if (occlude && worldBarOccluded(ctx, origin, anchor)) continue;
    const x = (project.x * 0.5 + 0.5) * viewport.width;
    const y = (-project.y * 0.5 + 0.5) * viewport.height;
    into.push({
      entityId: id,
      x,
      y,
      percent: healthFraction(stat),
      pxPerMeter: pixelsPerMeter(anchor, camera, project, viewport, x, y),
    });
  }
  return into.length;
}

/** Reproject retained bar anchors without a nearby query or visibility ray. @internal */
export function refreshWorldBarSamples(
  ctx: GameContext,
  height: number,
  camera: WorldOverlayCamera,
  viewport: { width: number; height: number },
  samples: WorldBarSample[],
  project: Projectable,
  maxDistance?: number,
  options: WorldOverlaySampleOptions = {},
): void {
  const origin = cameraOrigin(camera);
  const range = maxDistance ?? deriveWorldBarRange(camera, viewport, height);
  const rangeSquared = range * range;
  let kept = 0;
  for (const sample of samples) {
    if (sample.entityId === undefined) continue;
    const entity = eligibleEntity(ctx, sample.entityId, options);
    if (entity === null) continue;
    const dx = entity.position[0] - origin[0];
    const dy = entity.position[1] - origin[1];
    const dz = entity.position[2] - origin[2];
    if (dx * dx + dy * dy + dz * dz > rangeSquared) continue;
    const anchor = projectAnchor(entity, height, camera, project);
    if (anchor === null) continue;
    sample.x = (project.x * 0.5 + 0.5) * viewport.width;
    sample.y = (-project.y * 0.5 + 0.5) * viewport.height;
    sample.pxPerMeter = pixelsPerMeter(anchor, camera, project, viewport, sample.x, sample.y);
    samples[kept++] = sample;
  }
  samples.length = kept;
}

/** Projected nameplate with optional health and distance from the render camera. */
export interface NameplateSample {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Health-stat fraction 0..1, or null for a statless entity. */
  percent: number | null;
  distance: number;
}

function defaultDisplayName(entity: SceneEntity): string | null {
  const name = entity.name.trim();
  // Entity names also key catalogs; machine identifiers need an explicit display-name resolver.
  return name === entity.id || /^[a-z0-9_-]+$/.test(name) || /[_:/]/.test(name) ? null : name || null;
}

/** Project nearby live non-local nameplates; occlusion defaults on. @internal */
export function collectNameplateSamples(
  ctx: GameContext,
  statId: string,
  height: number,
  roles: readonly CatalogEntityRole[] | undefined,
  resolveRole: ((entity: SceneEntity) => CatalogEntityRole | undefined) | undefined,
  camera: WorldOverlayCamera,
  viewport: { width: number; height: number },
  into: NameplateSample[],
  project: Projectable,
  maxDistance?: number,
  occlude = true,
  options: WorldOverlaySampleOptions = {},
): number {
  into.length = 0;
  const origin = cameraOrigin(camera);
  const limit = sampleLimit(options);
  const range = maxDistance ?? deriveWorldBarRange(camera, viewport, height);
  if (limit === 0 || !Number.isFinite(range) || range <= 0) return 0;
  let checked = 0;
  for (const id of ctx.scene.entity.inRadius(origin, range)) {
    const entity = eligibleEntity(ctx, id, options);
    if (entity === null || !worldHealthBarAllowsRole(roles, resolveRole?.(entity))) continue;
    const name = (options.resolveName ?? defaultDisplayName)(entity)?.trim();
    if (!name) continue;
    const anchor = projectAnchor(entity, height, camera, project);
    if (anchor === null) continue;
    if (checked++ >= limit) break;
    if (occlude && worldBarOccluded(ctx, origin, anchor)) continue;
    const stat = ctx.scene.entity.stats.get(id, statId);
    into.push({
      id,
      name,
      x: (project.x * 0.5 + 0.5) * viewport.width,
      y: (-project.y * 0.5 + 0.5) * viewport.height,
      percent: stat === null ? null : healthFraction(stat),
      distance: Math.hypot(entity.position[0] - origin[0], entity.position[1] - origin[1], entity.position[2] - origin[2]),
    });
  }
  return into.length;
}

/** World width a health bar spans over its entity, in metres. */
const WORLD_BAR_METERS = 1.4;
const MIN_BAR_WIDTH_PX = 28;

/**
 * Painted bar size for a sample: about {@link WORLD_BAR_METERS} wide at the anchor's on-screen
 * scale, clamped between a still-readable minimum and the configured maximum, with height in
 * proportion. Samples without a scale (caller-painted screen samples) keep the maximum.
 * @internal
 */
export function worldBarSize(pxPerMeter: number | undefined, maxWidthPx = 112, maxHeightPx = 10): { width: number; height: number } {
  if (pxPerMeter === undefined || !(pxPerMeter > 0)) return { width: maxWidthPx, height: maxHeightPx };
  const width = Math.max(Math.min(MIN_BAR_WIDTH_PX, maxWidthPx), Math.min(maxWidthPx, pxPerMeter * WORLD_BAR_METERS));
  const height = Math.max(4, Math.min(maxHeightPx, Math.round(width / 11)));
  return { width: Math.round(width), height };
}

/** @internal */
export function paintWorldBarSamples(
  canvas: { width: number; height: number; getContext(kind: "2d"): CanvasRenderingContext2D | null },
  samples: readonly WorldBarSample[],
  dpr: number,
  maxBarWidthPx = 112,
  maxBarHeightPx = 10,
): void {
  const g = canvas.getContext("2d");
  if (g === null) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const sample of samples) {
    const { width: barWidthPx, height: barHeightPx } = worldBarSize(sample.pxPerMeter, maxBarWidthPx, maxBarHeightPx);
    const left = sample.x - barWidthPx / 2;
    const top = sample.y - barHeightPx / 2;
    g.fillStyle = "rgba(0,0,0,0.7)";
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.lineWidth = 1;
    g.fillRect(left, top, barWidthPx, barHeightPx);
    g.strokeRect(left + 0.5, top + 0.5, barWidthPx - 1, barHeightPx - 1);
    const fill = Math.max(0, Math.min(barWidthPx, sample.percent * barWidthPx));
    if (fill > 0) {
      const gradient = g.createLinearGradient(left, top, left + barWidthPx, top);
      gradient.addColorStop(0, "#e11d48");
      gradient.addColorStop(1, "#f87171");
      g.fillStyle = gradient;
      g.fillRect(left, top, fill, barHeightPx);
    }
  }
}
