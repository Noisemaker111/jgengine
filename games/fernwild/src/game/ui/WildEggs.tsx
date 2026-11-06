import { useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { eggsOnGround } from "../eggs";

/** Egg size by its item id: an extra-small dodo egg to an extra-large one. */
const SIZE: Readonly<Record<string, number>> = { egg_xs: 0.09, egg_s: 0.12, egg_m: 0.16, egg_l: 0.21, egg_xl: 0.28 };

/** Wild eggs lying where their mothers left them: pale speckled ovals on the ground. */
export function WildEggs({ ctx }: WorldOverlayProps): ReactNode {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const drawn = useRef("");
  useFrame(() => {
    const key = eggsOnGround(ctx).map((egg) => egg.id).join(",");
    if (key !== drawn.current) {
      drawn.current = key;
      redraw();
    }
  });
  return (
    <>
      {eggsOnGround(ctx).map((egg) => {
        const r = SIZE[egg.item] ?? 0.15;
        return (
          <mesh key={egg.id} position={[egg.at[0], egg.at[1] + r * 1.2, egg.at[2]]} scale={[1, 1.3, 1]} castShadow>
            <sphereGeometry args={[r, 14, 10]} />
            <meshStandardMaterial color="#efe6cf" roughness={0.7} />
          </mesh>
        );
      })}
    </>
  );
}
