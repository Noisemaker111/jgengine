import type { ReactNode } from "react";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameStore } from "@jgengine/react/hooks";
import { ROOMS } from "../mansion/floorPlan";
import { GUARD_CATALOG_KIND, GUARD_DEFS } from "../entities/guards";
import { PLAYER_CATALOG_KIND } from "../entities/player";
import { guardPhaseAt } from "../schedule/guardSchedule";
import { elapsedSecondsFor, type HeistState } from "../state/heistState";
import { PALETTE } from "../ui/palette";

const FLOOR_COLOR = PALETTE.midnightBlue;
const CEIL_COLOR = "#0f1830";
const ROOM_HALF_SPAN = 4.9;

export function MansionEnvironment(): ReactNode {
  return (
    <group>
      <color attach="background" args={[PALETTE.midnightBlue]} />
      <fog attach="fog" args={[PALETTE.midnightBlue, 18, 60]} />
      <ambientLight color={PALETTE.candlelight} intensity={0.22} />
      <hemisphereLight args={[PALETTE.midnightBlue, PALETTE.mahogany, 0.25]} />
      {ROOMS.map((room) => (
        <group key={room.id}>
          <mesh rotation-x={-Math.PI / 2} position={[room.center[0], -0.02, room.center[1]]} receiveShadow>
            <planeGeometry args={[ROOM_HALF_SPAN * 2, ROOM_HALF_SPAN * 2]} />
            <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh rotation-x={Math.PI / 2} position={[room.center[0], 3, room.center[1]]}>
            <planeGeometry args={[ROOM_HALF_SPAN * 2, ROOM_HALF_SPAN * 2]} />
            <meshStandardMaterial color={CEIL_COLOR} roughness={1} />
          </mesh>
          <pointLight
            position={[room.center[0], 2.4, room.center[1]]}
            color={PALETTE.candlelight}
            intensity={2.4}
            distance={9}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}

function CloakedFigure({ bodyColor, glowColor }: { bodyColor: string; glowColor: string }): ReactNode {
  return (
    <group>
      <mesh position-y={0.55}>
        <cylinderGeometry args={[0.32, 0.42, 1.1, 10]} />
        <meshStandardMaterial color={bodyColor} roughness={0.85} />
      </mesh>
      <mesh position-y={1.28}>
        <coneGeometry args={[0.3, 0.5, 10]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      <pointLight position={[0, 0.9, 0.28]} color={glowColor} intensity={1.1} distance={2.6} decay={2.4} />
    </group>
  );
}

function GuardDial({ entityId }: { entityId: string }): ReactNode {
  const guard = GUARD_DEFS.find((entry) => entry.id === entityId);
  const ref = useRef<Group>(null);
  const phase = useGameStore((ctx) => {
    if (guard === undefined) return 0;
    const heist = ctx.game.store.get("heist") as HeistState | undefined;
    if (heist === undefined) return 0;
    return guardPhaseAt(guard, elapsedSecondsFor(heist, ctx.time.now()));
  });
  useFrame(() => {
    if (ref.current !== null) ref.current.rotation.y = phase * Math.PI * 2;
  });
  if (guard === undefined) return null;
  return (
    <group position-y={1.75}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.22, 0.02, 8, 24]} />
        <meshStandardMaterial color={PALETTE.brass} emissive={PALETTE.brass} emissiveIntensity={0.4} />
      </mesh>
      <group ref={ref}>
        <mesh position={[0, 0, 0.22]}>
          <boxGeometry args={[0.04, 0.04, 0.06]} />
          <meshStandardMaterial color={PALETTE.candlelight} emissive={PALETTE.candlelight} emissiveIntensity={0.8} />
        </mesh>
      </group>
    </group>
  );
}

export function renderMansionEntity(entity: SceneEntity): ReactNode {
  if (entity.name === PLAYER_CATALOG_KIND) {
    return <CloakedFigure bodyColor={PALETTE.mahogany} glowColor={PALETTE.candlelight} />;
  }
  if (entity.name === GUARD_CATALOG_KIND) {
    return (
      <group>
        <CloakedFigure bodyColor={PALETTE.velvetRed} glowColor={PALETTE.brass} />
        <GuardDial entityId={entity.id} />
      </group>
    );
  }
  return null;
}
