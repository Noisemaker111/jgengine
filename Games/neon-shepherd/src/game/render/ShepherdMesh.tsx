import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import { PALETTE } from "../constants";

export function ShepherdMesh(): React.ReactNode {
  const ringRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current !== null) {
      const scale = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.08;
      ringRef.current.scale.set(scale, 1, scale);
    }
  });

  return (
    <group>
      <mesh position-y={0.9}>
        <capsuleGeometry args={[0.32, 1.1, 6, 12]} />
        <meshStandardMaterial color={PALETTE.inkWhite} emissive={PALETTE.spiritMint} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0.26, 1.1, 0.05]} rotation-z={0.3}>
        <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
        <meshStandardMaterial color="#5c4a33" />
      </mesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial color={PALETTE.spiritMint} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
