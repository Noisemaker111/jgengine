import type { ReactNode } from "react";

import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { DECOR_BY_ID, FURNITURE_BY_ID, type FurnitureDef } from "../objects/catalog";

export function renderObject(object: SceneObject): ReactNode {
  const furniture = FURNITURE_BY_ID[object.catalogId];
  if (furniture !== undefined) return <FurnitureMesh def={furniture} />;
  const decor = DECOR_BY_ID[object.catalogId];
  if (decor !== undefined) return <DecorMesh shape={decor.shape} color={decor.color} height={decor.height} />;
  return null;
}

function FurnitureMesh({ def }: { def: FurnitureDef }): ReactNode {
  const pad = (
    <mesh position={[0, 0.03, 0]} receiveShadow>
      <cylinderGeometry args={[Math.max(def.footprint.w, def.footprint.d) * 0.62, Math.max(def.footprint.w, def.footprint.d) * 0.66, 0.08, 20]} />
      <meshStandardMaterial color="#2c2740" roughness={0.9} />
    </mesh>
  );
  return (
    <group>
      {pad}
      {shapeFor(def)}
    </group>
  );
}

function shapeFor(def: FurnitureDef): ReactNode {
  const c = def.color;
  switch (def.shape) {
    case "font":
      return (
        <group>
          <mesh position={[0, def.height * 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.62, def.height * 0.8, 14]} />
            <meshStandardMaterial color={c} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0, def.height * 0.9, 0]}>
            <cylinderGeometry args={[0.78, 0.55, 0.4, 18]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.8} />
          </mesh>
        </group>
      );
    case "pod":
      return (
        <group>
          <mesh position={[0, def.height * 0.4, 0]} castShadow>
            <boxGeometry args={[def.footprint.w, def.height * 0.6, def.footprint.d]} />
            <meshStandardMaterial color={c} roughness={0.5} metalness={0.1} />
          </mesh>
          <mesh position={[0, def.height * 0.7, 0]}>
            <sphereGeometry args={[def.footprint.w * 0.44, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#e8f6ff" emissive={c} emissiveIntensity={0.6} transparent opacity={0.65} />
          </mesh>
        </group>
      );
    case "ring":
      return (
        <group>
          <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[def.footprint.w * 0.42, 0.2, 14, 30]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[def.footprint.w * 0.36, def.footprint.w * 0.4, 0.2, 28]} />
            <meshStandardMaterial color={c} roughness={0.7} metalness={0.1} />
          </mesh>
        </group>
      );
    case "arcade":
      return (
        <group>
          <mesh position={[0, def.height * 0.45, 0]} castShadow>
            <boxGeometry args={[1.2, def.height * 0.9, 1]} />
            <meshStandardMaterial color={c} roughness={0.4} metalness={0.15} />
          </mesh>
          <mesh position={[0, def.height * 0.6, 0.52]}>
            <planeGeometry args={[0.85, 1]} />
            <meshStandardMaterial color="#fff4ff" emissive={c} emissiveIntensity={1.1} />
          </mesh>
          <mesh position={[0, def.height * 0.95, 0]}>
            <boxGeometry args={[1.3, 0.12, 1.1]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} />
          </mesh>
        </group>
      );
    case "bloom":
      return (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.34, 0.6, 14]} />
            <meshStandardMaterial color="#5a4f72" roughness={0.8} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[Math.cos(i * 1.6) * 0.24, def.height * 0.68 + (i % 2) * 0.2, Math.sin(i * 1.6) * 0.24]}>
              <sphereGeometry args={[0.26, 12, 12]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.7} />
            </mesh>
          ))}
        </group>
      );
    case "console":
      return (
        <group>
          <mesh position={[0, def.height * 0.35, 0]} castShadow>
            <boxGeometry args={[def.footprint.w, def.height * 0.5, def.footprint.d]} />
            <meshStandardMaterial color={c} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0, def.height * 0.75, -0.05]} rotation={[-0.42, 0, 0]}>
            <planeGeometry args={[def.footprint.w * 0.85, 0.75]} />
            <meshStandardMaterial color="#fff8e0" emissive={c} emissiveIntensity={1} />
          </mesh>
        </group>
      );
  }
}

function DecorMesh({ shape, color, height }: { shape: string; color: string; height: number }): ReactNode {
  switch (shape) {
    case "pad":
      return (
        <group>
          <mesh position={[0, height * 0.5, 0]} receiveShadow>
            <cylinderGeometry args={[18.5, 19.4, height, 56]} />
            <meshStandardMaterial color="#7c7396" roughness={0.8} metalness={0.08} />
          </mesh>
          <mesh position={[0, height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[17.4, 18.5, 56]} />
            <meshStandardMaterial color="#d8b8f0" emissive="#d8b8f0" emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[10.4, 10.9, 56]} />
            <meshStandardMaterial color="#8f7bd6" emissive="#8f7bd6" emissiveIntensity={0.4} transparent opacity={0.7} />
          </mesh>
          <mesh position={[0, height + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[18.4, 56]} />
            <meshStandardMaterial color="#6a6088" roughness={0.9} />
          </mesh>
        </group>
      );
    case "spire":
      return (
        <mesh position={[0, height / 2, 0]} castShadow>
          <coneGeometry args={[0.8, height, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.5} />
        </mesh>
      );
    case "boulder":
      return (
        <mesh position={[0, height * 0.45, 0]} rotation={[0.3, 0.6, 0.2]} castShadow>
          <icosahedronGeometry args={[height * 0.72, 0]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
      );
    default:
      return (
        <group>
          <mesh position={[0, height * 0.4, 0]}>
            <cylinderGeometry args={[0.08, 0.1, height * 0.8, 6]} />
            <meshStandardMaterial color="#4a5a44" roughness={0.8} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, height * 0.75, 0]} rotation={[0.7, (i / 5) * Math.PI * 2, 0]}>
              <coneGeometry args={[0.12, height * 0.8, 4]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
            </mesh>
          ))}
        </group>
      );
  }
}
