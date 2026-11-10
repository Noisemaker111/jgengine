/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { StageDraw } from "@jgengine/core/stage/stageDraw.draw";
import { normalizeEditorLayers, type EditorLayersInput } from "@jgengine/core/editor/index";
import { FLAT_FIELD } from "@jgengine/core/terrain/terrain";
import { AuthoredScene } from "@jgengine/core/scene/AuthoredScene.draw";
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
  const stage = useMemo(() => {
    const root = new Group();
    const floorGeo = new PlaneGeometry(26, 26);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new Mesh(floorGeo, new MeshStandardMaterial({ color: "#6b6f6a", roughness: 0.95 }));
    floor.receiveShadow = true;
    const wall = new Mesh(new BoxGeometry(16, 6, 0.2), new MeshStandardMaterial({ color: "#8b8578", roughness: 0.9 }));
    wall.position.set(0, 3, -4);
    wall.receiveShadow = true;
    root.add(floor, wall);
    return root;
  }, []);
  useEffect(() => () => disposeObjectTree(stage), [stage]);
  return (
    <>
      <StageDraw spec={{ lights: [
        { kind: "ambient", intensity: 0.55 },
        { kind: "directional", position: [5, 9, 7], intensity: 2.2 },
      ] }} />
      <SceneObjectAttach object={stage} />
      <AuthoredScene document={decalDocument} field={FLAT_FIELD} pathSurfaceDetail={false} />
    </>
  );
}

export const decalShowcaseGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "decals" },
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    editorLayers: decalDocument,
    environment: DecalStage,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    look: "flat",
    lighting: { ambient: { intensity: 0.5 }, directional: [{ intensity: 2.2, position: [5, 9, 7], color: "#fff2dd" }] },
    backdrop: { background: "#23282c" },
    postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  },
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
