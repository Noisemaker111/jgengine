import type { PadEnvironmentDescriptor } from "@jgengine/core/world/features";
import type { TerrainField } from "@jgengine/core/terrain/terrain";

import { PAD_THICKNESS, resolvePadMeshY, resolvePadShape } from "./groundPadMath";

/** Props for {@link GroundPad}: the pad descriptor and the terrain field it sits on. */
export interface GroundPadProps {
  pad: PadEnvironmentDescriptor;
  field: TerrainField;
}

/** A flat circular or rectangular pad resting on a terrain field. */
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
