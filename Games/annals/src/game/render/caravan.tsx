import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

const WHEEL_POSITIONS = [
  [-0.45, 0, 0.4],
  [0.45, 0, 0.4],
  [-0.45, 0, -0.4],
  [0.45, 0, -0.4],
] as const;

function CaravanMesh() {
  return (
    <group position-y={0.5}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.1, 0.6, 0.7]} />
        <meshStandardMaterial color="#7a5230" />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <coneGeometry args={[0.8, 0.5, 4]} />
        <meshStandardMaterial color="#c9a15a" />
      </mesh>
      {WHEEL_POSITIONS.map((position) => (
        <mesh key={position.join(",")} position={[position[0], position[1], position[2]]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.22, 0.22, 0.12, 12]} />
          <meshStandardMaterial color="#2b2016" />
        </mesh>
      ))}
    </group>
  );
}

export function renderAnnalsEntity(entity: SceneEntity): ReactNode {
  if (entity.name !== "caravan") return null;
  return <CaravanMesh />;
}
