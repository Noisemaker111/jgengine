import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { usePlayer } from "@jgengine/react/hooks";
import { DoubleSide } from "three";
import { liveryFor } from "../boats/catalog";

export function BoatMesh({ entity }: { entity: SceneEntity }) {
  const { userId } = usePlayer();
  const livery = liveryFor(entity.id, userId);
  return (
    <group>
      <mesh position={[0, 0.26, 0]} castShadow>
        <boxGeometry args={[0.92, 0.4, 2.3]} />
        <meshStandardMaterial color={livery.hullColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.28, 1.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.47, 0.85, 4]} />
        <meshStandardMaterial color={livery.hullColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.48, -1.02]} castShadow>
        <boxGeometry args={[0.74, 0.16, 0.24]} />
        <meshStandardMaterial color={livery.trimColor} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.9, -0.1]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 1.5, 6]} />
        <meshStandardMaterial color={livery.trimColor} />
      </mesh>
      <mesh position={[0.28, 1.15, 0.15]} rotation={[0, 0, 0.08]} castShadow>
        <planeGeometry args={[0.85, 1.05]} />
        <meshStandardMaterial color={livery.sailColor} side={DoubleSide} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.98, 0.06, 2.35]} />
        <meshStandardMaterial color={livery.trimColor} roughness={0.6} />
      </mesh>
    </group>
  );
}
