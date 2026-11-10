/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";
import type { Aabb } from "@jgengine/core/world/geometry";
import type { EditableTerrain } from "@jgengine/core/terrain/terraform";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** Props for {@link EditableGround}: the editable terrain, the bounds to mesh, resolution, a rebuild version and surface colours. */
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

function editableGroundGeometry({ terrain, bounds, segments = 96, baseColor = "#3f6b3a", surfaceColors = DEFAULT_SURFACE_COLORS }: EditableGroundProps): THREE.BufferGeometry {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const position = geo.getAttribute("position");
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
}

/** Mesh an editable terrain inside its bounds, coloured by each point's painted surface; bump `version` after an edit. */
export function editableGroundDraw(props: EditableGroundProps): EngineDraw {
  const geometry = editableGroundGeometry(props);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  let mesh: THREE.Mesh | null = null;
  return {
    mount(state: EngineFrameState) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh = null;
    },
  };
}

export function EditableGround(props: EditableGroundProps) {
  const { terrain, bounds, segments, version, baseColor, surfaceColors } = props;
  useEngineDraw(() => editableGroundDraw(props), [terrain, bounds, segments, version, baseColor, surfaceColors]);
  return null;
}
