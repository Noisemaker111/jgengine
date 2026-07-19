import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from "three";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";
import { buildRoadRibbon, dashSegments, type DashExclusion } from "@jgengine/core/world/roads";
import { curbPaths, offsetPath, sidewalkWidthOf } from "@jgengine/core/world/streets";
import type { TerrainField } from "@jgengine/core/world/terrain";

/** Darken an asphalt color toward black for a curb/edge strip (deterministic, no alloc churn). */
function darken(hex: string, amount: number): string {
  const c = new Color(hex);
  c.multiplyScalar(1 - amount);
  return `#${c.getHexString()}`;
}

function toGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry | null {
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonGeometry(
  path: RoadEnvironmentDescriptor["path"],
  width: number,
  field: TerrainField,
  elevation: number,
): BufferGeometry | null {
  const ribbon = buildRoadRibbon(path, width, (x, z) => field.sampleHeight(x, z), { elevation });
  return toGeometry(ribbon.positions, ribbon.indices);
}

function mergedDashGeometry(
  road: RoadEnvironmentDescriptor,
  field: TerrainField,
  exclusions: readonly DashExclusion[],
): BufferGeometry | null {
  const width = Math.max(0.25, road.width * 0.035);
  const ribbons = dashSegments(road.path, 3.2, 4, exclusions).map((dash) =>
    buildRoadRibbon(dash, width, (x, z) => field.sampleHeight(x, z), { elevation: road.elevation + 0.04 }),
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
    for (let i = 0; i < ribbon.indices.length; i += 1) {
      indices[indexOffset + i] = ribbon.indices[i]! + base;
    }
    vertexOffset += ribbon.positions.length;
    indexOffset += ribbon.indices.length;
  }
  return toGeometry(positions, indices);
}

/**
 * Renders one `road()` descriptor: an asphalt ribbon, a curb/edge strip along each border, plus an
 * optional dashed centerline (draped on the terrain, and interrupted through any `exclusions`
 * — the welded junction patches — so the center line does not paint across intersections).
 */
export function RoadRibbons({
  road,
  field,
  exclusions = [],
}: {
  road: RoadEnvironmentDescriptor;
  field: TerrainField;
  exclusions?: readonly DashExclusion[];
}) {
  const asphalt = useMemo(
    () => ribbonGeometry(road.path, road.width, field, road.elevation),
    [road, field],
  );
  const dashes = useMemo(
    () => (road.markings ? mergedDashGeometry(road, field, exclusions) : null),
    [road, field, exclusions],
  );
  const curbColor = useMemo(() => darken(road.color, 0.45), [road.color]);
  const curbs = useMemo(() => {
    // A thin strip straddling each asphalt edge, lifted just above the ribbon.
    const strip = Math.max(0.4, road.width * 0.09);
    return curbPaths(road, strip / 2)
      .map((path) => ribbonGeometry(path, strip, field, road.elevation + 0.02))
      .filter((geometry): geometry is BufferGeometry => geometry !== null);
  }, [road, field]);
  const sidewalks = useMemo(() => {
    const width = sidewalkWidthOf(road);
    if (width <= 0) return [];
    const offset = road.width / 2 + width / 2;
    return [offsetPath(road.path, offset), offsetPath(road.path, -offset)]
      .map((path) => ribbonGeometry(path, width, field, road.elevation + 0.06))
      .filter((geometry): geometry is BufferGeometry => geometry !== null);
  }, [road, field]);

  if (asphalt === null) return null;
  return (
    <group>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color={road.color} roughness={0.95} metalness={0} side={DoubleSide} />
      </mesh>
      {curbs.map((geometry, index) => (
        <mesh key={`curb-${index}`} geometry={geometry} receiveShadow>
          <meshStandardMaterial color={curbColor} roughness={0.9} metalness={0} side={DoubleSide} />
        </mesh>
      ))}
      {dashes !== null ? (
        <mesh geometry={dashes}>
          <meshStandardMaterial color={road.markingColor} roughness={0.8} metalness={0} side={DoubleSide} />
        </mesh>
      ) : null}
      {sidewalks.map((geometry, index) => (
        <mesh key={`walk-${index}`} geometry={geometry} receiveShadow>
          <meshStandardMaterial
            color={road.sidewalk === false ? "#a7adb8" : road.sidewalk.color}
            roughness={0.9}
            metalness={0}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
