import { useMemo, type ReactNode } from "react";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../../editorLayers";

/** Glow colour of each obelisk by its `meta.color`. */
const GLOW: Record<string, string> = { red: "#ff3b30", green: "#34ff6a", blue: "#3b8cff" };
/** ARK's obelisks tower over the island; at the map's 3/8 scale they still stand this tall. */
const HEIGHT = 60;
const WIDTH = 7;
/** They hover clear of the ground they mark. */
const HOVER = 14;

/** The three obelisks (`obelisk` markers in editor.scene.json): dark floating spires banded with their colour. */
export function Obelisks({ ctx }: WorldOverlayProps): ReactNode {
  const spires = useMemo(
    () =>
      markersOfKind(editorLayers, "obelisk").map((marker) => ({
        id: marker.id,
        at: [marker.position.x, ctx.world.groundHeightAt(marker.position.x, marker.position.z) + HOVER, marker.position.z] as const,
        glow: GLOW[String(marker.meta?.["color"])] ?? "#ffffff",
      })),
    [ctx],
  );
  return (
    <>
      {spires.map((spire) => (
        <group key={spire.id} position={[spire.at[0], spire.at[1], spire.at[2]]}>
          <mesh position={[0, HEIGHT / 2, 0]}>
            <boxGeometry args={[WIDTH, HEIGHT, WIDTH * 0.7]} />
            <meshStandardMaterial color="#1c1f26" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, HEIGHT / 2, 0]}>
            <boxGeometry args={[WIDTH * 0.25, HEIGHT * 0.92, WIDTH * 0.72]} />
            <meshStandardMaterial color={spire.glow} emissive={spire.glow} emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
          <mesh position={[0, -1.5, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[WIDTH * 0.55, 4, 4]} />
            <meshStandardMaterial color="#1c1f26" metalness={0.6} roughness={0.35} />
          </mesh>
          <pointLight position={[0, -4, 0]} color={spire.glow} intensity={400} distance={60} />
        </group>
      ))}
    </>
  );
}
