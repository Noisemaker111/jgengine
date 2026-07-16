import type { EditorDocument, EditorVolume } from "../editor/types";
import type { Aabb } from "./geometry";
import { scatter } from "./scatter";
import type { GrassEnvironmentConfig } from "./features";

/** The editor volume kind that marks an area as vegetation fill. */
export const VEGETATION_VOLUME_KIND = "vegetation";

/**
 * How a vegetation volume fills its area, read from the volume's `meta`.
 * `density` is items per square meter — the one slider number: grass blades,
 * trees, bushes, rocks all scale with it. Every field has a default, so a
 * freshly placed `kind: "vegetation"` volume already grows grass.
 */
export interface VegetationSettings {
  /** `"grass"` for shell-rendered blades, otherwise an asset/catalog item id the game maps to a model. */
  item: string;
  /** Items per square meter (grass blades: ~4; trees: ~0.02; bushes: ~0.08). */
  density: number;
  /** Random uniform scale range applied per placement. */
  minScale: number;
  maxScale: number;
  /** Minimum spacing between placements in meters; 0 allows clumping. */
  minDistance: number;
  /** Extra seed folded into the volume id so re-rolls are one string away. */
  seed: string;
}

/** Defaults a bare `kind: "vegetation"` volume grows with: grass at 4 blades/m². */
export const VEGETATION_DEFAULTS: VegetationSettings = {
  item: "grass",
  density: 4,
  minScale: 0.8,
  maxScale: 1.2,
  minDistance: 0,
  seed: "",
};

function metaNumber(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metaString(meta: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** True when an editor volume is a vegetation fill area.
 * @internal
 */
export function isVegetationVolume(volume: EditorVolume): boolean {
  return volume.kind === VEGETATION_VOLUME_KIND;
}

/** The volume's vegetation settings with defaults filled in; null for non-vegetation volumes.
 * @internal
 */
export function readVegetationSettings(volume: EditorVolume): VegetationSettings | null {
  if (!isVegetationVolume(volume)) return null;
  return {
    item: metaString(volume.meta, "item", VEGETATION_DEFAULTS.item),
    density: Math.max(0, metaNumber(volume.meta, "density", VEGETATION_DEFAULTS.density)),
    minScale: metaNumber(volume.meta, "minScale", VEGETATION_DEFAULTS.minScale),
    maxScale: metaNumber(volume.meta, "maxScale", VEGETATION_DEFAULTS.maxScale),
    minDistance: Math.max(0, metaNumber(volume.meta, "minDistance", VEGETATION_DEFAULTS.minDistance)),
    seed: metaString(volume.meta, "seed", VEGETATION_DEFAULTS.seed),
  };
}

/** The ground-plane footprint of a volume: box half-extents or sphere/cylinder radius.
 * @internal
 */
export function vegetationFootprint(volume: EditorVolume): Aabb {
  const halfW = volume.shape === "box" ? (volume.halfExtents?.x ?? 5) : (volume.radius ?? 5);
  const halfD = volume.shape === "box" ? (volume.halfExtents?.z ?? 5) : (volume.radius ?? 5);
  return {
    minX: volume.center.x - halfW,
    minZ: volume.center.z - halfD,
    maxX: volume.center.x + halfW,
    maxZ: volume.center.z + halfD,
  };
}

/** One placed vegetation instance — position on the ground plane plus per-instance variation. */
export interface VegetationPlacement {
  id: string;
  volumeId: string;
  item: string;
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

function placementHash(volumeId: string, seed: string, index: number, salt: number): number {
  const text = `${volumeId}:${seed}:${index}:${salt}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic placements for one vegetation volume: scatter its footprint at
 * `density` items/m² (respecting `minDistance`), clip round shapes to their
 * radius, and derive per-instance scale/rotation from the volume id + seed, so
 * the same saved scene always grows the same field.
  * @internal
  */
export function resolveVegetationVolume(volume: EditorVolume): VegetationPlacement[] {
  const settings = readVegetationSettings(volume);
  if (settings === null || settings.density <= 0) return [];
  const area = vegetationFootprint(volume);
  const points = scatter({
    area,
    density: settings.density,
    minDistance: settings.minDistance,
    seed: `${volume.id}:${settings.seed}`,
  });
  const round = volume.shape !== "box";
  const radius = volume.radius ?? 5;
  const radiusSq = radius * radius;
  const placements: VegetationPlacement[] = [];
  for (const point of points) {
    if (round) {
      const dx = point.x - volume.center.x;
      const dz = point.z - volume.center.z;
      if (dx * dx + dz * dz > radiusSq) continue;
    }
    const t = placementHash(volume.id, settings.seed, point.index, 0x51);
    placements.push({
      id: `${volume.id}/${point.index}`,
      volumeId: volume.id,
      item: settings.item,
      x: point.x,
      z: point.z,
      scale: settings.minScale + (settings.maxScale - settings.minScale) * t,
      rotation: placementHash(volume.id, settings.seed, point.index, 0x9e) * Math.PI * 2,
    });
  }
  return placements;
}

/**
 * All model-item placements in a document (every vegetation volume except
 * `item: "grass"`, which the shell renders as blades — see
 * `grassPatchesFromVegetation`). A game maps each placement's `item` to a
 * mesh/entity via its render catalog and places it grounded.
  * @internal
  */
export function resolveVegetation(doc: EditorDocument): VegetationPlacement[] {
  const out: VegetationPlacement[] = [];
  for (const volume of doc.volumes) {
    if (!isVegetationVolume(volume)) continue;
    const settings = readVegetationSettings(volume);
    if (settings === null || settings.item === "grass") continue;
    out.push(...resolveVegetationVolume(volume));
  }
  return out;
}

/**
 * Grass-blade patches for every `item: "grass"` vegetation volume, ready to
 * spread into `environment()`'s `grass` list — the volume's density number is
 * the blades-per-m² the shell renders, so the editor slider drives it directly.
  * @internal
  */
export function grassPatchesFromVegetation(doc: EditorDocument): GrassEnvironmentConfig[] {
  const patches: GrassEnvironmentConfig[] = [];
  for (const volume of doc.volumes) {
    if (!isVegetationVolume(volume)) continue;
    const settings = readVegetationSettings(volume);
    if (settings === null || settings.item !== "grass" || settings.density <= 0) continue;
    const area = vegetationFootprint(volume);
    patches.push({
      area: {
        w: area.maxX - area.minX,
        d: area.maxZ - area.minZ,
        position: [volume.center.x, volume.center.z],
      },
      density: settings.density,
      seed: `${volume.id}:${settings.seed}`,
    });
  }
  return patches;
}
