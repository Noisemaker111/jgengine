import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { Cave } from "../../engine-local/cave/Cave.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { artifactHere, cavesOf, type IslandCave } from "../caves";

/** Hard caves are lit a hotter colour, the rest by pale crystal. */
const GLOW = { soft: "#7fd6ff", hard: "#ff7a3c" };

/** The Island's caves: the rock, glowing crystals down the tunnel and the artifact on its pedestal in each chamber. */
export function Caves({ ctx }: WorldOverlayProps): ReactNode {
  const ground = ctx.world.groundHeightAt;
  // The caves are laid out once per world; only their artifacts come and go, and those draw themselves.
  const caves = cavesOf(ctx);
  const lights = useMemo(
    () =>
      caves.map((cave) => ({
        id: cave.id,
        spots: cave.layout.spots.map((spot) => [spot[0], ground(spot[0], spot[1]) + 0.3, spot[1]] as const),
        pedestal: [cave.layout.chamber.center[0], ground(cave.layout.chamber.center[0], cave.layout.chamber.center[1]), cave.layout.chamber.center[1]] as const,
        glow: cave.hard ? GLOW.hard : GLOW.soft,
      })),
    [caves, ground],
  );
  return (
    <>
      {caves.map((cave, index) => {
        const lit = lights[index]!;
        return (
          <group key={cave.id}>
            <Cave layout={cave.layout} ground={ground} />
            {lit.spots.slice(0, -1).map((spot, k) => (
              // Glowing crystal clusters on the walls light the way; no real lights, so the scene's shaders never change.
              <mesh key={k} position={[spot[0], spot[1], spot[2]]} rotation={[k, k * 1.7, 0.4]}>
                <octahedronGeometry args={[0.35, 0]} />
                <meshStandardMaterial color={lit.glow} emissive={lit.glow} emissiveIntensity={3} toneMapped={false} />
              </mesh>
            ))}
            <group position={[lit.pedestal[0], lit.pedestal[1], lit.pedestal[2]]}>
              <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.7, 0.9, 1, 8]} />
                <meshStandardMaterial color="#4a4038" roughness={0.9} flatShading />
              </mesh>
              <Artifact ctx={ctx} cave={cave} />
            </group>
          </group>
        );
      })}
    </>
  );
}

/** The artifact: a gold gem turning over its pedestal, there only while nobody has taken it. */
function Artifact({ ctx, cave }: { ctx: GameContext; cave: IslandCave }): ReactNode {
  const gem = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const mesh = gem.current;
    if (mesh === null) return;
    mesh.visible = artifactHere(ctx, cave);
    mesh.rotation.y += delta * 0.8;
  });
  return (
    <mesh ref={gem} position={[0, 1.55, 0]} rotation={[0.35, 0, 0.2]}>
      <icosahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color="#ffcf4a" emissive="#ffb000" emissiveIntensity={2} metalness={0.6} roughness={0.25} toneMapped={false} flatShading />
    </mesh>
  );
}
