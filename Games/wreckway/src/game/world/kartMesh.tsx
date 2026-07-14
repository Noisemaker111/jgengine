import { useStore } from "@jgengine/react/store";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { PART_SLOTS, type PartIconId, type PartSlotId, type WreckwayPartDef } from "../parts/catalog";
import { runSessionStore, type RunSession } from "../run/session";
import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "../entities/catalog";

const RUST = "#b7410e";
const OIL_BLACK = "#1c1a17";
const HAZARD_YELLOW = "#f0c419";
const SCRAP_STEEL = "#8d99a6";
const WELD_WHITE = "#fef3e0";

function toSlots(session: RunSession | undefined): Readonly<Record<PartSlotId, WreckwayPartDef | null>> {
  const empty = { engine: null, front: null, wheels: null, frame: null } as Record<PartSlotId, WreckwayPartDef | null>;
  return session === undefined ? empty : session.snapshot().installed;
}

function WheelPair({ z, partId }: { z: number; partId: PartIconId | undefined }) {
  const big = partId === "monster_treads";
  const springs = partId === "coil_springs";
  const radius = big ? 0.46 : 0.36;
  const width = big ? 0.4 : 0.3;
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.95, radius, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[radius, radius, width, 14]} />
            <meshStandardMaterial color={OIL_BLACK} roughness={0.9} metalness={0.05} />
          </mesh>
          {springs && (
            <mesh position={[side * 0.22, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.22, 0.06, 8, 12]} />
              <meshStandardMaterial color={SCRAP_STEEL} metalness={0.7} roughness={0.3} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

function FrontRig({ partId }: { partId: PartIconId | undefined }) {
  if (partId === "plow_blade") {
    return (
      <mesh position={[0, 0.42, 2.1]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[1.9, 0.55, 0.14]} />
        <meshStandardMaterial color={RUST} metalness={0.6} roughness={0.5} />
      </mesh>
    );
  }
  if (partId === "hood_plate") {
    return (
      <mesh position={[0, 0.58, 1.85]} castShadow>
        <boxGeometry args={[1.45, 0.08, 0.9]} />
        <meshStandardMaterial color={SCRAP_STEEL} metalness={0.4} roughness={0.4} />
      </mesh>
    );
  }
  if (partId === "fan_blade_vanes") {
    return (
      <group position={[0, 0.5, 1.95]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} castShadow>
            <boxGeometry args={[0.85, 0.05, 0.24]} />
            <meshStandardMaterial color={HAZARD_YELLOW} metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </group>
    );
  }
  return null;
}

function EngineRig({ partId }: { partId: PartIconId | undefined }) {
  if (partId === undefined) return null;
  const big = partId === "truck_engine";
  const clean = partId === "ev_conversion";
  return (
    <mesh position={[0, 0.85, 0.65]} castShadow>
      <boxGeometry args={big ? [1.2, 0.6, 1.1] : [0.85, 0.42, 0.75]} />
      <meshStandardMaterial
        color={clean ? WELD_WHITE : RUST}
        emissive={clean ? "#4fd1c5" : "#000000"}
        emissiveIntensity={clean ? 0.5 : 0}
        metalness={0.55}
        roughness={0.4}
      />
    </mesh>
  );
}

function FrameRig({ partId }: { partId: PartIconId | undefined }) {
  if (partId === "roll_cage") {
    return (
      <group position={[0, 0.95, -0.3]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.75, 0.05, 8, 12, Math.PI]} />
          <meshStandardMaterial color={SCRAP_STEEL} metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    );
  }
  if (partId === "armor_plating") {
    return (
      <>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.95, 0.55, -0.2]} castShadow>
            <boxGeometry args={[0.14, 0.6, 2.6]} />
            <meshStandardMaterial color={HAZARD_YELLOW} metalness={0.3} roughness={0.6} />
          </mesh>
        ))}
      </>
    );
  }
  return null;
}

function KartMesh() {
  const slots = useStore(runSessionStore, toSlots);
  return (
    <group>
      <mesh position-y={0.5} castShadow>
        <boxGeometry args={[1.5, 0.42, 2.9]} />
        <meshStandardMaterial color={RUST} roughness={0.65} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.72, -1.3]} castShadow>
        <boxGeometry args={[1.1, 0.5, 0.5]} />
        <meshStandardMaterial color={OIL_BLACK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.56, 0.05, 3]} />
        <meshStandardMaterial color={HAZARD_YELLOW} emissive={HAZARD_YELLOW} emissiveIntensity={0.8} transparent opacity={0.7} />
      </mesh>
      <WheelPair z={1.05} partId={slots.wheels?.id} />
      <WheelPair z={-1.05} partId={slots.wheels?.id} />
      <EngineRig partId={slots.engine?.id} />
      <FrontRig partId={slots.front?.id} />
      <FrameRig partId={slots.frame?.id} />
      {PART_SLOTS.every((slot) => slots[slot] === null) && (
        <mesh position-y={0.95}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={SCRAP_STEEL} wireframe />
        </mesh>
      )}
    </group>
  );
}

function CompactorMesh() {
  return (
    <group>
      <mesh position-y={3} castShadow>
        <boxGeometry args={[42, 6, 2]} />
        <meshStandardMaterial color={OIL_BLACK} roughness={0.7} metalness={0.4} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => -17.5 + i * 5).map((x) => (
        <mesh key={x} position={[x, 3, 1.1]} rotation={[Math.PI / 4, 0, 0]}>
          <boxGeometry args={[1.6, 0.5, 1.6]} />
          <meshStandardMaterial color={HAZARD_YELLOW} emissive={HAZARD_YELLOW} emissiveIntensity={0.4} />
        </mesh>
      ))}
      <mesh position-y={6.2} castShadow>
        <boxGeometry args={[42, 0.6, 2.2]} />
        <meshStandardMaterial color={RUST} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function renderVehicle(entity: SceneEntity) {
  if (entity.name === KART_PLAYER_ENTITY) return <KartMesh />;
  if (entity.name === COMPACTOR_ENTITY) return <CompactorMesh />;
  return null;
}
