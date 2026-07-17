import type { Aabb, Vec2 } from "../world/geometry";
import { scatter } from "../world/scatter";
import { pointInPolygon, polygonBounds } from "../world/scatterRegion";
import type {
  EditorDirective,
  EditorDirectiveKind,
  EditorDocument,
  EditorPopulationDirective,
  EditorPopulationSpecies,
  EditorScatterDirective,
} from "./types";

/**
 * The deterministic materializer for scene {@link EditorDirective}s — the bake side of the
 * bake/patch seam in #985. A directive is one authored line ("scatter rocks across the north
 * ridge"); this expands it into many placements with **stable per-instance ids** (`<directiveId>#
 * <index>`) so a sparse overlay can hand-tweak or delete individual instances by id without every
 * re-materialize orphaning those edits. Fully deterministic: same directive + seed + region ⇒ the
 * same field, every time (safe for verify/CI). Built on the existing `scatter` primitive.
 */

/** One materialized placement from a directive — grounded XZ, deterministic scale/yaw, stable id. */
export interface MaterializedInstance {
  /** Stable id `<directiveId>#<index>` — the key an overlay patches or deletes. */
  id: string;
  /** The directive that minted this instance. */
  directiveId: string;
  kind: EditorDirectiveKind;
  /** What to place: a `scatter` directive's catalog asset, or a `population` directive's species id. */
  asset: string;
  x: number;
  z: number;
  /** Vertical offset in meters (0 unless an overlay sets it); grounding on terrain stays the caller's job. */
  y: number;
  rotationY: number;
  scale: number;
}

/** A resolved directive footprint: the XZ bounds to scatter within, plus an optional clip polygon. */
export interface DirectiveFootprint {
  area: Aabb;
  polygon?: Vec2[];
}

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Resolves the footprint a directive fills: an explicit `area`, else the footprint of the named
 * `region` — a scatter/closed path (as a clip polygon) or a volume (its XZ AABB). Null when neither
 * is present or the region id does not resolve.
 * @capability world-directives resolve a directive's region footprint from the scene document
 */
export function resolveDirectiveFootprint(
  doc: EditorDocument,
  directive: EditorDirective,
): DirectiveFootprint | null {
  if (directive.area !== undefined) {
    const { min, max } = directive.area;
    return { area: { minX: min[0], minZ: min[1], maxX: max[0], maxZ: max[1] } };
  }
  if (directive.region === undefined) return null;

  const path = doc.paths.find((p) => p.id === directive.region);
  if (path !== undefined && path.points.length >= 3) {
    const polygon = path.points.map((point) => [point.x, point.z] as Vec2);
    const area = polygonBounds(polygon);
    if (area === null) return null;
    return { area, polygon };
  }

  const volume = doc.volumes.find((v) => v.id === directive.region);
  if (volume !== undefined) {
    const half =
      volume.halfExtents !== undefined
        ? { x: volume.halfExtents.x, z: volume.halfExtents.z }
        : volume.radius !== undefined
          ? { x: volume.radius, z: volume.radius }
          : null;
    if (half === null) return null;
    return {
      area: {
        minX: volume.center.x - half.x,
        minZ: volume.center.z - half.z,
        maxX: volume.center.x + half.x,
        maxZ: volume.center.z + half.z,
      },
    };
  }
  return null;
}

function scatterSeed(directive: EditorDirective): string {
  return `${directive.id}:${directive.seed ?? directive.id}`;
}

/**
 * Materializes a scatter directive into deterministic catalog-prop placements across its footprint,
 * clipped to the region polygon when one is present. Per-instance scale and yaw derive from the
 * directive id + seed + point index, so ids are stable across re-materializes.
 * @capability world-directives materialize a scatter directive into placements
 */
export function materializeScatterDirective(
  directive: EditorScatterDirective,
  footprint: DirectiveFootprint,
): MaterializedInstance[] {
  if (directive.density <= 0) return [];
  const seed = scatterSeed(directive);
  const points = scatter({
    area: footprint.area,
    density: directive.density,
    minDistance: directive.minSpacing ?? 0,
    jitter: directive.jitter ?? 1,
    seed,
  });
  const minScale = directive.minScale ?? 1;
  const maxScale = directive.maxScale ?? 1;
  const minYaw = directive.minYaw ?? 0;
  const maxYaw = directive.maxYaw ?? Math.PI * 2;
  const out: MaterializedInstance[] = [];
  for (const point of points) {
    if (footprint.polygon !== undefined && !pointInPolygon([point.x, point.z], footprint.polygon)) continue;
    const scaleRoll = hash(`${seed}:scale:${point.index}`);
    const yawRoll = hash(`${seed}:yaw:${point.index}`);
    out.push({
      id: `${directive.id}#${point.index}`,
      directiveId: directive.id,
      kind: "scatter",
      asset: directive.asset,
      x: point.x,
      z: point.z,
      y: 0,
      rotationY: minYaw + (maxYaw - minYaw) * yawRoll,
      scale: minScale + (maxScale - minScale) * scaleRoll,
    });
  }
  return out;
}

function pickSpecies(available: readonly EditorPopulationSpecies[], roll: number): EditorPopulationSpecies {
  const total = available.reduce((sum, s) => sum + Math.max(0, s.weight ?? 1), 0);
  if (total <= 0) return available[0]!;
  let acc = roll * total;
  for (const species of available) {
    acc -= Math.max(0, species.weight ?? 1);
    if (acc <= 0) return species;
  }
  return available[available.length - 1]!;
}

/**
 * Materializes a population directive into deterministic mob spawn placements: at most `cap` of each
 * weighted species, distributed across the footprint. Each placement carries a stable id and its
 * species id in `asset`, ready to feed `ctx.scene.entity.spawn` / `ai/populationDirector`.
 * @capability world-directives materialize a population directive into spawns
 */
export function materializePopulationDirective(
  directive: EditorPopulationDirective,
  footprint: DirectiveFootprint,
): MaterializedInstance[] {
  const remaining = new Map<string, number>();
  for (const species of directive.species) {
    remaining.set(species.id, Math.max(0, (remaining.get(species.id) ?? 0) + species.cap));
  }
  const total = [...remaining.values()].reduce((sum, cap) => sum + cap, 0);
  if (total <= 0) return [];
  const seed = scatterSeed(directive);
  const points = scatter({ area: footprint.area, count: total, minDistance: 0, seed });
  const out: MaterializedInstance[] = [];
  for (const point of points) {
    if (footprint.polygon !== undefined && !pointInPolygon([point.x, point.z], footprint.polygon)) continue;
    const available = directive.species.filter((s) => (remaining.get(s.id) ?? 0) > 0);
    if (available.length === 0) break;
    const picked = pickSpecies(available, hash(`${seed}:species:${point.index}`));
    remaining.set(picked.id, (remaining.get(picked.id) ?? 0) - 1);
    out.push({
      id: `${directive.id}#${point.index}`,
      directiveId: directive.id,
      kind: "population",
      asset: picked.id,
      x: point.x,
      z: point.z,
      y: 0,
      rotationY: hash(`${seed}:yaw:${point.index}`) * Math.PI * 2,
      scale: 1,
    });
  }
  return out;
}

/**
 * Materializes one directive against a document, resolving its footprint first. Returns an empty
 * list when the region does not resolve.
 * @capability world-directives materialize one scene directive into instances
 */
export function materializeDirective(doc: EditorDocument, directive: EditorDirective): MaterializedInstance[] {
  const footprint = resolveDirectiveFootprint(doc, directive);
  if (footprint === null) return [];
  return directive.kind === "scatter"
    ? materializeScatterDirective(directive, footprint)
    : materializePopulationDirective(directive, footprint);
}

/** A per-instance hand-tweak over a materialized directive, keyed by the minted instance id. */
export interface DirectiveInstancePatch {
  /** Override the placement's XZ position. */
  position?: { x: number; z: number };
  /** Override the vertical offset. */
  y?: number;
  scale?: number;
  rotationY?: number;
  /** Remove this instance from the materialized set. */
  deleted?: boolean;
}

/**
 * A sparse overlay over one directive's materialized instances — the "nudge *that one* rock" answer.
 * Hand-edits are keyed by the stable instance id the materializer mints, so they survive re-bakes.
 */
export interface EditorDirectiveOverlay {
  /** The directive id whose instances this overlay patches. */
  over: string;
  patches: Record<string, DirectiveInstancePatch>;
}

/**
 * Applies a directive overlay to its materialized instances: patched fields override, `deleted`
 * drops the instance. Instances with no patch pass through untouched.
 * @capability world-directives apply a sparse overlay over materialized directive instances
 */
export function applyDirectiveOverlay(
  instances: readonly MaterializedInstance[],
  overlay: EditorDirectiveOverlay,
): MaterializedInstance[] {
  const out: MaterializedInstance[] = [];
  for (const instance of instances) {
    const patch = overlay.patches[instance.id];
    if (patch === undefined) {
      out.push(instance);
      continue;
    }
    if (patch.deleted === true) continue;
    out.push({
      ...instance,
      x: patch.position?.x ?? instance.x,
      z: patch.position?.z ?? instance.z,
      y: patch.y ?? instance.y,
      scale: patch.scale ?? instance.scale,
      rotationY: patch.rotationY ?? instance.rotationY,
    });
  }
  return out;
}

/**
 * Materializes every directive on a document into one flat instance list, applying each directive's
 * overlay (matched by `over` === directive id) as it goes. The bulk-content counterpart to
 * `resolveAuthoredObjects` / `resolveScatter`: games and headless tests read the same list.
 * @capability world-directives materialize all scene directives with their overlays
 */
export function materializeDirectives(
  doc: EditorDocument,
  overlays?: readonly EditorDirectiveOverlay[],
): MaterializedInstance[] {
  const directives = doc.directives ?? [];
  if (directives.length === 0) return [];
  const overlayByDirective = new Map((overlays ?? []).map((overlay) => [overlay.over, overlay]));
  const out: MaterializedInstance[] = [];
  for (const directive of directives) {
    let instances = materializeDirective(doc, directive);
    const overlay = overlayByDirective.get(directive.id);
    if (overlay !== undefined) instances = applyDirectiveOverlay(instances, overlay);
    out.push(...instances);
  }
  return out;
}
