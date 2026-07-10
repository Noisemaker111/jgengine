import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { GLIDER_GHOST_ENTITY, GLIDER_PACER_ENTITY, GLIDER_PLAYER_ENTITY } from "../entities/gliders/catalog";
import { PALETTE } from "../objects/styles";

interface GliderLivery {
  fuselage: string;
  accent: string;
  glow: string;
  ghost?: boolean;
}

const PLAYER_LIVERY: GliderLivery = { fuselage: PALETTE.cloudWhite, accent: PALETTE.windsockOrange, glow: PALETTE.skyTeal };
const PACER_LIVERY: GliderLivery = { fuselage: PALETTE.citySlate, accent: PALETTE.shadowBlue, glow: PALETTE.windsockOrange };
const GHOST_LIVERY: GliderLivery = { fuselage: PALETTE.skyTeal, accent: PALETTE.cloudWhite, glow: PALETTE.skyTeal, ghost: true };

const LIVERY_BY_ENTITY: Record<string, GliderLivery> = {
  [GLIDER_PLAYER_ENTITY]: PLAYER_LIVERY,
  [GLIDER_PACER_ENTITY]: PACER_LIVERY,
  [GLIDER_GHOST_ENTITY]: GHOST_LIVERY,
};

function GliderMesh({ livery }: { livery: GliderLivery }) {
  const ghost = livery.ghost === true;
  const opacity = ghost ? 0.35 : 1;
  const solid = !ghost;
  return (
    <group>
      <mesh castShadow={solid}>
        <boxGeometry args={[0.9, 0.6, 3.4]} />
        <meshStandardMaterial color={livery.fuselage} roughness={0.35} metalness={0.3} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.1, 0.3]} castShadow={solid}>
        <boxGeometry args={[4.6, 0.15, 1.2]} />
        <meshStandardMaterial color={livery.fuselage} roughness={0.3} metalness={0.35} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.15, 0.3]}>
        <boxGeometry args={[4.6, 0.04, 1.2]} />
        <meshStandardMaterial color={livery.accent} roughness={0.4} metalness={0.2} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.55, -1.3]} castShadow={solid}>
        <boxGeometry args={[0.1, 0.9, 0.9]} />
        <meshStandardMaterial color={livery.accent} roughness={0.4} metalness={0.3} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.32, 0.9]}>
        <boxGeometry args={[0.55, 0.32, 0.9]} />
        <meshPhysicalMaterial color="#0d1b2a" roughness={0.05} metalness={0.1} transparent opacity={ghost ? 0.3 : 0.7} />
      </mesh>
      <mesh position={[0, 0, -1.72]}>
        <boxGeometry args={[0.5, 0.3, 0.1]} />
        <meshStandardMaterial color={livery.glow} emissive={livery.glow} emissiveIntensity={ghost ? 1.2 : 2} transparent={ghost} opacity={ghost ? 0.6 : 1} />
      </mesh>
    </group>
  );
}

export function renderGlider(entity: SceneEntity) {
  const livery = LIVERY_BY_ENTITY[entity.name];
  return livery === undefined ? null : <GliderMesh livery={livery} />;
}
