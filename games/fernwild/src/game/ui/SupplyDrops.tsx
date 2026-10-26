import { useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { LightBeam } from "@jgengine/core/map/LightBeam.draw";

import { supplyDrops } from "../supplyDrops";

/** Tall enough to see over the redwoods from across the island, the way ARK's beams are. */
const BEAM_HEIGHT = 220;

/**
 * Supply crates: a banded metal crate under a canopy while it falls, set down on the ground once landed, and a beam of
 * its tier's colour rising from it to find it by.
 */
export function SupplyDrops({ ctx }: WorldOverlayProps): ReactNode {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const drawn = useRef("");
  const groups = useRef(new Map<string, Group>());
  useFrame(() => {
    const drops = supplyDrops(ctx);
    const key = drops.map((drop) => `${drop.id}:${drop.landed}`).join(",");
    if (key !== drawn.current) {
      drawn.current = key;
      redraw();
    }
    // A falling crate moves every frame; move its group rather than redraw.
    for (const drop of drops) groups.current.get(drop.id)?.position.set(drop.position[0], drop.position[1], drop.position[2]);
  });
  return (
    <>
      {supplyDrops(ctx).map((drop) => (
        <group
          key={drop.id}
          ref={(group) => {
            if (group === null) groups.current.delete(drop.id);
            else groups.current.set(drop.id, group);
          }}
          position={drop.position}
        >
          <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 1.2, 1.4]} />
            <meshStandardMaterial color="#8d949c" roughness={0.6} metalness={0} />
          </mesh>
          {[0.25, 0.95].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[1.46, 0.14, 1.46]} />
              <meshStandardMaterial color={drop.color} emissive={drop.color} emissiveIntensity={0.6} roughness={0.5} />
            </mesh>
          ))}
          {drop.landed ? null : (
            <mesh position={[0, 4.2, 0]}>
              <sphereGeometry args={[2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={drop.color} roughness={0.9} side={2} />
            </mesh>
          )}
          <LightBeam height={BEAM_HEIGHT} radius={0.45} color={drop.color} opacity={0.4} />
        </group>
      ))}
    </>
  );
}
