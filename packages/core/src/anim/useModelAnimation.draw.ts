import { useEffect, useMemo, useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";

import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";
import { resolveAnimationConfig } from "@jgengine/core/game/clipRoles";
import { useOptionalGameContext } from "@jgengine/react/provider";

import { ModelAnimationDriver } from "./modelAnimationDriver.draw";
import { useFrameWhile } from "@jgengine/core/render/useFrameWhile.draw";

export {
  diagnoseModelAnimation,
  readModelAnimationParams,
  takeRootMotion,
  createGraphPose,
} from "./modelAnimationDriver.draw";
export type {
  ModelAnimationDiagnostic,
  ModelMotionStep,
  GraphPose,
} from "./modelAnimationDriver.draw";

/**
 * The engine's model animation driver as a hook — see {@link ModelAnimationDriver}.
 * Handles `"auto"` derivation, speed-driven crossfades, one-shots, held poses,
 * the death clamp and graph playback; entity-bound playback holds while game
 * time is frozen. Equivalent same-order config data retains playback.
 */
export function useModelAnimation(
  scene: THREE.Object3D,
  clips: THREE.AnimationClip[],
  animationInput: ModelAnimationConfig | "auto" | "none" | undefined,
  instanceId?: string,
): void {
  const invalidate = useEngineHost().frame.invalidate;
  // Optional: a model must still animate its bind pose / auto clip in a preview or inspector that
  // has no running game — a hard context requirement made every part composition unviewable outside
  // the world, which is half of why #1588 took a session to see.
  const ctx = useOptionalGameContext();

  // Equivalent fresh JSON data retains playback, pending triggers and visual RNG.
  // The private snapshot observes edits on render, including reused nested objects.
  // Preserve one-shot insertion order: simultaneous non-death triggers depend on it.
  const animationKey = JSON.stringify(animationInput);
  const resolvedInput = useMemo(
    () => (animationKey === undefined ? undefined : JSON.parse(animationKey) as ModelAnimationConfig | "auto" | "none"),
    [animationKey],
  );
  // A model with nothing to play (most static props) stays out of the frame loop; the driver
  // resolves the same config, so this render-time check matches its `active`.
  const willAnimate = useMemo(
    () => resolvedInput !== undefined && resolveAnimationConfig(resolvedInput, clips.map((clip) => clip.name)) !== undefined && clips.length > 0,
    [resolvedInput, clips],
  );

  const driverRef = useRef<ModelAnimationDriver | null>(null);
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  useEffect(() => {
    const driver = new ModelAnimationDriver({
      scene,
      clips,
      animationInput: resolvedInput,
      instanceId,
      ctx,
      invalidate: () => invalidateRef.current(),
    });
    driverRef.current = driver;
    return () => {
      driver.dispose();
      if (driverRef.current === driver) driverRef.current = null;
    };
  }, [scene, clips, resolvedInput, instanceId, ctx]);

  useFrameWhile(willAnimate, (_state, delta) => {
    driverRef.current?.pose(delta);
  });
}
