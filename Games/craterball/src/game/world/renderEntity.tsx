import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { BALL, BOMBER_MAGENTA, PLAYER_CYAN } from "../entities/catalog";

const CYAN = "#3bc7c4";
const MAGENTA = "#d94a8c";

function BallMesh() {
  return (
    <mesh castShadow>
      <sphereGeometry args={[0.42, 24, 24]} />
      <meshStandardMaterial color="#ff6b35" emissive="#ff6b35" emissiveIntensity={1.15} roughness={0.35} metalness={0.1} />
    </mesh>
  );
}

function BomberMesh({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={0.92} castShadow>
        <capsuleGeometry args={[0.38, 1.05, 6, 14]} />
        <meshStandardMaterial color="#23201d" roughness={0.75} />
      </mesh>
      <mesh position-y={0.55} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.42, 0.09, 8, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 1.45, 0.3]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

export function renderEntity(entity: SceneEntity): ReactNode {
  if (entity.name === BALL) return <BallMesh />;
  if (entity.name === PLAYER_CYAN) return <BomberMesh color={CYAN} />;
  if (entity.name === BOMBER_MAGENTA) return <BomberMesh color={MAGENTA} />;
  return null;
}
