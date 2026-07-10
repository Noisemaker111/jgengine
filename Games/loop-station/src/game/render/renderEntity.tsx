import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { GHOST_ENTITY, GHOST_ENTITY_FADED, RUNNER_ENTITY, lapIndexFromGhostId } from "../entities/catalog";
import { ghostColor, PAPER_WHITE } from "../track/palette";

function Wedge({ color, opacity, emissiveIntensity }: { color: string; opacity: number; emissiveIntensity: number }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <coneGeometry args={[0.55, 1.2, 4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          transparent={opacity < 1}
          opacity={opacity}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.7, 0.36, 1.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity * 0.6}
          transparent={opacity < 1}
          opacity={opacity}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

export function renderRunnerEntity(entity: SceneEntity) {
  if (entity.name === RUNNER_ENTITY) {
    return <Wedge color={PAPER_WHITE} opacity={1} emissiveIntensity={0.9} />;
  }
  if (entity.name === GHOST_ENTITY || entity.name === GHOST_ENTITY_FADED) {
    const lapIndex = lapIndexFromGhostId(entity.id);
    const color = ghostColor(lapIndex);
    const faded = entity.name === GHOST_ENTITY_FADED;
    return <Wedge color={color} opacity={faded ? 0.28 : 0.92} emissiveIntensity={faded ? 0.25 : 1.1} />;
  }
  return null;
}
