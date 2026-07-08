import { Html, Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { WorldItemRenderConfig } from "@jgengine/core/game/playableGame";
import { resolveWorldItemPresentation } from "@jgengine/core/game/worldItem";
import { useGameContext } from "@jgengine/react/provider";
import { useWorldItems } from "@jgengine/react/hooks";
import { POINTER_ENTITY_KEY } from "../pointer/pointerService";

const DEFAULT_BEAM_HEIGHT = 2.5;
const FALLBACK_COLOR = "#e5e7eb";
const REST_HEIGHT = 0.32;
const SPAWN_DURATION = 0.4;

function WorldItemMarker({
  instanceId,
  position,
  color,
  beam,
  label,
  beamHeight,
}: {
  instanceId: string;
  position: readonly [number, number, number];
  color: string;
  beam: boolean;
  label: string | undefined;
  beamHeight: number;
}) {
  const beamPoints = useMemo(
    () =>
      [
        [0, 0, 0],
        [0, beamHeight, 0],
      ] as [number, number, number][],
    [beamHeight],
  );
  // Drop animation: the gem leaps up on spawn, settles, then idles with a slow
  // spin + hover so a fresh drop reads as "something just fell here". Age is
  // accumulated from frame deltas (Date.now is unavailable to keep runs pure).
  const gemRef = useRef<Group>(null);
  const ageRef = useRef(0);
  useFrame((_state, delta) => {
    const gem = gemRef.current;
    if (gem === null) return;
    const age = ageRef.current + delta;
    ageRef.current = age;
    const spawn = age < SPAWN_DURATION ? Math.sin((age / SPAWN_DURATION) * Math.PI) * 0.35 : 0;
    const bob = Math.sin(age * 2.2) * 0.06;
    gem.position.y = REST_HEIGHT + bob + spawn;
    gem.rotation.y = age * 1.6;
  });
  return (
    <group position={[position[0], position[1], position[2]]} userData={{ [POINTER_ENTITY_KEY]: instanceId }}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[0.26, 0.4, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <group ref={gemRef} position-y={REST_HEIGHT}>
        <mesh>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      </group>
      {beam ? <Line points={beamPoints} color={color} lineWidth={2} transparent opacity={0.55} /> : null}
      {label !== undefined && label.length > 0 ? (
        <Html position={[0, beamHeight + 0.2, 0]} center distanceFactor={12} zIndexRange={[15, 0]}>
          <div
            className="whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-bold shadow"
            style={{ borderColor: color, color, backgroundColor: "rgba(10,10,14,0.75)" }}
          >
            {label}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/** Rarity→beam/color/label render binding + loot-filter overlay (#32/#33) for every dropped `worldItem`. */
export function WorldItems({ config }: { config?: WorldItemRenderConfig }) {
  const ctx = useGameContext();
  const items = useWorldItems();
  const beamHeight = config?.beamHeight ?? DEFAULT_BEAM_HEIGHT;
  return (
    <>
      {items.map((item) => {
        const entity = ctx.scene.entity.get(item.instanceId);
        if (entity === null) return null;
        const presentation = resolveWorldItemPresentation(item, config?.rarityStyle, config?.filter);
        if (presentation.hidden) return null;
        return (
          <WorldItemMarker
            key={item.instanceId}
            instanceId={item.instanceId}
            position={entity.position}
            color={presentation.color ?? FALLBACK_COLOR}
            beam={presentation.beam}
            label={presentation.label}
            beamHeight={beamHeight}
          />
        );
      })}
    </>
  );
}
