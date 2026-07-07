import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";

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
 */
export function InstancedJoints({ world, color = "#f5c542" }: InstancedJointsProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const positions = useMemo(() => new Float32Array(world.jointCapacity * 6), [world.jointCapacity]);
  const attribute = useMemo(() => new THREE.BufferAttribute(positions, 3), [positions]);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color }), [color]);

  useEffect(() => {
    const geometry = geometryRef.current;
    if (geometry === null) return;
    geometry.setAttribute("position", attribute);
    attribute.setUsage(THREE.DynamicDrawUsage);
  }, [attribute]);

  useFrame(() => {
    const geometry = geometryRef.current;
    if (geometry === null) return;
    const count = world.readJointSegments(positions);
    attribute.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geometryRef} />
      <primitive object={material} attach="material" />
    </lineSegments>
  );
}
