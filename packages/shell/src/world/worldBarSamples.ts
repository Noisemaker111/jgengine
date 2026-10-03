import type { SceneEntity, EntityPosition } from "@jgengine/core/scene/entityStore";
import { worldHealthBarAllowsRole } from "@jgengine/core/game/playableGame";
import type { CatalogEntityRole, GameContext } from "@jgengine/core/runtime/gameContext";

export interface WorldBarSample {
  /** Live anchor id used by retained samples; omitted for caller-painted screen samples. */
  entityId?: string;
  x: number;
  y: number;
  percent: number;
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
  maxDistance = 60,
  occlude = true,
  options: WorldOverlaySampleOptions = {},
): number {
  into.length = 0;
  const origin = cameraOrigin(camera);
  const limit = sampleLimit(options);
  if (limit === 0 || !Number.isFinite(maxDistance) || maxDistance <= 0) return 0;
  let checked = 0;
  for (const id of ctx.scene.entity.inRadius(origin, maxDistance)) {
    const entity = eligibleEntity(ctx, id, options);
    if (entity === null || !worldHealthBarAllowsRole(roles, resolveRole?.(entity))) continue;
    const stat = ctx.scene.entity.stats.get(id, statId);
    if (stat === null) continue;
    const anchor = projectAnchor(entity, height, camera, project);
    if (anchor === null) continue;
    if (checked++ >= limit) break;
    if (occlude && worldBarOccluded(ctx, origin, anchor)) continue;
    into.push({
      entityId: id,
      x: (project.x * 0.5 + 0.5) * viewport.width,
      y: (-project.y * 0.5 + 0.5) * viewport.height,
      percent: healthFraction(stat),
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
  maxDistance = 60,
  options: WorldOverlaySampleOptions = {},
): void {
  const origin = cameraOrigin(camera);
  let kept = 0;
  for (const sample of samples) {
    if (sample.entityId === undefined) continue;
    const entity = eligibleEntity(ctx, sample.entityId, options);
    if (entity === null || Math.hypot(entity.position[0] - origin[0], entity.position[1] - origin[1], entity.position[2] - origin[2]) > maxDistance) continue;
    if (projectAnchor(entity, height, camera, project) === null) continue;
    sample.x = (project.x * 0.5 + 0.5) * viewport.width;
    sample.y = (-project.y * 0.5 + 0.5) * viewport.height;
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
  maxDistance = 40,
  occlude = true,
  options: WorldOverlaySampleOptions = {},
): number {
  into.length = 0;
  const origin = cameraOrigin(camera);
  const limit = sampleLimit(options);
  if (limit === 0 || !Number.isFinite(maxDistance) || maxDistance <= 0) return 0;
  let checked = 0;
  for (const id of ctx.scene.entity.inRadius(origin, maxDistance)) {
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

/** @internal */
export function paintWorldBarSamples(
  canvas: { width: number; height: number; getContext(kind: "2d"): CanvasRenderingContext2D | null },
  samples: readonly WorldBarSample[],
  dpr: number,
  barWidthPx = 112,
  barHeightPx = 10,
): void {
  const g = canvas.getContext("2d");
  if (g === null) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const halfW = barWidthPx / 2;
  const halfH = barHeightPx / 2;
  for (const sample of samples) {
    const left = sample.x - halfW;
    const top = sample.y - halfH;
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
