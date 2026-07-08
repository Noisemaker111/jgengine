import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { CAR_PLAYER_ENTITY } from "../entities/vehicles/catalog";

const WHEEL_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.85, -0.08, 1.55],
  [0.85, -0.08, 1.55],
  [-0.85, -0.08, -1.55],
  [0.85, -0.08, -1.55],
];

export function CarMesh() {
  return (
    <group>
      <mesh position-y={0.05} castShadow>
        <boxGeometry args={[1.7, 0.6, 3.4]} />
        <meshStandardMaterial color="#e8392a" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.42, -0.25]} castShadow>
        <boxGeometry args={[1.35, 0.4, 1.4]} />
        <meshStandardMaterial color="#26374a" roughness={0.1} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.05, 1.68]}>
        <boxGeometry args={[1.3, 0.18, 0.1]} />
        <meshStandardMaterial color="#fffaf0" emissive="#fff2b0" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.05, -1.68]}>
        <boxGeometry args={[1.3, 0.18, 0.1]} />
        <meshStandardMaterial color="#7a0d0d" emissive="#ff2d2d" emissiveIntensity={0.45} />
      </mesh>
      {WHEEL_OFFSETS.map((offset, index) => (
        <mesh key={index} position={offset} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.3, 14]} />
          <meshStandardMaterial color="#17181c" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function renderVehicle(entity: SceneEntity) {
  return entity.name === CAR_PLAYER_ENTITY ? <CarMesh /> : null;
}
