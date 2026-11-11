/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import * as THREE from "three";
import { AdditiveBlending } from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** {@link LightBeam} look. */
export interface LightBeamProps {
  /** Metres it rises from its foot. Default 80, enough to show over a forest from far off. */
  height?: number;
  /** Default 0.25. */
  radius?: number;
  /** Default a pale blue-white. */
  color?: string;
  /** Default 0.35. */
  opacity?: number;
}

/**
 * A glowing column of light rising from where it is placed, for finding something from afar: a fallen body, a supply
 * crate, an objective. Additive and unlit, so it reads by day and glows at night.
 * @capability light-beam a tall glowing column marking a spot so it can be found from far away
 */
export function lightBeamDraw({ height = 80, radius = 0.25, color = "#cfe8ff", opacity = 0.35 }: LightBeamProps): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.CylinderGeometry | null = null;
  let material: THREE.MeshBasicMaterial | null = null;
  return {
    mount(state: EngineFrameState) {
      geometry = new THREE.CylinderGeometry(radius, radius, height, 10, 1, true);
      material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = height / 2;
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

/** UI mount for {@link lightBeamDraw} while parents still render through the Canvas. */
export function LightBeam(props: LightBeamProps): null {
  useEngineDraw(() => lightBeamDraw(props), [props.height, props.radius, props.color, props.opacity]);
  return null;
}
