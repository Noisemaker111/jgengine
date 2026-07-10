import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { PLAYER_CAR_ENTITY, SMUGGLER_TRUCK_ENTITY } from "../entities/catalog";

const PALETTE = {
  playerBody: "#e8d7c3",
  playerCabin: "#33465c",
  playerAccent: "#ffc857",
  truckBody: "#7a2812",
  truckCargo: "#4b3b63",
  truckCabin: "#2a2033",
  truckAccent: "#f2b26b",
} as const;

function PlayerCarMesh() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.7, 0.7, 3.4]} />
        <meshStandardMaterial color={PALETTE.playerBody} />
      </mesh>
      <mesh position={[0, 1.05, -0.3]}>
        <boxGeometry args={[1.3, 0.5, 1.6]} />
        <meshStandardMaterial color={PALETTE.playerCabin} />
      </mesh>
      <mesh position={[-0.55, 0.6, 1.68]}>
        <boxGeometry args={[0.28, 0.2, 0.12]} />
        <meshStandardMaterial color={PALETTE.playerAccent} emissive={PALETTE.playerAccent} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0.55, 0.6, 1.68]}>
        <boxGeometry args={[0.28, 0.2, 0.12]} />
        <meshStandardMaterial color={PALETTE.playerAccent} emissive={PALETTE.playerAccent} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function SmugglerTruckMesh() {
  return (
    <group>
      <mesh position={[0, 0.65, 0.4]}>
        <boxGeometry args={[2.1, 0.9, 4.6]} />
        <meshStandardMaterial color={PALETTE.truckBody} />
      </mesh>
      <mesh position={[0, 1.35, -1.1]}>
        <boxGeometry args={[2, 1.6, 2.3]} />
        <meshStandardMaterial color={PALETTE.truckCargo} />
      </mesh>
      <mesh position={[0, 1.15, 1.85]}>
        <boxGeometry args={[1.6, 0.6, 1.4]} />
        <meshStandardMaterial color={PALETTE.truckCabin} />
      </mesh>
      <mesh position={[-0.7, 1.1, 2.5]}>
        <boxGeometry args={[0.22, 0.18, 0.1]} />
        <meshStandardMaterial color={PALETTE.truckAccent} emissive={PALETTE.truckAccent} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.7, 1.1, 2.5]}>
        <boxGeometry args={[0.22, 0.18, 0.1]} />
        <meshStandardMaterial color={PALETTE.truckAccent} emissive={PALETTE.truckAccent} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

export function renderVehicleEntity(entity: SceneEntity): ReactNode {
  if (entity.name === PLAYER_CAR_ENTITY) return <PlayerCarMesh />;
  if (entity.name === SMUGGLER_TRUCK_ENTITY) return <SmugglerTruckMesh />;
  return null;
}
