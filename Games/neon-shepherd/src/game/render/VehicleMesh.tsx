import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { VEHICLE_TYPES, type VehicleTypeId } from "../vehicles/catalog";

export function VehicleMesh({ entity }: { entity: SceneEntity }): React.ReactNode {
  const def = VEHICLE_TYPES[entity.name as VehicleTypeId];
  if (def === undefined) return null;
  return (
    <group>
      <mesh position-y={def.height / 2}>
        <boxGeometry args={[def.width, def.height, def.length]} />
        <meshStandardMaterial color={def.color} emissive={def.glow} emissiveIntensity={0.35} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, def.height * 0.55, def.length / 2 - 0.04]}>
        <boxGeometry args={[def.width * 0.75, def.height * 0.16, 0.06]} />
        <meshBasicMaterial color={def.glow} />
      </mesh>
    </group>
  );
}
