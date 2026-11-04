import { useMemo } from "react";
import { DoubleSide, type BufferGeometry } from "three";
import type { RoadRibbon } from "@jgengine/core/roads/roads";
import type { TerrainDetailMaterialConfig } from "@jgengine/core/world/features";
import { useSurfaceScan } from "@jgengine/core/material/surfaceScanTextures.draw";
import { useSurfaceRibbonMaterial } from "./surfaceRibbonMaterial.draw";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { mergeRibbonGeometry, type JunctionSurface } from "./RoadRibbons.draw";

function JunctionPatch({
  geometry,
  color,
  surfaceDetail,
  surface,
  scan,
}: {
  geometry: BufferGeometry;
  color: string;
  surfaceDetail: boolean;
  surface: string;
  scan: TerrainDetailMaterialConfig | undefined;
}) {
  const quality = useTerrainQuality();
  // The same world-XZ scan as the carriageway ribbons, so asphalt runs through the crossing unbroken.
  const { textures, pending } = useSurfaceScan(scan?.maps, surfaceDetail && quality !== "low");
  const material = useSurfaceRibbonMaterial(
    surfaceDetail
      ? {
          surface,
          color,
          halfWidth: 1,
          quality,
          ...(scan === undefined || textures === null
            ? {}
            : { scan: { textures, projection: "world" as const, repeat: scan.repeat ?? 4, strength: scan.strength ?? 1, tint: scan.tint ?? 1 } }),
        }
      : null,
  );
  return (
    <mesh geometry={geometry} receiveShadow visible={!pending} {...(material === null ? {} : { material })}>
      {material === null ? <meshStandardMaterial color={color} roughness={0.95} metalness={0} side={DoubleSide} /> : null}
    </mesh>
  );
}

/** Stop-line and crosswalk paint tone. @internal */
export const JUNCTION_PAINT = "#e6e9ee";

/** White stop-line / crosswalk paint over a junction: worn through to the asphalt grain like the lane dashes. */
function JunctionPaint({
  geometry,
  surfaceDetail,
  scan,
}: {
  geometry: BufferGeometry;
  surfaceDetail: boolean;
  scan: TerrainDetailMaterialConfig | undefined;
}) {
  const quality = useTerrainQuality();
  const { textures, pending } = useSurfaceScan(scan?.maps, surfaceDetail && quality !== "low");
  const material = useSurfaceRibbonMaterial(
    surfaceDetail
      ? {
          surface: "road",
          color: JUNCTION_PAINT,
          halfWidth: 0.3,
          roughness: 0.6,
          quality,
          polygonOffset: true,
          paint: true,
          ...(scan === undefined || textures === null
            ? {}
            : { scan: { textures, projection: "world" as const, repeat: scan.repeat ?? 4, strength: 0.85, tint: 0 } }),
        }
      : null,
  );
  if (material !== null) return <mesh geometry={geometry} renderOrder={1} receiveShadow visible={!pending} material={material} />;
  return (
    <mesh geometry={geometry} renderOrder={1} visible={!pending}>
      <meshStandardMaterial
        color={JUNCTION_PAINT}
        roughness={0.85}
        metalness={0}
        side={DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

/**
 * Junction surfaces merged per colour, so every crossing of one colour is one draw. @internal
 */
export function mergeJunctionSurfaces(surfaces: readonly JunctionSurface[]): { color: string; geometry: BufferGeometry }[] {
  const byColor = new Map<string, RoadRibbon[]>();
  for (const surface of surfaces) {
    const ribbons = byColor.get(surface.color);
    if (ribbons === undefined) byColor.set(surface.color, [surface.ribbon]);
    else ribbons.push(surface.ribbon);
  }
  const patches: { color: string; geometry: BufferGeometry }[] = [];
  for (const [color, ribbons] of byColor) {
    const geometry = mergeRibbonGeometry(ribbons);
    if (geometry !== null) patches.push({ color, geometry });
  }
  return patches;
}

/**
 * Renders welded road intersections: one seam-shared asphalt surface per junction (built by
 * {@link buildAuthoredRoadNetwork}, its boundary vertices welded onto the trimmed ribbon ends so
 * there is no overlap and no floating disc), plus white stop lines and crosswalk bars at each
 * approach. Junctions of one colour share one draw. Markings ride the `GROUND_DECAL_LAYERS` marking
 * layer above the surface, with `polygonOffset`/`renderOrder` so they win the depth test on sloped ground.
 * @internal
 */
export function RoadJunctions({
  surfaces,
  paint,
  surfaceDetail = true,
  surface = "road",
  scan,
}: {
  surfaces: readonly JunctionSurface[];
  /** Stop-line and crosswalk ribbons from `buildAuthoredRoadNetwork`. */
  paint: readonly RoadRibbon[];
  /** Shade the welded surfaces with the asphalt procedural surface, matching the ribbons. Default true. */
  surfaceDetail?: boolean;
  /** Surface the welded crossings shade with, as the roads meeting there do. Default `"road"`. */
  surface?: string;
  /** Scanned carriageway from the first road that names one, so junctions match the ribbons. */
  scan?: TerrainDetailMaterialConfig | undefined;
}) {
  const patches = useMemo(() => mergeJunctionSurfaces(surfaces), [surfaces]);

  const markings = useMemo(() => mergeRibbonGeometry(paint), [paint]);

  if (patches.length === 0 && markings === null) return null;
  return (
    <group>
      {patches.map((patch) => (
        <JunctionPatch key={patch.color} geometry={patch.geometry} color={patch.color} surfaceDetail={surfaceDetail} surface={surface} scan={scan} />
      ))}
      {markings !== null ? <JunctionPaint geometry={markings} surfaceDetail={surfaceDetail} scan={scan} /> : null}
    </group>
  );
}
