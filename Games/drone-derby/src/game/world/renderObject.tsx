import * as THREE from "three";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";

import { BASE_ARM_LENGTH, BASE_CRANE_HEIGHT, CARBON_METAL, CHARGE_PAD_KIND, CRANE_KIND, HOLOGRAM_BLUE, RING_GATE_KIND, SIGNAL_ORANGE } from "../objects/catalog";

const RING_RADIUS = 4;
const RING_TUBE = 0.35;

function RingGate({ object }: { object: SceneObject }) {
  const [scale] = objectVisualScale(object.visual);
  const color = object.visual?.color ?? HOLOGRAM_BLUE;
  return (
    <group scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 12, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} roughness={0.3} metalness={0.2} />
      </mesh>
      <pointLight color={color} intensity={4} distance={14} />
    </group>
  );
}

function ChargePad({ object }: { object: SceneObject }) {
  const color = object.visual?.color ?? SIGNAL_ORANGE;
  return (
    <group>
      <mesh position-y={0.05}>
        <cylinderGeometry args={[4.4, 4.6, 0.3, 24]} />
        <meshStandardMaterial color="#14161a" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position-y={0.22}>
        <ringGeometry args={[2.6, 3.6, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={0.22}>
        <ringGeometry args={[0.4, 0.9, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={color} intensity={3} distance={10} position={[0, 1.5, 0]} />
    </group>
  );
}

function Crane({ object }: { object: SceneObject }) {
  const [, heightScale, armScale] = objectVisualScale(object.visual);
  const height = BASE_CRANE_HEIGHT * heightScale;
  const arm = BASE_ARM_LENGTH * armScale;
  return (
    <group>
      <mesh position-y={height / 2}>
        <boxGeometry args={[1.6, height, 1.6]} />
        <meshStandardMaterial color={CARBON_METAL} roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[arm / 2 - 1, height, 0]}>
        <boxGeometry args={[arm, 1.1, 1.1]} />
        <meshStandardMaterial color={CARBON_METAL} roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[-2.5, height, 0]}>
        <boxGeometry args={[3, 1.4, 1.4]} />
        <meshStandardMaterial color={CARBON_METAL} roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[0, height + 0.9, 0]}>
        <sphereGeometry args={[0.35, 10, 10]} />
        <meshStandardMaterial color={SIGNAL_ORANGE} emissive={SIGNAL_ORANGE} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

export function renderObject(object: SceneObject) {
  switch (object.catalogId) {
    case RING_GATE_KIND:
      return <RingGate object={object} />;
    case CHARGE_PAD_KIND:
      return <ChargePad object={object} />;
    case CRANE_KIND:
      return <Crane object={object} />;
    default:
      return null;
  }
}
