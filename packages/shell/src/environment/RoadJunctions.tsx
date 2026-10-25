import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { buildRoadRibbon, GROUND_DECAL_LAYERS, type RoadPoint } from "@jgengine/core/world/roads";
import type { TerrainDetailMaterialConfig } from "@jgengine/core/world/features";
import { junctionMarkings, type RoadJunction } from "@jgengine/core/world/streets";
import type { TerrainField } from "@jgengine/core/world/terrain";
import { useSurfaceScan } from "../render/surfaceScanTextures";
import { useSurfaceRibbonMaterial } from "../terrain/surfaceRibbonMaterial";
import { useTerrainQuality } from "../terrain/terrainQuality";
import type { JunctionSurface } from "./RoadRibbons";

function JunctionPatch({
  geometry,
  color,
  surfaceDetail,
  scan,
}: {
  geometry: BufferGeometry;
  color: string;
  surfaceDetail: boolean;
  scan: TerrainDetailMaterialConfig | undefined;
}) {
  const quality = useTerrainQuality();
  // The same world-XZ scan as the carriageway ribbons, so asphalt runs through the crossing unbroken.
  const textures = useSurfaceScan(scan?.maps, surfaceDetail && quality !== "low");
  const material = useSurfaceRibbonMaterial(
    surfaceDetail
      ? {
          surface: "road",
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
    <mesh geometry={geometry} receiveShadow {...(material === null ? {} : { material })}>
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
  const textures = useSurfaceScan(scan?.maps, surfaceDetail && quality !== "low");
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
  if (material !== null) return <mesh geometry={geometry} renderOrder={1} receiveShadow material={material} />;
  return (
    <mesh geometry={geometry} renderOrder={1}>
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

/** Lane paint sits the table's road→marking gap above the welded junction surface (also polygonOffset). */
const MARKING_LIFT = GROUND_DECAL_LAYERS.marking - GROUND_DECAL_LAYERS.road;

function toGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry | null {
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge many thin marking ribbons (stop lines + crosswalk bars) into one buffer geometry. */
function mergedBars(
  bars: readonly (readonly RoadPoint[])[],
  width: number,
  field: TerrainField,
  elevation: number,
): BufferGeometry | null {
  const ribbons = bars.map((bar) =>
    buildRoadRibbon(bar, width, (x, z) => field.sampleHeight(x, z), { elevation }),
  );
  const vertexCount = ribbons.reduce((sum, r) => sum + r.positions.length, 0);
  const indexCount = ribbons.reduce((sum, r) => sum + r.indices.length, 0);
  if (vertexCount === 0) return null;
  const positions = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const ribbon of ribbons) {
    positions.set(ribbon.positions, vertexOffset);
    const base = vertexOffset / 3;
    for (let i = 0; i < ribbon.indices.length; i += 1) indices[indexOffset + i] = ribbon.indices[i]! + base;
    vertexOffset += ribbon.positions.length;
    indexOffset += ribbon.indices.length;
  }
  return toGeometry(positions, indices);
}

/**
 * Renders welded road intersections: one seam-shared asphalt surface per junction (built by
 * {@link buildAuthoredRoadNetwork}, its boundary vertices welded onto the trimmed ribbon ends so
 * there is no overlap and no floating disc), plus white stop lines and crosswalk bars at each
 * approach. Markings ride the {@link GROUND_DECAL_LAYERS} marking layer above the surface, with
 * `polygonOffset`/`renderOrder` so they win the depth test on sloped ground.
 * @internal
 */
export function RoadJunctions({
  surfaces,
  junctions,
  field,
  surfaceDetail = true,
  scan,
}: {
  surfaces: readonly JunctionSurface[];
  junctions: readonly RoadJunction[];
  field: TerrainField;
  /** Shade the welded surfaces with the asphalt procedural surface, matching the ribbons. Default true. */
  surfaceDetail?: boolean;
  /** Scanned carriageway from the first road that names one, so junctions match the ribbons. */
  scan?: TerrainDetailMaterialConfig | undefined;
}) {
  const patches = useMemo(
    () =>
      surfaces
        .map((surface) => ({ color: surface.color, geometry: toGeometry(surface.ribbon.positions, surface.ribbon.indices) }))
        .filter((entry): entry is { color: string; geometry: BufferGeometry } => entry.geometry !== null),
    [surfaces],
  );

  const markings = useMemo(() => {
    const stopBars: (readonly RoadPoint[])[] = [];
    const crossBars: (readonly RoadPoint[])[] = [];
    let elevation = 0;
    for (const junction of junctions) {
      elevation = Math.max(elevation, junction.elevation);
      const marks = junctionMarkings(junction);
      for (const bar of marks.stopLines) stopBars.push(bar);
      for (const bar of marks.crosswalkBars) crossBars.push(bar);
    }
    return {
      stops: mergedBars(stopBars, 0.5, field, elevation + MARKING_LIFT),
      crosswalks: mergedBars(crossBars, 0.55, field, elevation + MARKING_LIFT),
    };
  }, [junctions, field]);

  if (patches.length === 0 && markings.stops === null && markings.crosswalks === null) return null;
  return (
    <group>
      {patches.map((patch, index) => (
        <JunctionPatch key={`junction-${index}`} geometry={patch.geometry} color={patch.color} surfaceDetail={surfaceDetail} scan={scan} />
      ))}
      {markings.stops !== null ? <JunctionPaint geometry={markings.stops} surfaceDetail={surfaceDetail} scan={scan} /> : null}
      {markings.crosswalks !== null ? <JunctionPaint geometry={markings.crosswalks} surfaceDetail={surfaceDetail} scan={scan} /> : null}
    </group>
  );
}
