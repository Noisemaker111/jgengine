import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { Outline } from "./renderEntity";

function PalmTree() {
  return (
    <group position={[0, -0.5, 0]}>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.1, 0.3, 1.1]} />
        <meshToonMaterial color="#c9b48a" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.sin(i * 0.5) * 0.14, 0.7 + i * 0.85, 0]} rotation={[0, 0, Math.sin(i) * 0.08]}>
          <cylinderGeometry args={[0.14 - i * 0.015, 0.17 - i * 0.015, 0.95, 8]} />
          <meshToonMaterial color="#9a7648" />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={`frond-${i}`}
            position={[Math.sin(angle) * 0.9, 4.15, Math.cos(angle) * 0.9]}
            rotation={[Math.cos(angle) * 0.55, angle, Math.sin(angle) * -0.55]}
          >
            <boxGeometry args={[0.45, 0.06, 2.1]} />
            <meshToonMaterial color="#3f8f46" />
          </mesh>
        );
      })}
      <mesh position={[0, 4.1, 0]}>
        <sphereGeometry args={[0.24, 8, 8]} />
        <meshToonMaterial color="#6b4d2a" />
      </mesh>
    </group>
  );
}

function Streetlight() {
  return (
    <group position={[0, -2, 0]}>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 4.4, 8]} />
        <meshToonMaterial color="#2b2f38" />
      </mesh>
      <mesh position={[0.55, 4.35, 0]}>
        <boxGeometry args={[1.2, 0.1, 0.1]} />
        <meshToonMaterial color="#2b2f38" />
      </mesh>
      <mesh position={[1.1, 4.22, 0]}>
        <boxGeometry args={[0.5, 0.16, 0.3]} />
        <meshToonMaterial color="#ffe9b0" emissive="#ffe9b0" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function GunshopSign() {
  return (
    <group>
      <Outline w={2.6} h={1.1} d={0.3} />
      <mesh castShadow>
        <boxGeometry args={[2.6, 1.1, 0.3]} />
        <meshToonMaterial color="#1b1e26" />
      </mesh>
      <mesh position={[0, 0, 0.17]}>
        <boxGeometry args={[2.3, 0.7, 0.05]} />
        <meshToonMaterial color="#ffb020" emissive="#ffb020" emissiveIntensity={1.8} />
      </mesh>
      <mesh position={[0, -0.75, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 6]} />
        <meshToonMaterial color="#2b2f38" />
      </mesh>
    </group>
  );
}

function DockCrate() {
  return (
    <group>
      <Outline w={0.98} h={0.98} d={0.98} />
      <mesh castShadow>
        <boxGeometry args={[0.98, 0.98, 0.98]} />
        <meshToonMaterial color="#a8703f" />
      </mesh>
      {[-0.36, 0.36].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[1.02, 0.12, 1.02]} />
          <meshToonMaterial color="#5f3d20" />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.14, 1.02, 1.02]} />
        <meshToonMaterial color="#5f3d20" />
      </mesh>
    </group>
  );
}

export function renderObject(object: SceneObject): ReactNode {
  switch (object.catalogId) {
    case "obj_palm_planter":
      return <PalmTree />;
    case "obj_streetlight":
      return <Streetlight />;
    case "obj_gunshop_sign":
      return <GunshopSign />;
    case "obj_crate_dock":
      return <DockCrate />;
    default:
      return undefined;
  }
}
