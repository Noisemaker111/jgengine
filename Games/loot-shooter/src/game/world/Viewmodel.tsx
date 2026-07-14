import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { ViewmodelProps } from "@jgengine/shell/camera";

export function Viewmodel({ cuesRef }: ViewmodelProps) {
  const gunRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const gun = gunRef.current;
    if (gun === null) return;
    const cues = cuesRef.current;
    const cycle = cues.bobPhase * Math.PI * 2;
    gun.position.set(Math.cos(cycle) * 0.01, Math.sin(cycle) * 0.012 - cues.recoil * 0.02, cues.recoil * 0.14);
    gun.rotation.x = cues.reloading ? 0.5 : cues.recoil * 0.3;
  });

  return (
    <group ref={gunRef}>
      <mesh position={[0, 0, -0.24]}>
        <boxGeometry args={[0.1, 0.12, 0.6]} />
        <meshStandardMaterial color="#3a4552" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.14, 0.05]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.09, 0.2, 0.12]} />
        <meshStandardMaterial color="#232a33" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.035, -0.56]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.024, 0.024, 0.2, 10]} />
        <meshStandardMaterial color="#0e1015" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.05, -0.02, -0.1]}>
        <boxGeometry args={[0.02, 0.06, 0.18]} />
        <meshStandardMaterial color="#5b6b7d" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}
