import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { devtools } from "@jgengine/core/devtools/devtools";

import { createShaderWarmup, type ShaderWarmupState } from "./shaderWarmup";

/** Warmup state before the gate has run, so the loading screen covers the very first frame. @internal */
export const SCENE_WARMUP_PENDING: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, elapsedMs: 0 };

/**
 * Compiles the mounted scene's shaders behind the loading screen and reports progress to it.
 * Mounted inside the canvas, after the world, so the first round sees the world's materials.
 * @internal
 */
export function SceneWarmupGate({ onState }: { onState: (state: ShaderWarmupState) => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const warmup = createShaderWarmup({ renderer: gl, scene, camera, onState });
    const unregister = devtools.probes.register("sceneWarmup", () => {
      const state = warmup.state();
      return `${state.phase}, ${state.rounds} rounds, ${state.programs} programs, ${state.elapsedMs}ms`;
    });
    return () => {
      warmup.cancel();
      unregister();
    };
  }, [gl, scene, camera, onState]);
  return null;
}

/**
 * Opaque cover over the canvas while the scene warms: the first frames of a scene compile its
 * materials, and a player should not see those frames. Game UI and menus mount after this and
 * paint over it, so a title screen stays usable.
 * @internal
 */
export function SceneWarmupCover({ state }: { state: ShaderWarmupState }) {
  if (state.phase === "ready" || state.phase === "failed") return null;
  return (
    <div
      data-shell-code-loading
      data-shell-warmup
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {state.phase === "compiling" && state.programs > 0 ? `Preparing scene (${state.programs} shaders)` : "Preparing scene."}
    </div>
  );
}
