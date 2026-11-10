import type { PadEnvironmentDescriptor } from "@jgengine/core/world/features";
import type { TerrainField } from "@jgengine/core/terrain/terrain";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { PAD_THICKNESS, resolvePadMeshY, resolvePadShape } from "./groundPadMath";

/** Props for {@link GroundPad}: the pad descriptor and the terrain field it sits on. */
export interface GroundPadProps {
  pad: PadEnvironmentDescriptor;
  field: TerrainField;
}

/** A flat circular or rectangular pad resting on a terrain field. */
export function groundPadDraw({ pad, field }: GroundPadProps): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  return {
    mount(state: EngineFrameState) {
      const [x, z] = pad.center;
      const groundHeight = field.sampleHeight(x, z);
      const meshY = resolvePadMeshY(groundHeight, pad);
      const shape = resolvePadShape(pad.size);
      geometry = shape.circular
        ? new THREE.CylinderGeometry(shape.radius, shape.radius, PAD_THICKNESS, 32)
        : new THREE.BoxGeometry(shape.width, PAD_THICKNESS, shape.depth);
      material = new THREE.MeshStandardMaterial({ color: pad.color, roughness: 0.9 });
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, meshY, z);
      if (!shape.circular) mesh.rotation.y = pad.rotationY ?? 0;
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      mesh = null;
      geometry = null;
      material = null;
    },
  };
}

/** React mount for {@link groundPadDraw} while parents still render through the Canvas. */
export function GroundPad({ pad, field }: GroundPadProps) {
  useEngineDraw(() => groundPadDraw({ pad, field }), [pad, field]);
  return null;
}
