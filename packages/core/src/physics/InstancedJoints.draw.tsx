/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useRef } from "@jgengine/core/ui/jsx";

/** Props for InstancedJoints: the physics world whose joints are drawn and the line color. */
export interface InstancedJointsProps {
  /** Physics world whose active joints are drawn as line segments between their world anchors. */
  world: PhysicsWorld;
  /** Line color. Default warm yellow. */
  color?: THREE.ColorRepresentation;
}

/**
 * Debug overlay drawing a PhysicsWorld's joints (suspension, ragdoll links, carry tethers) as one
 * LineSegments batch. Endpoints are streamed each frame from `world.readJointSegments`; pair with
 * `InstancedBodies` to see the constraint structure over the bodies.
 * @capability physics-joint-lines Draw a physics world's joints as lines
 */
export function instancedJointsDraw(getProps: () => InstancedJointsProps): EngineDraw {
  const geometry = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
  lines.frustumCulled = false;
  let positions: Float32Array | null = null;
  let attribute: THREE.BufferAttribute | null = null;
  let capacity = -1;
  let color: THREE.ColorRepresentation = "#f5c542";

  const syncMaterial = (next: THREE.ColorRepresentation) => {
    if (next === color) return;
    color = next;
    (lines.material as THREE.LineBasicMaterial).color.set(next);
  };

  const sync = () => {
    const props = getProps();
    syncMaterial(props.color ?? "#f5c542");
    if (positions === null || attribute === null) return;
    if (props.world.jointCapacity !== capacity) {
      capacity = props.world.jointCapacity;
      positions = new Float32Array(capacity * 6);
      attribute = new THREE.BufferAttribute(positions, 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
    }
    const count = props.world.readJointSegments(positions);
    attribute.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  };

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      color = props.color ?? "#f5c542";
      (lines.material as THREE.LineBasicMaterial).color.set(color);
      capacity = props.world.jointCapacity;
      positions = new Float32Array(capacity * 6);
      attribute = new THREE.BufferAttribute(positions, 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      geometry.setDrawRange(0, 0);
      state.scene.add(lines);
    },
    frame: sync,
    update: sync,
    dispose(state: EngineFrameState) {
      state.scene.remove(lines);
      geometry.dispose();
      (lines.material as THREE.Material).dispose();
      positions = null;
      attribute = null;
    },
  };
}

/**
 * Debug overlay drawing a PhysicsWorld's joints (suspension, ragdoll links, carry tethers) as one
 * LineSegments batch. Endpoints are streamed each frame from `world.readJointSegments`; pair with
 * `InstancedBodies` to see the constraint structure over the bodies.
 * @capability physics-joint-lines Draw a physics world's joints as lines
 */
export function InstancedJoints(props: InstancedJointsProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => instancedJointsDraw(() => latest.current), [props.world]);
  return null;
}
