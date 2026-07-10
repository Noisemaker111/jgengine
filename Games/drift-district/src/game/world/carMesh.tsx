import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { CAR_PLAYER_ENTITY } from "../entities/vehicles/catalog";
import { RIVALS } from "../rivals/catalog";

interface CarLivery {
  primary: string;
  accent: string;
  glow: string;
}

const PLAYER_LIVERY: CarLivery = { primary: "#ff2d78", accent: "#3d0a1e", glow: "#ff2d78" };

const LIVERY_BY_ENTITY: Record<string, CarLivery> = {
  [CAR_PLAYER_ENTITY]: PLAYER_LIVERY,
  ...Object.fromEntries(
    RIVALS.map((rival) => [
      rival.entityId,
      { primary: rival.livery.primary, accent: rival.livery.accent, glow: rival.livery.primary },
    ]),
  ),
};

const WHEEL_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.82, 0.32, 1.35],
  [0.82, 0.32, 1.35],
  [-0.82, 0.32, -1.35],
  [0.82, 0.32, -1.35],
];

function CarMesh({ livery }: { livery: CarLivery }) {
  return (
    <group>
      <mesh position-y={0.62} castShadow>
        <boxGeometry args={[1.7, 0.5, 3.6]} />
        <meshStandardMaterial color={livery.primary} roughness={0.3} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.72, 1.55]} castShadow>
        <boxGeometry args={[1.5, 0.3, 0.7]} />
        <meshStandardMaterial color={livery.primary} roughness={0.3} metalness={0.35} />
      </mesh>
      <mesh position={[0, 1.02, -0.35]} castShadow>
        <boxGeometry args={[1.3, 0.42, 1.6]} />
        <meshStandardMaterial color={livery.accent} roughness={0.12} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, -1.35]} castShadow>
        <boxGeometry args={[1.55, 0.12, 0.35]} />
        <meshStandardMaterial color={livery.accent} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.62, 1.82]}>
        <boxGeometry args={[1.35, 0.16, 0.08]} />
        <meshStandardMaterial color="#f5f9ff" emissive="#cfe6ff" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0.62, -1.82]}>
        <boxGeometry args={[1.35, 0.16, 0.08]} />
        <meshStandardMaterial color={livery.glow} emissive={livery.glow} emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[1.5, 0.06, 3.2]} />
        <meshStandardMaterial
          color={livery.glow}
          emissive={livery.glow}
          emissiveIntensity={2.2}
          transparent
          opacity={0.85}
        />
      </mesh>
      {WHEEL_OFFSETS.map((offset, index) => (
        <mesh key={index} position={offset} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.3, 14]} />
          <meshStandardMaterial color="#101018" roughness={0.85} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

export function renderVehicle(entity: SceneEntity) {
  const livery = LIVERY_BY_ENTITY[entity.name];
  return livery === undefined ? null : <CarMesh livery={livery} />;
}
