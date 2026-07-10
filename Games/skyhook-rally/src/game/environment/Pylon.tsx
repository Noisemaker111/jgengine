import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

import type { Pylon } from "../world/archipelago";
import { BRASS, BRASS_DARK, RING_GLOW } from "./palette";

export function PylonMesh({ pylon }: { pylon: Pylon }) {
  const ringRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (ring === null) return;
    ring.rotation.z = clock.elapsedTime * 0.4;
  });

  return (
    <group position={[pylon.base.x, pylon.base.y, pylon.base.z]}>
      <mesh position={[0, pylon.height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.42, pylon.height, 8]} />
        <meshStandardMaterial color={pylon.standalone ? BRASS_DARK : BRASS} metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, pylon.height + 0.35, 0]}>
        <coneGeometry args={[0.22, 0.6, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={ringRef} position={[0, pylon.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.09, 10, 24]} />
        <meshStandardMaterial color={RING_GLOW} emissive={RING_GLOW} emissiveIntensity={0.85} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}
