/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { StageDraw } from "@jgengine/core/stage/stageDraw.draw";

import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import type { EditorDocument } from "@jgengine/core/editor/index";
import { environment, sky, terrain } from "@jgengine/core/world/features";
import { EnvironmentScene } from "@jgengine/core/environment/EnvironmentScene.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";
import source from "./colorPipeline.scene.json";

/** The authored document is the only place a grade, sky and light rig come from. */
const document = importEditorDocumentJson(JSON.stringify(source));
const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** `?grading=off` drops the document grade so the same view can be judged ungraded. */
const gradingOff = params.get("grading") === "off";
/** `?exposure=fixed` pins exposure at 1, showing what the clamp is correcting. */
const exposureFixed = params.get("exposure") === "fixed";

/**
 * The demo's own toggles, applied by editing the authored document rather than by bypassing the
 * pipeline: `?grading=off` keeps every other knob and drops the baked LUT; `?exposure=fixed` drops
 * the authored range and pins exposure, showing what the clamp was correcting.
 */
function demoDocument(): EditorDocument {
  const grading = document.environment?.grading;
  if (grading === undefined) return document;
  const next = { ...grading };
  if (gradingOff) {
    delete next.shadows;
    delete next.midtones;
    delete next.highlights;
    delete next.tint;
    delete next.saturation;
    delete next.contrast;
  }
  if (exposureFixed) delete next.autoExposure;
  const environmentBag = { ...document.environment };
  if (Object.keys(next).length === 0) delete environmentBag.grading;
  else environmentBag.grading = next;
  return { ...document, environment: environmentBag };
}

const authored = demoDocument();

const world = environment({
  terrain: terrain({ bounds: { w: 90, d: 90 }, height: 2.5, frequency: 0.02, seed: "color-pipeline" }),
  sky: sky({ preset: "day" }),
});

const ROOM = { x: 6, z: -26, halfX: 6, halfZ: 5, base: 0.9, height: 3.2, wall: 0.25 };

/**
 * A windowless room on a plinth: its only light is the authored lamp, so a pinned exposure crushes the
 * interior while the meter can lift it. The plinth keeps ground vegetation out of the room.
 */
function Room() {
  const { halfX, halfZ, base, height, wall } = ROOM;
  const mid = base + height / 2;
  const rig = useMemo(() => {
    const root = new Group();
    root.position.set(ROOM.x, 0, ROOM.z);
    const add = (size: readonly [number, number, number], color: string, pos: readonly [number, number, number], roughness: number, receiveShadow = true, castShadow = true) => {
      const block = new Mesh(new BoxGeometry(size[0], size[1], size[2]), new MeshStandardMaterial({ color, roughness }));
      block.position.set(pos[0], pos[1], pos[2]);
      block.receiveShadow = receiveShadow;
      block.castShadow = castShadow;
      root.add(block);
    };
    add([halfX * 2, base, halfZ * 2], "#4a423a", [0, base / 2, 0], 0.85);
    for (const z of [-halfZ, halfZ]) add([halfX * 2, height, wall], "#6b6255", [0, mid, z], 0.9);
    for (const x of [-halfX, halfX]) add([wall, height, halfZ * 2], "#5d554a", [x, mid, 0], 0.9);
    add([halfX * 2, wall, halfZ * 2], "#3c3630", [0, base + height, 0], 0.95, true, false);
    add([1.6, 1.1, 1.6], "#c9c2b4", [0, base + 0.55, halfZ - 1.6], 0.6);
    return root;
  }, [halfX, halfZ, base, height, wall, mid]);
  useEffect(() => () => disposeObjectTree(rig), [rig]);
  return <SceneObjectAttach object={rig} />;
}

/** Props that give the eye a white and a saturated reference to judge exposure against. */
function Props() {
  const rig = useMemo(() => {
    const root = new Group();
    const add = (geometry: import("three").BufferGeometry, color: string, position: readonly [number, number, number], params: ConstructorParameters<typeof MeshStandardMaterial>[0]) => {
      const prop = new Mesh(geometry, new MeshStandardMaterial({ color, ...params }));
      prop.position.set(position[0], position[1], position[2]);
      prop.castShadow = true;
      prop.receiveShadow = true;
      root.add(prop);
    };
    add(new BoxGeometry(1.8, 1.8, 1.8), "#e6e3dc", [-6, 0.9, -6], { roughness: 0.55 });
    add(new SphereGeometry(0.6, 24, 16), "#b4462f", [-2, 0.6, -10], { roughness: 0.5 });
    add(new BoxGeometry(0.6, 2.8, 0.6), "#8d99a6", [3, 1.4, -12], { roughness: 0.4, metalness: 0.6 });
    return root;
  }, []);
  useEffect(() => () => disposeObjectTree(rig), [rig]);
  return <SceneObjectAttach object={rig} />;
}

function Scene(): ReactNode {
  return (
    <>
      <EnvironmentScene feature={world} />
      <Props />
      <Room />
      <StageDraw spec={{ lights: [{ kind: "point", position: [ROOM.x, ROOM.base + 2.6, ROOM.z], intensity: 0.6, distance: 10, color: "#ffd2a0" }] }} />
    </>
  );
}

function Legend(): ReactNode {
  const grade = gradingOff ? "document grade off" : "document grade on";
  const exposure = exposureFixed ? "exposure pinned at 1" : "clamped auto-exposure";
  const ink = { color: "#12161c", textShadow: "0 1px 0 rgba(255,255,255,0.55)" } as const;
  return (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", top: 16, left: 20, fontSize: 15, fontWeight: 600, ...ink }}>
        Colour pipeline · {grade} · {exposure}
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 20, fontSize: 11, opacity: 0.85, ...ink }}>
        AgX tone map · white point 1.0 · grade baked from environment.grading in the scene document
      </div>
    </div>
  );
}

/** Deterministic colour-pipeline proof: one authored grade, one exterior view, one windowless room. */
export const colorPipelineDemoGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "color-pipeline", world },
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    editorLayers: authored,
    environment: Scene,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    look: "flat",
    lighting: {
      ambient: { intensity: 0.05 },
      directional: [{ intensity: 2.8, position: [26, 34, 14], color: "#fff2da", castShadow: true }],
    },
    postProcessing: {
      enabled: true,
      toneMapping: "agx",
      exposure: 1,
      bloom: false,
      ao: false,
      grade: {},
      aa: "msaa",
      ...(exposureFixed ? { autoExposure: false as const } : {}),
    },
  },
  GameUI: Legend,
  capture: {
    views: {
      exterior: { look: "0,1.2,-8", lookFrom: "19,6,0.35" },
      interior: { look: "6,2,-26", lookFrom: "3.4,0.3,1.6" },
    },
  },
};
