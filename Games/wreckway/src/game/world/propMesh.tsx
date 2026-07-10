import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { partById, type WreckwayPartDef } from "../parts/catalog";
import { PICKUPS } from "../run/pickups";
import {
  EXIT_GATE_ARCH,
  GATE_BARRICADE_JUMP,
  GATE_BARRICADE_PLOW,
  PICKUP_MARKER,
  PROP_APPLIANCE_STACK,
  PROP_CONTAINER_STACK,
  PROP_CRANE_LEG,
  PROP_SCRAP_HEAP,
  PROP_TIRE_WALL,
  PROP_WRECK_PILE,
} from "../objects/catalog";

const RUST = "#b7410e";
const OIL_BLACK = "#1c1a17";
const HAZARD_YELLOW = "#f0c419";
const SCRAP_STEEL = "#8d99a6";
const WELD_WHITE = "#fef3e0";

function WreckPile() {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 0.2 - 0.2, 0.5 + i * 0.85, i * 0.15]} rotation={[0.1 * i, 0.4 * i, 0.15 * i]} castShadow>
          <boxGeometry args={[2.2 - i * 0.3, 0.8, 1.5 - i * 0.2]} />
          <meshStandardMaterial color={i % 2 === 0 ? RUST : SCRAP_STEEL} roughness={0.9} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function TireWall() {
  return (
    <group>
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <mesh key={`${col}-${row}`} position={[col * 0.85 - 1.3, 0.45 + row * 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.18, 8, 16]} />
            <meshStandardMaterial color={OIL_BLACK} roughness={0.95} />
          </mesh>
        )),
      )}
    </group>
  );
}

function ApplianceStack() {
  return (
    <group>
      <mesh position-y={0.9} castShadow>
        <boxGeometry args={[1.2, 1.8, 1.1]} />
        <meshStandardMaterial color={SCRAP_STEEL} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.15, 2.1, 0.1]} rotation={[0.2, 0.3, 0.1]} castShadow>
        <boxGeometry args={[1, 0.9, 0.9]} />
        <meshStandardMaterial color={WELD_WHITE} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

function ScrapHeap() {
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[(i % 2) * 0.6 - 0.3, 0.25 + Math.floor(i / 2) * 0.5, ((i * 37) % 5) * 0.1 - 0.2]}
          rotation={[0.3 * i, 0.5 * i, 0.2 * i]}
        >
          <boxGeometry args={[0.7, 0.4, 0.6]} />
          <meshStandardMaterial color={i % 2 === 0 ? HAZARD_YELLOW : SCRAP_STEEL} roughness={0.8} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function ContainerStack() {
  return (
    <group>
      <mesh position-y={1.2} castShadow>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshStandardMaterial color={RUST} roughness={0.6} metalness={0.35} />
      </mesh>
      <mesh position={[0.3, 3.5, 0]} castShadow>
        <boxGeometry args={[2.2, 2.2, 2.2]} />
        <meshStandardMaterial color={SCRAP_STEEL} roughness={0.6} metalness={0.35} />
      </mesh>
    </group>
  );
}

function CraneLeg() {
  return (
    <group>
      <mesh position-y={5} castShadow>
        <boxGeometry args={[0.6, 10, 0.6]} />
        <meshStandardMaterial color={HAZARD_YELLOW} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[1.6, 9.6, 0]} rotation={[0, 0, -0.15]} castShadow>
        <boxGeometry args={[3.6, 0.4, 0.4]} />
        <meshStandardMaterial color={OIL_BLACK} roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  );
}

function GateBarricade({ requirement }: { requirement: "plow" | "jump" }) {
  const color = requirement === "plow" ? RUST : HAZARD_YELLOW;
  return (
    <group>
      {[-3.6, -1.2, 1.2, 3.6].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]} castShadow>
          <boxGeometry args={[0.3, 2.2, 0.3]} />
          <meshStandardMaterial color={OIL_BLACK} roughness={0.8} />
        </mesh>
      ))}
      <mesh position-y={1.6} castShadow>
        <boxGeometry args={[9.4, 0.5, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.5} />
      </mesh>
      <mesh position-y={0.6}>
        <boxGeometry args={[9.4, 0.35, 0.3]} />
        <meshStandardMaterial color={HAZARD_YELLOW} emissive={HAZARD_YELLOW} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function ExitGate() {
  return (
    <group>
      {[-9, 9].map((x) => (
        <mesh key={x} position={[x, 3.5, 0]} castShadow>
          <boxGeometry args={[1, 7, 1]} />
          <meshStandardMaterial color={SCRAP_STEEL} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <mesh position-y={7.2} castShadow>
        <boxGeometry args={[19, 1, 1]} />
        <meshStandardMaterial color={HAZARD_YELLOW} emissive={HAZARD_YELLOW} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 8.4, 0]}>
        <boxGeometry args={[6, 1.2, 0.3]} />
        <meshStandardMaterial color={WELD_WHITE} emissive={WELD_WHITE} emissiveIntensity={1.1} />
      </mesh>
    </group>
  );
}

function PickupMarker({ instanceId }: { instanceId: string }) {
  const pickup = PICKUPS.find((entry) => `marker-${entry.id}` === instanceId);
  const part: WreckwayPartDef | null = pickup === undefined ? null : partById(pickup.partId);
  if (part === null) return null;
  return (
    <group>
      <mesh castShadow>
        <octahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={WELD_WHITE} emissive={HAZARD_YELLOW} emissiveIntensity={1.2} metalness={0.4} roughness={0.2} />
      </mesh>
      <pointLight color={HAZARD_YELLOW} intensity={1.4} distance={5} />
    </group>
  );
}

export function renderProp(object: SceneObject) {
  switch (object.catalogId) {
    case PROP_WRECK_PILE:
      return <WreckPile />;
    case PROP_TIRE_WALL:
      return <TireWall />;
    case PROP_APPLIANCE_STACK:
      return <ApplianceStack />;
    case PROP_SCRAP_HEAP:
      return <ScrapHeap />;
    case PROP_CONTAINER_STACK:
      return <ContainerStack />;
    case PROP_CRANE_LEG:
      return <CraneLeg />;
    case GATE_BARRICADE_PLOW:
      return <GateBarricade requirement="plow" />;
    case GATE_BARRICADE_JUMP:
      return <GateBarricade requirement="jump" />;
    case PICKUP_MARKER:
      return <PickupMarker instanceId={object.instanceId} />;
    case EXIT_GATE_ARCH:
      return <ExitGate />;
    default:
      return null;
  }
}
