import type { Islet } from "../world/archipelago";
import { ISLAND_EARTH, ISLAND_ROCK } from "./palette";

const TIER_TINT: Record<Islet["tier"], string> = {
  low: "#93a86e",
  mid: ISLAND_EARTH,
  high: "#7c8f5c",
};

export function IsletMesh({ islet }: { islet: Islet }) {
  const bodyHeight = 6 + islet.radius * 0.5;
  return (
    <group position={[islet.position.x, islet.position.y, islet.position.z]}>
      <mesh position={[0, -bodyHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[islet.radius * 0.55, islet.radius, bodyHeight, 8]} />
        <meshStandardMaterial color={ISLAND_ROCK} roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.28, 0]} receiveShadow>
        <cylinderGeometry args={[islet.radius, islet.radius * 1.02, 0.55, 10]} />
        <meshStandardMaterial color={TIER_TINT[islet.tier]} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
