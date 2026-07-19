import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { buildRoadRibbon, GROUND_DECAL_LAYERS, type RoadPoint } from "@jgengine/core/world/roads";
import { junctionMarkings, type RoadJunction } from "@jgengine/core/world/streets";
import type { TerrainField } from "@jgengine/core/world/terrain";
import type { JunctionSurface } from "./RoadRibbons";

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
}: {
  surfaces: readonly JunctionSurface[];
  junctions: readonly RoadJunction[];
  field: TerrainField;
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
        <mesh key={`junction-${index}`} geometry={patch.geometry} receiveShadow>
          <meshStandardMaterial color={patch.color} roughness={0.95} metalness={0} side={DoubleSide} />
        </mesh>
      ))}
      {markings.stops !== null ? (
        <mesh geometry={markings.stops} renderOrder={1}>
          <meshStandardMaterial
            color="#e6e9ee"
            roughness={0.85}
            metalness={0}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
      {markings.crosswalks !== null ? (
        <mesh geometry={markings.crosswalks} renderOrder={1}>
          <meshStandardMaterial
            color="#e6e9ee"
            roughness={0.85}
            metalness={0}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
    </group>
  );
}
