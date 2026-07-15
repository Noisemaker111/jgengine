import type { ReactNode } from "react";
import { DoubleSide } from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { BASE_CATALOG_ID } from "../entities/base/catalog";
import { CREEP_CATALOG, creepDef } from "../entities/enemies/catalog";
import { towerDef } from "../entities/towers/catalog";

function CreepMesh({ catalogId }: { catalogId: string }) {
  const def = creepDef(catalogId);
  const s = def.scale;
  return (
    <group scale={s}>
      <mesh position-y={0.62} castShadow>
        <capsuleGeometry args={[0.32, 0.55, 4, 10]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.05, 0.02]}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color={def.trim} roughness={0.6} />
      </mesh>
      <mesh position={[-0.14, 1.28, 0.1]} rotation={[0.3, 0, -0.2]}>
        <coneGeometry args={[0.05, 0.22, 6]} />
        <meshStandardMaterial color="#e8e0c8" roughness={0.4} />
      </mesh>
      <mesh position={[0.14, 1.28, 0.1]} rotation={[0.3, 0, 0.2]}>
        <coneGeometry args={[0.05, 0.22, 6]} />
        <meshStandardMaterial color="#e8e0c8" roughness={0.4} />
      </mesh>
      <mesh position={[0.3, 0.7, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.18, 0.32, 0.18]} />
        <meshStandardMaterial color={def.trim} roughness={0.8} />
      </mesh>
      <mesh position={[-0.3, 0.7, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.18, 0.32, 0.18]} />
        <meshStandardMaterial color={def.trim} roughness={0.8} />
      </mesh>
    </group>
  );
}

function ArcherTowerMesh() {
  const def = towerDef("tower_archer");
  return (
    <group>
      <mesh position-y={0.35} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.95, 0.7, 8]} />
        <meshStandardMaterial color="#7c7468" roughness={1} />
      </mesh>
      <mesh position-y={1.1} castShadow>
        <cylinderGeometry args={[0.55, 0.65, 2.2, 8]} />
        <meshStandardMaterial color={def.color} roughness={0.85} />
      </mesh>
      <mesh position-y={2.3} castShadow>
        <boxGeometry args={[1.6, 0.24, 1.6]} />
        <meshStandardMaterial color={def.trim} roughness={0.75} />
      </mesh>
      <mesh position-y={2.95}>
        <coneGeometry args={[1.1, 1.1, 4]} />
        <meshStandardMaterial color="#a13a3a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.5, 0.85]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.34, 0.035, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#e8e0c8" roughness={0.4} />
      </mesh>
    </group>
  );
}

function CannonTowerMesh() {
  const def = towerDef("tower_cannon");
  return (
    <group>
      <mesh position-y={0.55} castShadow receiveShadow>
        <cylinderGeometry args={[0.95, 1.05, 1.1, 10]} />
        <meshStandardMaterial color={def.color} roughness={0.9} />
      </mesh>
      <mesh position-y={1.35} castShadow>
        <boxGeometry args={[1.5, 0.9, 1.5]} />
        <meshStandardMaterial color={def.trim} roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.4, 0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 1.5, 10]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.65, 0.35, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.09, 8, 14]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.9} />
      </mesh>
      <mesh position={[-0.65, 0.35, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.09, 8, 14]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.9} />
      </mesh>
    </group>
  );
}

function FrostTowerMesh() {
  const def = towerDef("tower_frost");
  return (
    <group>
      <mesh position-y={0.4} castShadow receiveShadow>
        <cylinderGeometry args={[0.6, 0.72, 0.8, 8]} />
        <meshStandardMaterial color={def.trim} roughness={0.85} />
      </mesh>
      <mesh position-y={1.5} rotation={[0.2, 0.4, 0]} castShadow>
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color={def.color} roughness={0.15} metalness={0.3} emissive="#3fb9d1" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.4, 1.05, 0.3]} rotation={[0.6, 0.2, 0.4]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={def.color} roughness={0.2} emissive="#3fb9d1" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-0.35, 0.95, -0.25]} rotation={[0.3, 0.8, 0.1]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={def.color} roughness={0.2} emissive="#3fb9d1" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

const STONE_LIGHT = "#8d887c";
const STONE_DARK = "#6a655b";
const ROOF_RED = "#9c3a34";

/** Crenellated battlement ring — merlons spaced around a radius. */
function Battlements({ radius, y, count, size }: { radius: number; y: number; count: number; size: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * radius, y, Math.sin(angle) * radius]} castShadow>
            <boxGeometry args={[size, size * 1.3, size]} />
            <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
          </mesh>
        );
      })}
    </>
  );
}

function Banner({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position-y={0.9} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.8, 6]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.8} />
      </mesh>
      <mesh position={[0.34, 1.42, 0]}>
        <boxGeometry args={[0.62, 0.62, 0.04]} />
        <meshStandardMaterial color={ROOF_RED} roughness={0.55} side={DoubleSide} />
      </mesh>
      <mesh position={[0.34, 1.42, 0.03]}>
        <planeGeometry args={[0.26, 0.26]} />
        <meshStandardMaterial color="#f4d35e" emissive="#f4a53e" emissiveIntensity={0.35} roughness={0.4} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** A stone keep — the landmark the whole map defends. Curtain wall, corner towers, a crowned donjon. */
function KeepMesh() {
  const corners: [number, number][] = [
    [2.1, 2.1],
    [-2.1, 2.1],
    [2.1, -2.1],
    [-2.1, -2.1],
  ];
  return (
    <group>
      {/* Raised motte foundation */}
      <mesh position-y={0.35} receiveShadow castShadow>
        <cylinderGeometry args={[3.6, 4.1, 0.7, 20]} />
        <meshStandardMaterial color="#6d6455" roughness={1} />
      </mesh>
      {/* Curtain wall ring */}
      <mesh position-y={1.5} castShadow receiveShadow>
        <cylinderGeometry args={[3.1, 3.25, 1.8, 20]} />
        <meshStandardMaterial color={STONE_LIGHT} roughness={0.92} />
      </mesh>
      <mesh position-y={2.32} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.18, 0.09, 6, 24]} />
        <meshStandardMaterial color="#545047" roughness={0.9} transparent opacity={0.6} />
      </mesh>
      <Battlements radius={3.18} y={2.5} count={16} size={0.34} />
      {/* Corner towers */}
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={1.7} castShadow>
            <cylinderGeometry args={[0.62, 0.72, 3.4, 10]} />
            <meshStandardMaterial color={STONE_LIGHT} roughness={0.9} />
          </mesh>
          <Battlements radius={0.62} y={3.5} count={7} size={0.2} />
          <mesh position-y={4.15} castShadow>
            <coneGeometry args={[0.85, 1.1, 10]} />
            <meshStandardMaterial color={ROOF_RED} roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Central donjon */}
      <mesh position-y={3.1} castShadow>
        <cylinderGeometry args={[1.5, 1.7, 4.6, 12]} />
        <meshStandardMaterial color={STONE_LIGHT} roughness={0.88} />
      </mesh>
      <Battlements radius={1.5} y={5.55} count={11} size={0.3} />
      <mesh position-y={6.4} castShadow>
        <coneGeometry args={[1.95, 2, 12]} />
        <meshStandardMaterial color={ROOF_RED} roughness={0.55} />
      </mesh>
      {/* Crowning finial + banners */}
      <mesh position-y={7.6}>
        <sphereGeometry args={[0.26, 12, 10]} />
        <meshStandardMaterial color="#f4d35e" emissive="#f4a53e" emissiveIntensity={0.7} roughness={0.25} metalness={0.4} />
      </mesh>
      <Banner position={[2.1, 2.5, 2.1]} rotation={-Math.PI / 4} />
      <Banner position={[-2.1, 2.5, -2.1]} rotation={(Math.PI * 3) / 4} />
      {/* Gate arch facing the incoming path */}
      <mesh position={[2.35, 1.15, 2.35]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[1.1, 1.6, 0.3]} />
        <meshStandardMaterial color="#2c2118" roughness={0.85} />
      </mesh>
    </group>
  );
}

export function renderTowerGuardEntity(entity: SceneEntity): ReactNode | undefined {
  if (entity.name === BASE_CATALOG_ID) return <KeepMesh />;
  if (entity.name === "tower_archer") return <ArcherTowerMesh />;
  if (entity.name === "tower_cannon") return <CannonTowerMesh />;
  if (entity.name === "tower_frost") return <FrostTowerMesh />;
  if (entity.name in CREEP_CATALOG) return <CreepMesh catalogId={entity.name} />;
  return undefined;
}
