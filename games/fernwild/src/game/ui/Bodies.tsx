import { useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending } from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { bodies } from "../deathBody";

/** How tall the beam over a body rises, so it shows over the trees from far off. */
const BEAM_HEIGHT = 80;

/** Fallen survivors' bodies: a bundle where they fell and a pale beam of light above it to find it by. */
export function Bodies({ ctx }: WorldOverlayProps): ReactNode {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const drawn = useRef("");
  // Bodies come and go rarely; redraw only when the set changes.
  useFrame(() => {
    const key = bodies(ctx)
      .map((body) => body.id)
      .join(",");
    if (key !== drawn.current) {
      drawn.current = key;
      redraw();
    }
  });
  return (
    <>
      {bodies(ctx).map((body) => (
        <group key={body.id} position={[body.at[0], body.at[1], body.at[2]]}>
          <mesh position={[0, 0.25, 0]} scale={[1, 0.55, 0.8]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#6b4a2f" roughness={0.95} flatShading />
          </mesh>
          <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[0.25, 0.25, BEAM_HEIGHT, 10, 1, true]} />
            <meshBasicMaterial color="#cfe8ff" transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
