import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { PALETTE } from "../tuning";
import { runnerById } from "./catalog";

export function renderRunner(entity: SceneEntity): ReactNode {
  const runner = runnerById(entity.name);
  if (runner === undefined) return null;
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.85, 4, 8]} />
        <meshStandardMaterial color={runner.jersey} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color={PALETTE.concrete} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.28, 0.17]}>
        <boxGeometry args={[0.48, 0.1, 0.05]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
    </group>
  );
}
