import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";
import { buildRoadRibbon, dashSegments } from "@jgengine/core/world/roads";
import type { TerrainField } from "@jgengine/core/world/terrain";

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
): BufferGeometry | null {
  const width = Math.max(0.25, road.width * 0.035);
  const ribbons = dashSegments(road.path, 3.2, 4).map((dash) =>
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

/** Renders one `road()` descriptor: an asphalt ribbon plus optional dashed centerline, draped on the terrain. */
export function RoadRibbons({ road, field }: { road: RoadEnvironmentDescriptor; field: TerrainField }) {
  const asphalt = useMemo(
    () => ribbonGeometry(road.path, road.width, field, road.elevation),
    [road, field],
  );
  const dashes = useMemo(
    () => (road.markings ? mergedDashGeometry(road, field) : null),
    [road, field],
  );

  if (asphalt === null) return null;
  return (
    <group>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color={road.color} roughness={0.95} metalness={0} side={DoubleSide} />
      </mesh>
      {dashes !== null ? (
        <mesh geometry={dashes}>
          <meshStandardMaterial color={road.markingColor} roughness={0.8} metalness={0} side={DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}
