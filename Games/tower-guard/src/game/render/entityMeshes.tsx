import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { BASE_CATALOG_ID } from "../entities/base/catalog";
import { CREEP_CATALOG, creepDef } from "../entities/enemies/catalog";
import { towerDef } from "../entities/towers/catalog";

function CreepMesh({ catalogId }: { catalogId: string }) {
  const def = creepDef(catalogId);
  const s = def.scale;
  return (
    <group scale={s}>
      <mesh position-y={0.62}>
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
      <mesh position-y={1.1}>
        <cylinderGeometry args={[0.55, 0.65, 2.2, 8]} />
        <meshStandardMaterial color={def.color} roughness={0.85} />
      </mesh>
      <mesh position-y={2.3}>
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
      <mesh position-y={0.55}>
        <cylinderGeometry args={[0.95, 1.05, 1.1, 10]} />
        <meshStandardMaterial color={def.color} roughness={0.9} />
      </mesh>
      <mesh position-y={1.35}>
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
      <mesh position-y={0.4}>
        <cylinderGeometry args={[0.6, 0.72, 0.8, 8]} />
        <meshStandardMaterial color={def.trim} roughness={0.85} />
      </mesh>
      <mesh position-y={1.5} rotation={[0.2, 0.4, 0]}>
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

function KeepMesh() {
  return (
    <group>
      <mesh position-y={1.4}>
        <cylinderGeometry args={[1.7, 2, 2.8, 12]} />
        <meshStandardMaterial color="#6b6a63" roughness={0.9} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.7, 2.95, Math.sin(angle) * 1.7]}>
            <boxGeometry args={[0.4, 0.5, 0.4]} />
            <meshStandardMaterial color="#57564f" roughness={0.9} />
          </mesh>
        );
      })}
      <mesh position-y={3.7}>
        <cylinderGeometry args={[0.05, 0.05, 1.6, 6]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.8} />
      </mesh>
      <mesh position={[0.32, 4.15, 0]}>
        <boxGeometry args={[0.6, 0.4, 0.04]} />
        <meshStandardMaterial color="#a13a3a" roughness={0.6} />
      </mesh>
      <mesh position-y={2.2}>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#f4d35e" emissive="#f4a53e" emissiveIntensity={0.6} roughness={0.3} />
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
