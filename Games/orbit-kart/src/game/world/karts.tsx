import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameStore } from "@jgengine/react/hooks";
import { RIVAL_KART_ENTITY, PLAYER_KART_ENTITY } from "../entities/karts/catalog";
import { RIVALS } from "../ai/rivals";
import { PALETTE } from "../theme";
import { readSnapshot } from "../race/sessionStore";

interface KartLivery {
  hull: string;
  glow: string;
}

const PLAYER_LIVERY: KartLivery = { hull: PALETTE.starlight, glow: PALETTE.boostTangerine };
const LIVERY_BY_ENTITY: Readonly<Record<string, KartLivery>> = {
  [PLAYER_KART_ENTITY]: PLAYER_LIVERY,
  ...Object.fromEntries(RIVALS.map((rival) => [RIVAL_KART_ENTITY[rival.id]!, { hull: rival.color, glow: PALETTE.starlight }])),
};

function KartHull({ livery }: { livery: KartLivery }) {
  return (
    <group>
      <mesh position-y={0.5} castShadow>
        <coneGeometry args={[0.55, 1.9, 4]} />
        <meshStandardMaterial color={livery.hull} roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.5, 0.15]} rotation={[Math.PI, 0, Math.PI / 4]}>
        <boxGeometry args={[1.15, 0.12, 0.7]} />
        <meshStandardMaterial color={livery.hull} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.42, -0.75]}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshStandardMaterial color={livery.glow} emissive={livery.glow} emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}

function SlingshotArc({ charge, inWindow }: { charge: number; inWindow: number }) {
  if (charge <= 0.02) return null;
  const color = inWindow > 0 ? PALETTE.boostTangerine : PALETTE.planetMint;
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position-y={0.05}>
      <ringGeometry args={[1.3, 1.5, 32, 1, 0, Math.PI * 2 * charge]} />
      <meshBasicMaterial color={color} transparent opacity={inWindow > 0 ? 0.95 : 0.65} side={2} />
    </mesh>
  );
}

function KartMesh({ entity }: { entity: SceneEntity }) {
  const livery = LIVERY_BY_ENTITY[entity.name];
  const kart = useGameStore((ctx) => readSnapshot(ctx)?.karts[entity.id]);
  if (livery === undefined) return null;
  return (
    <group>
      <KartHull livery={livery} />
      <SlingshotArc charge={kart?.wellCharge ?? 0} inWindow={kart?.inWindow === true ? 1 : 0} />
    </group>
  );
}

export function renderKart(entity: SceneEntity) {
  return <KartMesh entity={entity} />;
}
