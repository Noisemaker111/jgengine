import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { coverObjectById } from "../objects/catalog";
import { ARENA_COLORS } from "../palette";

function Crate({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.96, 0.96, 0.96]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.45} />
      </mesh>
      <mesh>
        <boxGeometry args={[1, 0.14, 1]} />
        <meshStandardMaterial color="#11161b" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial color="#11161b" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

function Barrier() {
  return (
    <group>
      <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.9, 0.55]} />
        <meshStandardMaterial color="#3a434e" roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.02, 0.08, 0.58]} />
        <meshStandardMaterial
          color={ARENA_COLORS.wallTrim}
          emissive={ARENA_COLORS.wallTrim}
          emissiveIntensity={0.55}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

function Pylon() {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.4, 6]} />
        <meshStandardMaterial color="#1d2b33" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.3, 6]} />
        <meshStandardMaterial
          color={ARENA_COLORS.pylon}
          emissive={ARENA_COLORS.pylon}
          emissiveIntensity={1.6}
        />
      </mesh>
    </group>
  );
}

function Wreck() {
  return (
    <group>
      <mesh rotation={[0.12, 0.5, -0.08]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.7, 0.9]} />
        <meshStandardMaterial color="#4a3228" roughness={0.85} metalness={0.35} />
      </mesh>
      <mesh position={[0.15, 0.4, -0.1]} rotation={[0.3, -0.4, 0.2]}>
        <boxGeometry args={[0.6, 0.4, 0.5]} />
        <meshStandardMaterial color="#382318" roughness={0.9} metalness={0.3} />
      </mesh>
    </group>
  );
}

function Station({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.3, 0.9]} />
        <meshStandardMaterial color="#232b35" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[1.2, 0.5, 1]} />
        <meshStandardMaterial color="#2c3642" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <boxGeometry args={[1.24, 0.14, 1.04]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[0, 0.35, 0.47]}>
        <boxGeometry args={[0.7, 0.5, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} opacity={0.9} transparent />
      </mesh>
      <pointLight position={[0, 1.8, 0.6]} color={accent} intensity={9} distance={7} decay={1.8} />
    </group>
  );
}

export function renderCoverObject(object: SceneObject): ReactNode {
  const def = coverObjectById(object.catalogId);
  switch (object.catalogId) {
    case "station_ammo":
      return <Station accent="#f5a623" />;
    case "station_gear":
      return <Station accent="#38e1ff" />;
    case "crate_metal":
    case "crate_amber":
      return <Crate color={def?.color ?? "#4a5566"} />;
    case "barrier_slab":
      return <Barrier />;
    case "pylon_beacon":
      return <Pylon />;
    case "wreck_hull":
      return <Wreck />;
    default:
      return undefined;
  }
}
