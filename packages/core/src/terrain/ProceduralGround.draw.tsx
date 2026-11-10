/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import { useEngineDraw, type DrawAttachProps } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useRef } from "@jgengine/core/ui/jsx";

import { createProceduralGroundGeometry, type ProceduralTerrainConfig, type TerrainVertexColorOptions } from "./terrainMath.draw";

/** Props for {@link ProceduralGround}: noise terrain settings, height colours and material settings. */
export interface ProceduralGroundProps extends DrawAttachProps {
  terrain?: ProceduralTerrainConfig;
  colors?: TerrainVertexColorOptions;
  roughness?: number;
  metalness?: number;
}

const TRANSFORMS = new Set(["position", "rotation", "scale", "quaternion"]);

/** Apply the r3f-style mesh props a plain THREE.Mesh understands; event props have no three-side home. */
function applyMeshProps(mesh: THREE.Mesh, props: object): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || typeof value === "function") continue;
    if (key === "position" && Array.isArray(value)) mesh.position.fromArray(value);
    else if (key === "rotation" && Array.isArray(value)) mesh.rotation.set(value[0], value[1], value[2]);
    else if (key === "scale" && Array.isArray(value)) mesh.scale.fromArray(value);
    else if (key === "quaternion" && Array.isArray(value)) mesh.quaternion.fromArray(value);
    else if (!TRANSFORMS.has(key)) Object.assign(mesh, { [key]: value });
  }
}

/** A seeded noise-height ground mesh coloured from low to high ground.
 * @capability procedural-ground seeded noise-height ground mesh with low/high/waterline vertex colours for quick natural scenes */
export function proceduralGroundDraw({
  terrain,
  colors,
  roughness = 0.94,
  metalness = 0,
  receiveShadow = true,
  ...meshProps
}: ProceduralGroundProps): EngineDraw {
  const geometry = createProceduralGroundGeometry(terrain, colors);
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true });
  let mesh: THREE.Mesh | null = null;
  return {
    mount(state: EngineFrameState) {
      mesh = new THREE.Mesh(geometry, material);
      applyMeshProps(mesh, meshProps);
      mesh.receiveShadow = receiveShadow;
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

export function ProceduralGround(props: ProceduralGroundProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => proceduralGroundDraw(latest.current), [props.terrain, props.colors, props.roughness, props.metalness]);
  return null;
}
