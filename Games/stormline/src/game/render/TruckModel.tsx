import type { ReactNode } from "react";

export function renderTruck(): ReactNode {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.9, 1.1, 4.2]} />
        <meshStandardMaterial color="#d9a441" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.25, 1.1]}>
        <boxGeometry args={[1.7, 0.85, 1.6]} />
        <meshStandardMaterial color="#3d4a5c" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.42, -1.4]}>
        <boxGeometry args={[2.05, 0.14, 1.4]} />
        <meshStandardMaterial color="#f25c05" emissive="#f25c05" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0.7, 0.28, 2.05]}>
        <boxGeometry args={[0.22, 0.22, 0.1]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[-0.7, 0.28, 2.05]}>
        <boxGeometry args={[0.22, 0.22, 0.1]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}
