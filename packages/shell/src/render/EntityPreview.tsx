import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { GameContextBridge, useOptionalGameContext } from "@jgengine/react/provider";

import { StudioStage, type StudioMood } from "../scene/StudioStage";
import { IsolatedEntityModel } from "./SceneModels";

/** Props for {@link EntityPreview}. */
export interface EntityPreviewProps {
  /**
   * The rendered entity — the game's *own* `renderEntity` content (e.g. its procedural body component),
   * which may call `useEntityRenderCues(id)` / `useGameContext()` internally to mirror the live game.
   * Takes precedence over `model`. Omit both to render an empty lit stage.
   */
  children?: ReactNode;
  /**
   * Convenience for engine-native models: render this {@link ModelConfig} via `IsolatedEntityModel`.
   * Pair with `instanceId` to bind it to a live entity so the preview walks / flinches / topples in
   * sync with the world. Ignored when `children` is supplied.
   */
  model?: ModelConfig;
  /** Live entity id driving motion cues for `model` (also lets a custom child resolve the same entity). */
  instanceId?: string;
  /** Lighting mood for the stage. Default `"studio"`. */
  mood?: StudioMood;
  /** Override the backdrop color (hex). Default: the mood's backdrop. */
  backdrop?: string;
  /** Turntable spin (rad/s). Default 0 — a still portrait that mirrors the live entity's own motion. */
  turntable?: number;
  /** Yaw the subject to face the camera each frame instead of spinning. Overrides `turntable`. */
  faceCamera?: boolean;
  /** The subject's declared forward axis for `faceCamera`. Default `[0, 0, 1]`. */
  forward?: readonly [number, number, number];
  /** Draw the backdrop + floor (true) or keep a transparent stage as a pure lighting rig (false). Default true. */
  environment?: boolean;
  /** Camera position framing the subject. Default `[0, 1, 3]`. */
  cameraPosition?: [number, number, number];
  /** Camera field of view. Default 35. */
  fov?: number;
  /** Device pixel ratio clamp. Default `[1, 2]`. */
  dpr?: number | [number, number];
  className?: string;
  style?: CSSProperties;
}

/**
 * Drop-in live 3D preview of a single entity — the character-screen portrait, unit inspector, or loadout
 * viewer. It owns all the plumbing a game would otherwise re-derive by hand: a nested `<Canvas>`, the
 * {@link GameContextBridge} that carries the running `GameContext` across the R3F reconciler boundary (so
 * the subject's `useEntityRenderCues` / `useGameContext` hooks resolve and it mirrors the live game), a
 * {@link StudioStage} 3-point lighting rig with optional turntable / face-camera, and a capture-friendly
 * GL surface. The game keeps ownership of its `renderEntity`: pass it as `children`, or hand a native
 * `model` (+ `instanceId`) for an engine-composed body. Bound to a live `instanceId`, the portrait walks,
 * flinches, and topples in lockstep with the world instead of a canned spin.
 *
 * @capability entity-preview live 3D entity portrait — nested Canvas + context bridge + studio stage, driven by the game's own renderEntity
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
  fov = 35,
  dpr = [1, 2],
  className,
  style,
}: EntityPreviewProps) {
  const ctx = useOptionalGameContext();
  const subject =
    children ??
    (model !== undefined ? <IsolatedEntityModel model={model} instanceId={instanceId} /> : null);
  return (
    <div
      data-jg-entity-preview=""
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      <Canvas
        shadows
        dpr={dpr}
        camera={{ position: cameraPosition, fov }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ touchAction: "none" }}
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
      </Canvas>
    </div>
  );
}
