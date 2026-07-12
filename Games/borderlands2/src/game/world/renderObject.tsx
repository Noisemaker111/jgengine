import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

function VendorMachine({ base, accent, label }: { base: string; accent: string; label?: string }) {
  void label;
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1.1, 2, 0.7]} />
        <meshStandardMaterial color={base} flatShading />
      </mesh>
      <mesh position={[0, 1.45, 0.36]}>
        <boxGeometry args={[0.8, 0.5, 0.02]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.75, 0.36]}>
        <boxGeometry args={[0.7, 0.55, 0.02]} />
        <meshStandardMaterial color="#101418" />
      </mesh>
      <mesh position={[0, 2.14, 0]}>
        <boxGeometry args={[1.2, 0.28, 0.8]} />
        <meshStandardMaterial color={accent} flatShading />
      </mesh>
    </group>
  );
}

function RedChest() {
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[1.3, 0.6, 0.8]} />
        <meshStandardMaterial color="#a32c1e" flatShading />
      </mesh>
      <mesh position={[0, 0.68, -0.12]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[1.3, 0.5, 0.75]} />
        <meshStandardMaterial color="#c0392a" flatShading />
      </mesh>
      <mesh position={[0, 0.35, 0.41]}>
        <boxGeometry args={[0.3, 0.24, 0.03]} />
        <meshStandardMaterial color="#ffb400" emissive="#ffb400" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[-0.55, 0.3, 0.41]}>
        <boxGeometry args={[0.08, 0.5, 0.02]} />
        <meshStandardMaterial color="#5e1a10" />
      </mesh>
      <mesh position={[0.55, 0.3, 0.41]}>
        <boxGeometry args={[0.08, 0.5, 0.02]} />
        <meshStandardMaterial color="#5e1a10" />
      </mesh>
    </group>
  );
}

function AmmoChest() {
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1, 0.56, 0.7]} />
        <meshStandardMaterial color="#3c5b32" flatShading />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[1.04, 0.08, 0.74]} />
        <meshStandardMaterial color="#2a4022" flatShading />
      </mesh>
      <mesh position={[0, 0.34, 0.36]}>
        <boxGeometry args={[0.5, 0.18, 0.02]} />
        <meshStandardMaterial color="#c9d64a" emissive="#c9d64a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function FastTravel() {
  const ring = useRef<Mesh>(null);
  useFrame((state) => {
    if (ring.current) {
      ring.current.rotation.z = state.clock.elapsedTime * 0.8;
      ring.current.position.y = 1.7 + Math.sin(state.clock.elapsedTime * 1.4) * 0.12;
    }
  });
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.9, 0.3, 6]} />
        <meshStandardMaterial color="#2c3138" flatShading />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.34, 2.3, 0.34]} />
        <meshStandardMaterial color="#3a4450" flatShading />
      </mesh>
      <mesh ref={ring} position={[0, 1.7, 0]}>
        <torusGeometry args={[0.55, 0.06, 8, 24]} />
        <meshStandardMaterial color="#38e1ff" emissive="#38e1ff" emissiveIntensity={1.8} />
      </mesh>
      <pointLight position={[0, 1.8, 0]} color="#38e1ff" intensity={6} distance={7} />
    </group>
  );
}

function NewUPole() {
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 2.2, 8]} />
        <meshStandardMaterial color="#3a4450" flatShading />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.7, 0.4, 0.12]} />
        <meshStandardMaterial color="#2f8cff" emissive="#2f8cff" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function Barrel() {
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.36, 0.9, 10]} />
        <meshStandardMaterial color="#b3452a" flatShading />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.08, 10]} />
        <meshStandardMaterial color="#e2582e" flatShading />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.08, 10]} />
        <meshStandardMaterial color="#7a2c18" flatShading />
      </mesh>
    </group>
  );
}

function RockSpire({ seedIndex }: { seedIndex: number }) {
  const spin = (seedIndex * 137.5) % 360;
  const height = 2.2 + (seedIndex % 5) * 0.9;
  return (
    <group position={[0, -0.5, 0]} rotation={[0, (spin / 180) * Math.PI, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <coneGeometry args={[1.1 + (seedIndex % 3) * 0.3, height, 5]} />
        <meshStandardMaterial color={seedIndex % 2 === 0 ? "#8a5a38" : "#75492c"} flatShading />
      </mesh>
      <mesh position={[0.8, 0.5, 0.3]} castShadow>
        <coneGeometry args={[0.5, 1.1, 4]} />
        <meshStandardMaterial color="#6e4a33" flatShading />
      </mesh>
    </group>
  );
}

function DeadTree({ seedIndex }: { seedIndex: number }) {
  const lean = ((seedIndex % 7) - 3) * 0.06;
  return (
    <group position={[0, -0.5, 0]} rotation={[0, seedIndex, lean]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.16, 2.2, 5]} />
        <meshStandardMaterial color="#4a3a2c" flatShading />
      </mesh>
      <mesh position={[0.3, 1.9, 0]} rotation={[0, 0, -0.7]} castShadow>
        <cylinderGeometry args={[0.04, 0.07, 1, 4]} />
        <meshStandardMaterial color="#4a3a2c" flatShading />
      </mesh>
      <mesh position={[-0.25, 1.5, 0.1]} rotation={[0.2, 0, 0.8]} castShadow>
        <cylinderGeometry args={[0.03, 0.06, 0.8, 4]} />
        <meshStandardMaterial color="#40312a" flatShading />
      </mesh>
    </group>
  );
}

function Wreck({ seedIndex }: { seedIndex: number }) {
  return (
    <group position={[0, -0.5, 0]} rotation={[0, seedIndex * 1.3, 0.06]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2.4, 0.7, 1.2]} />
        <meshStandardMaterial color="#5e564a" flatShading />
      </mesh>
      <mesh position={[0.4, 0.9, 0]} castShadow>
        <boxGeometry args={[1.1, 0.4, 1.05]} />
        <meshStandardMaterial color="#4a443c" flatShading />
      </mesh>
      <mesh position={[-0.9, 0.25, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
        <meshStandardMaterial color="#26221e" flatShading />
      </mesh>
    </group>
  );
}

function seedFromInstance(instanceId: string): number {
  let hash = 0;
  for (let index = 0; index < instanceId.length; index += 1) hash = (hash * 31 + instanceId.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

export function renderPandoraObject(object: SceneObject): ReactNode {
  const seedIndex = seedFromInstance(object.instanceId);
  switch (object.catalogId) {
    case "vendor_marcus":
      return <VendorMachine base="#8a6a1e" accent="#ffb400" />;
    case "vendor_zed":
      return <VendorMachine base="#d8d4c8" accent="#e23c2e" />;
    case "black_market":
      return <VendorMachine base="#3a2c4a" accent="#c05cff" />;
    case "red_chest":
      return <RedChest />;
    case "ammo_chest":
      return <AmmoChest />;
    case "fast_travel":
      return <FastTravel />;
    case "new_u_station":
      return <NewUPole />;
    case "bandit_barrel":
      return <Barrel />;
    case "rock_spire":
      return <RockSpire seedIndex={seedIndex} />;
    case "dead_tree":
      return <DeadTree seedIndex={seedIndex} />;
    case "wreck":
      return <Wreck seedIndex={seedIndex} />;
    default:
      return undefined;
  }
}
