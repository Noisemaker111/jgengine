/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-ui
import type { CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { GameContextBridge, useOptionalGameContext } from "@jgengine/ui/provider";

import { StudioStage, type StudioMood } from "@jgengine/core/scene/StudioStage.draw";
import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
import { EngineCanvas } from "@jgengine/core/frame/engineCanvas.draw";
import { useEngineRendererFactory } from "@jgengine/core/webgpu/engineRenderer.draw";

export interface EntityPreviewProps {
  children?: ReactNode;
  /**
   * Convenience for engine-native models: render this {@link ModelConfig} via `IsolatedEntityModel`.
   * Pair with `instanceId` to bind it to a live entity so the preview walks / flinches / topples in
   * sync with the world. Ignored when `children` is supplied.
   */
  model?: ModelConfig;
  instanceId?: string;
  mood?: StudioMood;
  /** Override the backdrop color (hex). Default: the mood's backdrop. */
  backdrop?: string;
  /** Turntable spin (rad/s). Default 0 — a still portrait that mirrors the live entity's own motion. */
  turntable?: number;
  /** Yaw the subject to face the camera each frame instead of spinning. Overrides `turntable`. */
  faceCamera?: boolean;
  forward?: readonly [number, number, number];
  environment?: boolean;
  cameraPosition?: [number, number, number];
  cameraTarget?: readonly [number, number, number];
  fov?: number;
  /** Device pixel ratio clamp. Default `[1, 2]`. */
  dpr?: number | [number, number];
  className?: string;
  style?: CSSProperties;
}

/**
 * Drop-in live 3D preview of a single entity — the character-screen portrait, unit inspector, or loadout
 * viewer. It owns all the plumbing a game would otherwise re-derive by hand: a nested {@link EngineCanvas}
 * (WebGL), the {@link GameContextBridge} that carries the running
 * `GameContext` to the subject's `useEntityRenderCues` / `useGameContext` hooks, a {@link StudioStage}
 * 3-point lighting rig with optional turntable / face-camera, and a capture-friendly GL surface
 * (`preserveDrawingBuffer`). The game keeps ownership of its `renderEntity`: pass it as `children`, or
 * hand a native `model` (+ `instanceId`) for an engine-composed body. Bound to a live `instanceId`, the
 * portrait walks, flinches, and topples in lockstep with the world instead of a canned spin.
 *
 * @capability entity-preview live 3D entity portrait — nested EngineCanvas + context bridge + studio stage, driven by the game's own renderEntity
 */
export function EntityPreview({
  children,
  model,
  instanceId,
  mood = "studio",
  backdrop,
  turntable = 0,
  faceCamera = false,
  forward,
  environment = true,
  cameraPosition = [0, 1, 3],
  cameraTarget,
  fov = 35,
  dpr = [1, 2],
  className,
  style,
}: EntityPreviewProps) {
  const ctx = useOptionalGameContext();
  const rendererFactory = useEngineRendererFactory("webgl");
  const subject =
    children ??
    (model !== undefined ? <IsolatedEntityModel model={model} instanceId={instanceId} /> : null);
  return (
    <div
      data-jg-entity-preview=""
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      {rendererFactory === null ? null : (
        <EngineCanvas
          rendererFactory={rendererFactory}
          shadows
          dpr={dpr}
          preserveDrawingBuffer
          camera={{ fov }}
          onCreated={({ camera }) => {
            camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
            if (cameraTarget !== undefined) camera.lookAt(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
          }}
        >
          <GameContextBridge context={ctx}>
            <StudioStage
              mood={mood}
              {...(backdrop === undefined ? {} : { backdrop })}
              turntable={turntable}
              faceCamera={faceCamera}
              {...(forward === undefined ? {} : { forward })}
              environment={environment}
            >
              {subject}
            </StudioStage>
          </GameContextBridge>
        </EngineCanvas>
      )}
    </div>
  );
}
