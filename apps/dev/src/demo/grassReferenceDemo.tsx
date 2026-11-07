import { useMemo } from "react";

import { readGrassLook } from "@jgengine/core/grass/grassKind";
import type { PlayableGame } from "@jgengine/shell/registry";
import { GrassPatch } from "@jgengine/core/grass/GrassPatch.draw";

import { demoGame } from "./demoGame";
import { GRASS_REFERENCE_PATCH, GRASS_REFERENCE_PHOTOS, grassReferenceCentre, grassReferenceView } from "./grassReference";

const GROUND = "#4a3f30";

function GrassReferences() {
  // The page's `?realism=` (the board's `--realism`) reaches these looks through readGrassLook.
  const patches = useMemo(() => GRASS_REFERENCE_PHOTOS.map((photo, index) => ({ photo, centre: grassReferenceCentre(index), look: readGrassLook({ species: photo.species, seed: photo.id }) })), []);
  const area = useMemo(() => [GRASS_REFERENCE_PATCH, GRASS_REFERENCE_PATCH] as const, []);
  return (
    <group>
      {patches.map(({ photo, centre, look }) => (
        <group key={photo.id}>
          <mesh rotation-x={-Math.PI / 2} position={[centre[0], -0.002, centre[1]]} receiveShadow>
            <planeGeometry args={[GRASS_REFERENCE_PATCH + 60, GRASS_REFERENCE_PATCH + 60]} />
            <meshStandardMaterial color={GROUND} roughness={1} />
          </mesh>
          <GrassPatch position={[centre[0], 0, centre[1]]} look={look} area={area} groundColor={GROUND} />
        </group>
      ))}
    </group>
  );
}

/** One large patch per reference photo, each with a `ref-<id>` capture view framed like the photo. */
export const grassReferenceGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "grass-reference" },
  scene: {
    renderEntity: () => <group />,
    renderObject: () => <group />,
    environment: () => <GrassReferences />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  // A frog's-eye lawn shot sits centimetres off the turf, and a standing view reaches the patch's far edge.
  camera: { ...demoGame.camera, lens: { ...demoGame.camera?.lens, frustum: { near: 0.01, far: 800 } } },
  rendering: {
    lighting: { ambient: { intensity: 0.55 }, directional: [{ intensity: 2.6, position: [30, 40, 20], color: "#fff1dc" }] },
    backdrop: { background: "#9cc0dc" },
  },
  GameUI: () => null,
  capture: {
    views: Object.fromEntries(GRASS_REFERENCE_PHOTOS.map((photo, index) => [`ref-${photo.id}`, grassReferenceView(index)])),
  },
};
