import { normalizeEditorLayers, type EditorLayersInput } from "@jgengine/core/editor/index";
import { FLAT_FIELD } from "@jgengine/core/world/terrain";
import { AuthoredScene } from "@jgengine/shell/scene/AuthoredScene";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";
import sceneJson from "./decals.scene.json";

const decalDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

/**
 * Decal showcase: five `decal` markers authored in the scene document — dirt, cracks, blood and
 * paint on the floor, blood and paint standing on the back wall — rendered by the built-in decal
 * renderer with no game code. The wall and floor are the demo's environment, not decal geometry.
 */
function DecalStage() {
  return (
    <group>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 9, 7]} intensity={2.2} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#6b6f6a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3, -4]} receiveShadow>
        <boxGeometry args={[16, 6, 0.2]} />
        <meshStandardMaterial color="#8b8578" roughness={0.9} />
      </mesh>
      <AuthoredScene document={decalDocument} field={FLAT_FIELD} pathSurfaceDetail={false} />
    </group>
  );
}

export const decalShowcaseGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "decals" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  editorLayers: decalDocument,
  look: "flat",
  lighting: { ambient: { intensity: 0.5 }, directional: [{ intensity: 2.2, position: [5, 9, 7], color: "#fff2dd" }] },
  backdrop: { background: "#23282c" },
  postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: DecalStage,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
        Decals · authored markers · dirt, cracks, blood on the ground · paint and blood on the wall
      </div>
      <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>
        Procedural per-seed textures · ground decals drape the live terrain · wall decals stand on their authored tilt
      </div>
    </div>
  ),
  capture: {
    views: {
      floor: { look: "0,0,2", lookFrom: "9,4,0.2" },
      wall: { look: "0,2,-3.9", lookFrom: "8,2.2,0.05" },
    },
  },
};
