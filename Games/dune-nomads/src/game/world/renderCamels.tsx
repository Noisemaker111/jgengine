import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { DUNE_GOLD, INDIGO_ROBE, RIVAL_RED } from "../palette";
import { CAMEL_LEAD_KIND, CAMEL_PACK_KIND, CAMEL_RIVAL_KIND } from "../entities/kinds";

interface CamelMeshProps {
  bodyColor: string;
  robeColor: string;
  scale?: number;
}

function CamelMesh({ bodyColor, robeColor, scale = 1 }: CamelMeshProps) {
  return (
    <group scale={scale}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.45, 1.1, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.34, 10, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.35, 0.75]} rotation={[0.6, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.85, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.78, 1.12]} castShadow>
        <boxGeometry args={[0.24, 0.24, 0.42]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} />
      </mesh>
      {[
        [-0.28, 0, 0.5],
        [0.28, 0, 0.5],
        [-0.28, 0, -0.5],
        [0.28, 0, -0.5],
      ].map((offset, index) => (
        <mesh key={index} position={[offset[0]!, 0.5, offset[2]!]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 1, 6]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 1.05, -0.68]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.03, 0.5, 6]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.18, 0.05]}>
        <boxGeometry args={[0.62, 0.14, 0.5]} />
        <meshStandardMaterial color={robeColor} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function renderCaravanEntity(entity: SceneEntity) {
  if (entity.name === CAMEL_LEAD_KIND) return <CamelMesh bodyColor={DUNE_GOLD} robeColor={INDIGO_ROBE} scale={1.05} />;
  if (entity.name === CAMEL_PACK_KIND) return <CamelMesh bodyColor="#c9a26a" robeColor={DUNE_GOLD} scale={0.92} />;
  if (entity.name === CAMEL_RIVAL_KIND) return <CamelMesh bodyColor="#8a6a4a" robeColor={RIVAL_RED} scale={1.02} />;
  return null;
}
