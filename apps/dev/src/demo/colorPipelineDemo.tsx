import { type ReactNode } from "react";

import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import type { EditorDocument } from "@jgengine/core/editor/index";
import { environment, sky, terrain } from "@jgengine/core/world/features";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
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
  return (
    <group position={[ROOM.x, 0, ROOM.z]}>
      <mesh receiveShadow castShadow position={[0, base / 2, 0]}>
        <boxGeometry args={[halfX * 2, base, halfZ * 2]} />
        <meshStandardMaterial color="#4a423a" roughness={0.85} />
      </mesh>
      {([-halfZ, halfZ] as const).map((z) => (
        <mesh key={`z${z}`} castShadow receiveShadow position={[0, mid, z]}>
          <boxGeometry args={[halfX * 2, height, wall]} />
          <meshStandardMaterial color="#6b6255" roughness={0.9} />
        </mesh>
      ))}
      {([-halfX, halfX] as const).map((x) => (
        <mesh key={`x${x}`} castShadow receiveShadow position={[x, mid, 0]}>
          <boxGeometry args={[wall, height, halfZ * 2]} />
          <meshStandardMaterial color="#5d554a" roughness={0.9} />
        </mesh>
      ))}
      <mesh receiveShadow position={[0, base + height, 0]}>
        <boxGeometry args={[halfX * 2, wall, halfZ * 2]} />
        <meshStandardMaterial color="#3c3630" roughness={0.95} />
      </mesh>
      <mesh position={[0, base + 0.55, halfZ - 1.6]} castShadow>
        <boxGeometry args={[1.6, 1.1, 1.6]} />
        <meshStandardMaterial color="#c9c2b4" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Props that give the eye a white and a saturated reference to judge exposure against. */
function Props() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[-6, 0.9, -6]}>
        <boxGeometry args={[1.8, 1.8, 1.8]} />
        <meshStandardMaterial color="#e6e3dc" roughness={0.55} />
      </mesh>
      <mesh castShadow receiveShadow position={[-2, 0.6, -10]}>
        <sphereGeometry args={[0.6, 24, 16]} />
        <meshStandardMaterial color="#b4462f" roughness={0.5} />
      </mesh>
      <mesh castShadow receiveShadow position={[3, 1.4, -12]}>
        <boxGeometry args={[0.6, 2.8, 0.6]} />
        <meshStandardMaterial color="#8d99a6" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

function Scene(): ReactNode {
  return (
    <>
      <EnvironmentScene feature={world} />
      <Props />
      <Room />
      <pointLight position={[ROOM.x, ROOM.base + 2.6, ROOM.z]} intensity={0.6} distance={10} decay={2} color="#ffd2a0" />
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
  renderEntity: () => <group />,
  renderObject: () => <group />,
  editorLayers: authored,
  loop: { ...demoGame.loop, onTick: () => {} },
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
  environment: Scene,
  GameUI: Legend,
  capture: {
    views: {
      exterior: { look: "0,1.2,-8", lookFrom: "19,6,0.35" },
      interior: { look: "6,2,-26", lookFrom: "3.4,0.3,1.6" },
    },
  },
};
