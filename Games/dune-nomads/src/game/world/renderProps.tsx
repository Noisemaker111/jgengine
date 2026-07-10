import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { OASIS_GREEN, SHADOW_OCHRE } from "../palette";

function PalmMesh() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]} rotation={[0, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.08, 0.14, 2.2, 6]} />
        <meshStandardMaterial color="#7a5a34" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh
          key={index}
          position={[0, 2.2, 0]}
          rotation={[0.55, (index * Math.PI * 2) / 5, 0]}
          castShadow
        >
          <coneGeometry args={[0.16, 1.4, 4]} />
          <meshStandardMaterial color={OASIS_GREEN} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function StandingStoneMesh() {
  return (
    <mesh position={[0, 1, 0]} rotation={[0.05, 0.3, 0.02]} castShadow>
      <boxGeometry args={[0.6, 2.2, 0.4]} />
      <meshStandardMaterial color={SHADOW_OCHRE} roughness={0.9} />
    </mesh>
  );
}

function BonesMesh() {
  return (
    <group position={[0, 0.12, 0]}>
      <mesh rotation={[0, 0.4, 0]} castShadow>
        <torusGeometry args={[0.35, 0.06, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#e8dcc0" roughness={0.6} />
      </mesh>
      <mesh position={[0.5, -0.05, 0.1]} rotation={[0, 0.9, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.7, 6]} />
        <meshStandardMaterial color="#e8dcc0" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function renderDuneObject(object: SceneObject) {
  if (object.catalogId === "palm") return <PalmMesh />;
  if (object.catalogId === "standing-stone") return <StandingStoneMesh />;
  if (object.catalogId === "bones") return <BonesMesh />;
  return null;
}
