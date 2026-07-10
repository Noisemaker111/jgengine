import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { FLARE_OBJECT, PINE_OBJECTS, RIDGE_OBJECT, TENT_OBJECTS } from "../objects/catalog";

const PINE_SCALE: Record<string, number> = { [PINE_OBJECTS[0]!]: 0.75, [PINE_OBJECTS[1]!]: 1, [PINE_OBJECTS[2]!]: 1.35 };

function PineMesh({ scale }: { scale: number }) {
  return (
    <group scale={scale}>
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.5, 6]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.9} />
      </mesh>
      <mesh position-y={1.15} castShadow>
        <coneGeometry args={[0.9, 1.5, 8]} />
        <meshStandardMaterial color="#1f4d3d" roughness={0.8} />
      </mesh>
      <mesh position-y={1.75} castShadow>
        <coneGeometry args={[0.65, 1.1, 8]} />
        <meshStandardMaterial color="#2c6650" roughness={0.8} />
      </mesh>
      <mesh position-y={2.2} castShadow>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshStandardMaterial color="#f1faee" roughness={0.6} />
      </mesh>
    </group>
  );
}

function TentMesh({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position-y={0.9} rotation={[0, 0, Math.PI / 2]} castShadow>
        <coneGeometry args={[1.3, 3, 4]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, 1.5]}>
        <boxGeometry args={[0.6, 0.06, 0.06]} />
        <meshStandardMaterial color="#0d1b2a" />
      </mesh>
    </group>
  );
}

function FlareDrum() {
  return (
    <group>
      <mesh position-y={0.5} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 1, 10]} />
        <meshStandardMaterial color="#e63946" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position-y={1.15}>
        <coneGeometry args={[0.22, 0.5, 8]} />
        <meshStandardMaterial color="#ffb703" emissive="#e63946" emissiveIntensity={2.2} />
      </mesh>
      <pointLight position={[0, 1.3, 0]} color="#e63946" intensity={3} distance={9} />
    </group>
  );
}

function RidgeMarker() {
  return (
    <mesh position-y={0.2} castShadow>
      <boxGeometry args={[0.6, 0.4, 0.6]} />
      <meshStandardMaterial color="#f1faee" roughness={0.95} />
    </mesh>
  );
}

export function renderProp(object: SceneObject) {
  if ((PINE_OBJECTS as readonly string[]).includes(object.catalogId)) {
    return <PineMesh scale={PINE_SCALE[object.catalogId] ?? 1} />;
  }
  if (object.catalogId === TENT_OBJECTS[0]) return <TentMesh accent="#a8dadc" />;
  if (object.catalogId === TENT_OBJECTS[1]) return <TentMesh accent="#f1faee" />;
  if (object.catalogId === FLARE_OBJECT) return <FlareDrum />;
  if (object.catalogId === RIDGE_OBJECT) return <RidgeMarker />;
  return null;
}
