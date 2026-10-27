import { useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { eggs } from "../breeding";
import { speciesDef } from "../data/species";

/** A fertilized egg's size by its kind: a dodo's fits a hand, a bronto's is a boulder (approximate). */
function eggSize(species: string): number {
  return 0.18 + Math.min(0.5, (speciesDef(species)?.radius ?? 0.5) * 0.12);
}

/** Fertilized eggs where they were laid: pale and speckled, a faint warm glow while they incubate. */
export function Eggs({ ctx }: WorldOverlayProps): ReactNode {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const drawn = useRef("");
  useFrame(() => {
    const key = eggs(ctx)
      .map((egg) => egg.id)
      .join(",");
    if (key !== drawn.current) {
      drawn.current = key;
      redraw();
    }
  });
  return (
    <>
      {eggs(ctx).map((egg) => {
        const size = eggSize(egg.species);
        return (
          <group key={egg.id} position={[egg.at[0], egg.at[1], egg.at[2]]}>
            <mesh position={[0, size * 1.25, 0]} scale={[size, size * 1.3, size]} castShadow receiveShadow>
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial color="#efe6cf" roughness={0.7} emissive="#ffb35c" emissiveIntensity={0.12} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
