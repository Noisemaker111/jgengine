import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { FAN_HOUSING_OBJECT, FAN_ROTOR_OBJECT, RING_GATE_OBJECT, WINDSOCK_OBJECT } from "../objects/catalog";
import { PALETTE } from "../objects/styles";

const BLADE_COUNT = 5;
const BLADE_ANGLES = Array.from({ length: BLADE_COUNT }, (_, i) => (i / BLADE_COUNT) * Math.PI * 2);

function FanHousing() {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.2, 0.7, 10, 28]} />
        <meshStandardMaterial color={PALETTE.citySlate} roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.4]}>
        <cylinderGeometry args={[3.6, 4, 0.8, 24]} />
        <meshStandardMaterial color={PALETTE.cloudWhite} roughness={0.7} metalness={0.1} />
      </mesh>
    </group>
  );
}

function FanRotor() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshStandardMaterial color={PALETTE.shadowBlue} roughness={0.35} metalness={0.5} />
      </mesh>
      {BLADE_ANGLES.map((angle) => (
        <mesh key={angle} rotation={[0, 0, angle]} position={[Math.cos(angle) * 1.9, Math.sin(angle) * 1.9, 0]}>
          <boxGeometry args={[0.35, 3.6, 0.1]} />
          <meshStandardMaterial color={PALETTE.cloudWhite} emissive={PALETTE.windsockOrange} emissiveIntensity={0.15} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Windsock() {
  return (
    <group>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 6, 8]} />
        <meshStandardMaterial color={PALETTE.citySlate} roughness={0.6} />
      </mesh>
      <mesh position={[0, 5.4, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.7, 2.4, 12]} />
        <meshStandardMaterial color={PALETTE.windsockOrange} roughness={0.5} side={2} />
      </mesh>
    </group>
  );
}

function RingGate() {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[10, 0.5, 10, 32]} />
        <meshStandardMaterial color={PALETTE.skyTeal} emissive={PALETTE.skyTeal} emissiveIntensity={0.55} roughness={0.3} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export function renderCityProp(object: SceneObject) {
  if (object.catalogId === FAN_HOUSING_OBJECT) return <FanHousing />;
  if (object.catalogId === FAN_ROTOR_OBJECT) return <FanRotor />;
  if (object.catalogId === WINDSOCK_OBJECT) return <Windsock />;
  if (object.catalogId === RING_GATE_OBJECT) return <RingGate />;
  return null;
}
