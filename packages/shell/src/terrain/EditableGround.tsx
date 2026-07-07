import { useMemo } from "react";
import * as THREE from "three";
import type { Aabb } from "@jgengine/core/world/geometry";
import type { EditableTerrain } from "@jgengine/core/world/terraform";

export interface EditableGroundProps {
  terrain: Pick<EditableTerrain, "sampleHeight" | "surfaceAt">;
  bounds: Aabb;
  segments?: number;
  version?: number;
  baseColor?: string;
  surfaceColors?: Record<string, string>;
}

const DEFAULT_SURFACE_COLORS: Record<string, string> = {
  path: "#b8a06a",
  gravel: "#8d8d84",
  stone: "#7c7f86",
  grass: "#4b7f3f",
};

export function EditableGround({
  terrain,
  bounds,
  segments = 96,
  version = 0,
  baseColor = "#3f6b3a",
  surfaceColors = DEFAULT_SURFACE_COLORS,
}: EditableGroundProps) {
  const geometry = useMemo(() => {
    void version;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const position = geo.attributes.position;
    const base = new THREE.Color(baseColor);
    const colors = new Float32Array(position.count * 3);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) + cx;
      const z = position.getZ(index) + cz;
      position.setY(index, terrain.sampleHeight(x, z));
      const surface = terrain.surfaceAt(x, z);
      const color = surface !== null && surfaceColors[surface] !== undefined ? new THREE.Color(surfaceColors[surface]) : base;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, bounds, segments, version, baseColor, surfaceColors]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}
