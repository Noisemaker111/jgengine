import { BANNER_TEAL, BRASS, BRASS_DARK, CLOUD_CREAM, RING_GLOW } from "./palette";

/** The courier: a stylized brass-goggled flyer, not a bare capsule — rounded torso, satchel, aviator cap, and an outstretched hook-glove that doubles as the rope anchor point players read the swing off. */
export function CourierMesh() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} scale={[0.5, 0.62, 0.42]} castShadow>
        <sphereGeometry args={[0.55, 14, 12]} />
        <meshStandardMaterial color={BANNER_TEAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.28, 14, 12]} />
        <meshStandardMaterial color={CLOUD_CREAM} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.62, 0.02]}>
        <coneGeometry args={[0.24, 0.28, 10]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0.16, 0.5, 0.24]}>
        <torusGeometry args={[0.09, 0.03, 8, 16]} />
        <meshStandardMaterial color={BRASS_DARK} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.35, -0.15, -0.15]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.32, 0.4, 0.18]} />
        <meshStandardMaterial color={BRASS_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[0.32, 0.1, 0.3]} rotation={[0.4, 0, -0.5]}>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.56, 0.32, 0.5]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color={RING_GLOW} emissive={RING_GLOW} emissiveIntensity={0.6} metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}
