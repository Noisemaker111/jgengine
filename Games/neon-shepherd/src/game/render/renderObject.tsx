import type { ReactNode } from "react";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { PROP_TYPES, type PropTypeId } from "../objects/catalog";

export function renderObject(object: SceneObject): ReactNode {
  const type = PROP_TYPES[object.catalogId as PropTypeId];
  if (type === undefined) return null;

  switch (type.id) {
    case "streetlight":
      return (
        <group>
          <mesh position-y={1.6}>
            <cylinderGeometry args={[0.06, 0.08, 3.2, 8]} />
            <meshStandardMaterial color={type.color} />
          </mesh>
          <mesh position-y={3.2}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshStandardMaterial color={type.glow} emissive={type.glow} emissiveIntensity={1.2} />
          </mesh>
        </group>
      );
    case "sanctuaryLantern":
      return (
        <group>
          <mesh position-y={0.9}>
            <cylinderGeometry args={[0.14, 0.18, 1.8, 8]} />
            <meshStandardMaterial color={type.color} />
          </mesh>
          <mesh position-y={1.85}>
            <icosahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color={type.glow} emissive={type.glow} emissiveIntensity={1.4} transparent opacity={0.9} />
          </mesh>
        </group>
      );
    case "parkedCar":
      return (
        <mesh position-y={0.42}>
          <boxGeometry args={[1.5, 0.7, 3]} />
          <meshStandardMaterial color={type.color} roughness={0.6} />
        </mesh>
      );
    case "bench":
      return (
        <mesh position-y={0.28}>
          <boxGeometry args={[1.6, 0.5, 0.5]} />
          <meshStandardMaterial color={type.color} roughness={0.9} />
        </mesh>
      );
    case "planter":
      return (
        <group>
          <mesh position-y={0.25}>
            <boxGeometry args={[0.8, 0.5, 0.8]} />
            <meshStandardMaterial color={type.color} />
          </mesh>
          <mesh position-y={0.65}>
            <coneGeometry args={[0.3, 0.5, 6]} />
            <meshStandardMaterial color="#3a6b45" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}
