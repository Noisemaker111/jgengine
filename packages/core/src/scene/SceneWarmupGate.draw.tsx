/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, useSyncExternalStore } from "@jgengine/core/ui/jsx";

import type { BootStep } from "@jgengine/core/boot/bootSequence";
import { BootLoadingScreen, useBootStep } from "@jgengine/core/boot/bootScreen.view";
import { devtools } from "@jgengine/core/devtools/devtools";
import { joinAfterRenderTask, joinBeforeRenderTask } from "@jgengine/core/frame/afterRenderBoard.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { createShaderWarmup, deferUnlinkedDraws, firstUnlinkedDrawable, holdDraws, registerSceneWarmup, SHADER_WARMUP_DEFAULTS, warmupHoldLabels, type HeldDraw, type ShaderWarmupState } from "@jgengine/core/render/shaderWarmup.draw";

/** Warmup state before the gate has run, so the loading screen covers the very first frame. @internal */
export const SCENE_WARMUP_PENDING: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, planned: 0, deferred: 0, progress: 0, elapsedMs: 0 };

/** Warmup progress held outside React state: see {@link createSceneWarmupStore}. @internal */
export interface SceneWarmupStore {
  get: () => ShaderWarmupState;
  set: (state: ShaderWarmupState) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Where the gate reports progress and the cover reads it. Progress lands many times a second while
 * the scene compiles; held in the component that renders the canvas, each report would re-render the
 * whole scene tree, thousands of components, and starve the very warmup it reports on.
 * @internal
 */
export function createSceneWarmupStore(): SceneWarmupStore {
  let state = SCENE_WARMUP_PENDING;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface SceneWarmupGateProps {
  onState: (state: ShaderWarmupState) => void;
  sceneDrawsToTarget?: boolean;
}

/**
 * Compiles the mounted scene's shaders behind the loading screen and reports progress to it.
 * Mounted inside the canvas, after the world, so the first round sees the world's materials.
 * The frame loop draws nothing until the warmup reveals: it keeps ticking, but a draw would link
 * every unready program synchronously on the main thread and freeze the menu above the cover.
 * What it tried to draw is handed to the warmup, so post passes and override passes are linked
 * too. Draws outside the loop (an environment bake) still run.
 * @internal
 */
export function sceneWarmupGateDraw(getProps: () => SceneWarmupGateProps): EngineDraw {
  let disposed = false;
  let warmup: ReturnType<typeof createShaderWarmup> | null = null;
  let unwatch = (): void => {};
  let release = (): void => {};
  let unregisterWarmup: (() => void) | null = null;
  let unregisterProbe: (() => void) | null = null;
  return {
    mount(state: EngineFrameState) {
      const { gl, scene, camera } = state;
      let inFrame = false;
      const leaveBefore = joinBeforeRenderTask(() => {
        inFrame = true;
      });
      const leaveAfter = joinAfterRenderTask(() => {
        inFrame = false;
      });
      let held: HeldDraw[] = [];
      const releaseDraws = holdDraws(gl, { holding: () => inFrame, onHeld: (draw) => held.push(draw) });
      release = (): void => {
        releaseDraws();
        leaveBefore();
        leaveAfter();
        held = [];
      };
      const active = createShaderWarmup({
        renderer: gl,
        scene,
        camera,
        onState: (warmupState) => getProps().onState(warmupState),
        // With no answer from the canvas owner, a priority frame loop is taken for the post chain, which
        // draws the scene into its own buffer. A scissored split-screen loop also takes priority and draws
        // the canvas, so the composition passes the answer where it knows it.
        sceneDrawsToTarget: () => getProps().sceneDrawsToTarget ?? state.renderTakenOver,
        takeHeldDraws: () => {
          const taken = held;
          held = [];
          return taken;
        },
      });
      warmup = active;
      // After the reveal, a frame that would link a program mid-draw (a level the Play press spawns,
      // a pooled effect turning on) is skipped instead: the canvas keeps its last image while the
      // warmup links the new content off the frame, then drawing resumes with nothing left to link.
      let watchUntil = 0;
      let preparing = false;
      const watch = (): void => {
        watchUntil = performance.now() + SHADER_WARMUP_DEFAULTS.watchMs;
      };
      const linkedPrograms = (): number => gl.info.programs?.length ?? 0;
      /** `found`: a frame saw content to link, rather than the cover lifting. */
      const prepare = (found: boolean): Promise<void> => {
        preparing = true;
        const before = linkedPrograms();
        return active.prepare().finally(() => {
          preparing = false;
          // A prepare a frame asked for that linked nothing found nothing it could link: stop looking
          // rather than hold frame after frame for something that never gets a program.
          if (!found || linkedPrograms() > before) watch();
          else watchUntil = 0;
        });
      };
      void active.done.then((warmupState) => {
        release();
        if (disposed || warmupState.phase !== "ready") return;
        watch();
        let inWatchedFrame = false;
        const releaseWatchDraws = holdDraws(gl, { holding: () => inWatchedFrame && preparing });
        // Whatever mounts later in play, or turns visible mid-frame, is left out until it is linked.
        const undoDefer = deferUnlinkedDraws(gl, scene, () => !preparing);
        const leaveWatchedBefore = joinBeforeRenderTask(() => {
          inWatchedFrame = true;
          if (preparing || performance.now() > watchUntil) return;
          if (firstUnlinkedDrawable(gl, scene, camera) !== null) void prepare(true);
        });
        const leaveWatchedAfter = joinAfterRenderTask(() => {
          inWatchedFrame = false;
        });
        unwatch = () => {
          undoDefer();
          releaseWatchDraws();
          leaveWatchedBefore();
          leaveWatchedAfter();
        };
      });
      unregisterWarmup = registerSceneWarmup(scene, { ...active, prepare: () => prepare(false) });
      unregisterProbe = devtools.probes.register("sceneWarmup", () => {
        const warmupState = active.state();
        const holds = warmupHoldLabels(scene);
        const waiting = holds.length === 0 ? "" : `, waiting on ${holds.join("; ")}`;
        return `${warmupState.phase}, ${warmupState.rounds} rounds, ${warmupState.programs} programs, ${warmupState.planned} planned, ${warmupState.deferred} deferred, ${warmupState.elapsedMs}ms${waiting}`;
      });
    },
    dispose() {
      disposed = true;
      warmup?.cancel();
      unregisterWarmup?.();
      unregisterWarmup = null;
      unwatch();
      release();
      unregisterProbe?.();
      unregisterProbe = null;
      warmup = null;
    },
  };
}

/**
 * Compiles the mounted scene's shaders behind the loading screen and reports progress to it.
 * Mounted inside the canvas, after the world, so the first round sees the world's materials.
 * The frame loop draws nothing until the warmup reveals: it keeps ticking, but a draw would link
 * every unready program synchronously on the main thread and freeze the menu above the cover.
 * What it tried to draw is handed to the warmup, so post passes and override passes are linked
 * too. Draws outside the loop (an environment bake) still run.
 * @internal
 */
export function SceneWarmupGate(props: SceneWarmupGateProps) {
  const latest = useRef(props);
  latest.current = props;
  const created = useRef<EngineDraw | null>(null);
  if (created.current === null) created.current = sceneWarmupGateDraw(() => latest.current);
  useEngineDraw(() => created.current as EngineDraw, []);
  return null;
}

/** What the loading cover says, so a wait that takes seconds reads as progress instead of a blank. @internal */
export function warmupLabel(state: ShaderWarmupState): string {
  if (state.phase === "compiling") {
    return state.programs === 0 ? "Preparing scene." : `Preparing scene (${state.programs} shaders)`;
  }
  return "Preparing scene.";
}

/** How full the cover's bar is: a sliver while waiting for the scene, then the share of links the GPU has run. @internal */
export function warmupBarShare(state: ShaderWarmupState): number {
  if (state.phase !== "compiling") return 0.05;
  return Math.max(0.05, Math.min(1, state.progress));
}

/** Whether the cover is still up: a failed compile releases the frame rather than hiding a broken scene. @internal */
export function warmupCovering(state: ShaderWarmupState): boolean {
  return state.phase !== "ready" && state.phase !== "failed";
}

/** The cover, re-rendered on its own as progress lands in the store and as the boot moves. @internal */
export function SceneWarmupCoverLive({ store }: { store: SceneWarmupStore }) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <SceneWarmupCover state={state} step={useBootStep()} />;
}

/**
 * Opaque cover over the canvas while the scene warms: the first frames of a scene compile its
 * materials, and a player should not see those frames. While the boot is loading it is the jgengine
 * loading screen with the warmup's progress; once the game's intro or menu shows, it is a plain
 * backdrop under that screen, so the warmup finishes behind the menu without a second loading screen.
 * @internal
 */
export function SceneWarmupCover({ state, step = "loading" }: { state: ShaderWarmupState; step?: BootStep }) {
  if (!warmupCovering(state)) return null;
  if (step === "intro" || step === "menu" || step === "entering") {
    return <div data-shell-code-loading data-shell-warmup aria-hidden="true" style={{ position: "absolute", inset: 0, background: "#0f172a" }} />;
  }
  const detail = state.deferred > 0
    ? `${state.deferred} more prepare after this`
    : state.phase === "compiling" && state.elapsedMs >= 1_000 ? `${(state.elapsedMs / 1000).toFixed(1)}s` : undefined;
  return (
    <div data-shell-code-loading data-shell-warmup style={{ position: "absolute", inset: 0 }}>
      <BootLoadingScreen label={warmupLabel(state)} progress={warmupBarShare(state)} {...(detail === undefined ? {} : { detail })} />
    </div>
  );
}
