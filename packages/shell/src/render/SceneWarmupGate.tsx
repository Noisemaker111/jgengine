import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { devtools } from "@jgengine/core/devtools/devtools";

import { createShaderWarmup, type ShaderWarmupState } from "./shaderWarmup";

/** Warmup state before the gate has run, so the loading screen covers the very first frame. @internal */
export const SCENE_WARMUP_PENDING: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, planned: 0, deferred: 0, elapsedMs: 0 };

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
      return `${state.phase}, ${state.rounds} rounds, ${state.programs} programs, ${state.planned} planned, ${state.deferred} deferred, ${state.elapsedMs}ms`;
    });
    return () => {
      warmup.cancel();
      unregister();
    };
  }, [gl, scene, camera, onState]);
  return null;
}

/** What the loading cover says, so a wait that takes seconds reads as progress instead of a blank. @internal */
export function warmupLabel(state: ShaderWarmupState): string {
  if (state.phase === "compiling") {
    return state.programs === 0 ? "Preparing scene." : `Preparing scene (${state.programs} shaders)`;
  }
  return "Preparing scene.";
}

/** Whether the cover is still up: a failed compile releases the frame rather than hiding a broken scene. @internal */
export function warmupCovering(state: ShaderWarmupState): boolean {
  return state.phase !== "ready" && state.phase !== "failed";
}

/**
 * Opaque cover over the canvas while the scene warms: the first frames of a scene compile its
 * materials, and a player should not see those frames. Game UI and menus mount after this and
 * paint over it, so a title screen stays usable.
 * @internal
 */
export function SceneWarmupCover({ state }: { state: ShaderWarmupState }) {
  if (!warmupCovering(state)) return null;
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
      <div style={{ display: "grid", gap: 10, justifyItems: "center", fontSize: 14 }}>
        <span>{warmupLabel(state)}</span>
        <div data-shell-warmup-bar aria-hidden="true" style={{ width: 160, height: 3, borderRadius: 2, background: "#1e293b", overflow: "hidden" }}>
          <div
            style={{
              width: state.phase === "compiling" ? "100%" : "20%",
              height: "100%",
              background: "#38bdf8",
              opacity: state.phase === "compiling" ? 1 : 0.4,
            }}
          />
        </div>
        {state.deferred > 0 ? (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{`${state.deferred} more prepare in the background`}</span>
        ) : null}
        {state.phase === "compiling" && state.elapsedMs >= 1_000 ? (
          <span style={{ fontSize: 11, color: "#64748b" }}>{`${(state.elapsedMs / 1000).toFixed(1)}s`}</span>
        ) : null}
      </div>
    </div>
  );
}
