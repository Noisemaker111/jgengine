import { useMemo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { PlayerCharacterFigure } from "./PlayerCharacterFigure";
import { LLMVILLE_CHARACTER_PALETTE, type CharacterLook } from "../playerCharacterFigure";
import { useEngineRendererFactory } from "@jgengine/core/webgpu/engineRenderer.draw";
import { EngineCanvas } from "@jgengine/core/frame/engineCanvas.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { SceneObjectAttach, SceneObjectPortal } from "@jgengine/core/frame/useEngineDraw.draw";
import { CameraPoseDraw, OrbitControlsDraw, StageDraw, type StageSpec } from "@jgengine/core/stage/stageDraw.draw";

function RotatingFigure({ look }: { look: CharacterLook }) {
  const group = useMemo(() => new THREE.Group(), []);
  useFrameTask((_, delta) => {
    group.rotation.y += delta * 0.45;
  });
  return (
    <>
      <SceneObjectAttach object={group} />
      <SceneObjectPortal object={group}>
        <PlayerCharacterFigure look={look} />
      </SceneObjectPortal>
    </>
  );
}

const STAGE: StageSpec = {
  background: LLMVILLE_CHARACTER_PALETTE.ink,
  fog: { color: LLMVILLE_CHARACTER_PALETTE.ink, near: 4, far: 9 },
  lights: [
    { kind: "ambient", intensity: 0.55, color: LLMVILLE_CHARACTER_PALETTE.cream },
    { kind: "hemisphere", skyColor: LLMVILLE_CHARACTER_PALETTE.teal, groundColor: LLMVILLE_CHARACTER_PALETTE.charcoal, intensity: 0.42 },
    { kind: "directional", castShadow: true, position: [2.5, 4.5, 3.5], intensity: 0.85, color: LLMVILLE_CHARACTER_PALETTE.cream, shadowMapSize: [512, 512] },
    { kind: "directional", position: [-2.5, 2.5, -2], intensity: 0.28, color: LLMVILLE_CHARACTER_PALETTE.amber },
  ],
  ground: {
    shape: "circle",
    radius: 0.72,
    color: LLMVILLE_CHARACTER_PALETTE.charcoal,
    roughness: 0.94,
    metalness: 0,
    emissive: LLMVILLE_CHARACTER_PALETTE.deepTeal,
    emissiveIntensity: 0.04,
  },
};

const ORBIT_SPEC = {
  enablePan: false,
  enableZoom: false,
  minPolarAngle: Math.PI / 3.2,
  maxPolarAngle: Math.PI / 2.05,
  minAzimuthAngle: -Math.PI / 3,
  maxAzimuthAngle: Math.PI / 3,
  target: [0, 0.75, 0] as const,
};

interface CharacterCustomizeViewportProps {
  look: CharacterLook;
  className?: string;
}

export function CharacterCustomizeViewport({ look, className }: CharacterCustomizeViewportProps) {
  const rendererFactory = useEngineRendererFactory("webgl");
  return (
    <div className={className}>
      {rendererFactory === null ? null : (
        <EngineCanvas
          rendererFactory={rendererFactory}
          shadows
          camera={{ fov: 38, near: 0.1, far: 20 }}
          dpr={[1, 2]}
        >
          <StageDraw spec={STAGE} />
          <CameraPoseDraw spec={{ position: [0, 1.05, 2.65] }} />
          <OrbitControlsDraw spec={ORBIT_SPEC} />
          <RotatingFigure look={look} />
        </EngineCanvas>
      )}
    </div>
  );
}
