import type { PadEnvironmentDescriptor } from "@jgengine/core/world/features";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { PAD_THICKNESS, resolvePadMeshY, resolvePadShape } from "./groundPadMath";

export interface GroundPadProps {
  pad: PadEnvironmentDescriptor;
  field: TerrainField;
}

export function GroundPad({ pad, field }: GroundPadProps) {
  const [x, z] = pad.center;
  const groundHeight = field.sampleHeight(x, z);
  const meshY = resolvePadMeshY(groundHeight, pad);
  const shape = resolvePadShape(pad.size);

  if (shape.circular) {
    return (
      <mesh position={[x, meshY, z]} receiveShadow>
        <cylinderGeometry args={[shape.radius, shape.radius, PAD_THICKNESS, 32]} />
        <meshStandardMaterial color={pad.color} roughness={0.9} />
      </mesh>
    );
  }

  return (
    <mesh position={[x, meshY, z]} rotation={[0, pad.rotationY ?? 0, 0]} receiveShadow>
      <boxGeometry args={[shape.width, PAD_THICKNESS, shape.depth]} />
      <meshStandardMaterial color={pad.color} roughness={0.9} />
    </mesh>
  );
}
