import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { DRONE_ENTITY_KIND } from "../entities/catalog";

const ARM_OFFSETS: readonly (readonly [number, number, number])[] = [
  [0.42, 0, 0.42],
  [-0.42, 0, 0.42],
  [0.42, 0, -0.42],
  [-0.42, 0, -0.42],
];

function DroneMesh({ entity }: { entity: SceneEntity }) {
  return (
    <group rotation={[entity.rotationX, 0, entity.rotationZ]}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.16, 0.7]} />
        <meshStandardMaterial color="#20242b" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position-y={0.09}>
        <boxGeometry args={[0.16, 0.05, 0.16]} />
        <meshStandardMaterial color="#9ef01a" emissive="#9ef01a" emissiveIntensity={1.3} />
      </mesh>
      {ARM_OFFSETS.map((offset, index) => (
        <group key={index} position={offset}>
          <mesh castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.14, 8]} />
            <meshStandardMaterial color="#3a4048" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position-y={0.09}>
            <cylinderGeometry args={[0.32, 0.32, 0.02, 16]} />
            <meshStandardMaterial color="#4cc9f0" emissive="#4cc9f0" emissiveIntensity={0.5} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function renderDrone(entity: SceneEntity) {
  return entity.name === DRONE_ENTITY_KIND ? <DroneMesh entity={entity} /> : null;
}
