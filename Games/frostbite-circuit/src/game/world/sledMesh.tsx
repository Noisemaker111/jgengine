import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { SLEDDERS } from "../ai/sledders";
import { SLED_PLAYER_ENTITY } from "../entities/vehicles/catalog";

interface SledLivery {
  primary: string;
  accent: string;
  glow: string;
}

const PLAYER_LIVERY: SledLivery = { primary: "#f1faee", accent: "#a8dadc", glow: "#80ffdb" };

const LIVERY_BY_ENTITY: Record<string, SledLivery> = {
  [SLED_PLAYER_ENTITY]: PLAYER_LIVERY,
  ...Object.fromEntries(
    SLEDDERS.map((def) => [def.entityId, { primary: def.livery.primary, accent: def.livery.accent, glow: def.livery.primary }]),
  ),
};

const RUNNER_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.55, 0.14, 0],
  [0.55, 0.14, 0],
];

function SledMesh({ livery }: { livery: SledLivery }) {
  return (
    <group>
      <mesh position-y={0.42} castShadow>
        <boxGeometry args={[1.3, 0.4, 2.9]} />
        <meshStandardMaterial color={livery.primary} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.68, 0.7]} castShadow>
        <boxGeometry args={[1.1, 0.28, 1.1]} />
        <meshStandardMaterial color={livery.accent} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.9, -0.3]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.95, 0.5, 0.06]} />
        <meshStandardMaterial color="#e8f4f4" transparent opacity={0.55} roughness={0.05} metalness={0.6} />
      </mesh>
      {RUNNER_OFFSETS.map((offset, i) => (
        <mesh key={i} position={offset} castShadow>
          <boxGeometry args={[0.14, 0.12, 3.2]} />
          <meshStandardMaterial color="#dfe9ea" roughness={0.15} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 1.5]}>
        <boxGeometry args={[0.9, 0.12, 0.08]} />
        <meshStandardMaterial color="#f5f9ff" emissive="#cfe6ff" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0.55, -1.5]}>
        <boxGeometry args={[0.9, 0.12, 0.08]} />
        <meshStandardMaterial color={livery.glow} emissive={livery.glow} emissiveIntensity={1.8} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[1.15, 0.05, 2.7]} />
        <meshStandardMaterial color={livery.glow} emissive={livery.glow} emissiveIntensity={1.4} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

export function renderSled(entity: SceneEntity) {
  const livery = LIVERY_BY_ENTITY[entity.name];
  return livery === undefined ? null : <SledMesh livery={livery} />;
}
