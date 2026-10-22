import type { Camera, Object3D } from "three";

import { modelLoadIdleMs, modelLoadStarts } from "./modelLoad";

/**
 * Where the load-time shader warmup is: waiting for the scene to stop growing, compiling a
 * round, finished, or skipped because the renderer refused. The loading screen renders it.
 */
export interface ShaderWarmupState {
  phase: "waiting" | "compiling" | "ready" | "failed";
  /** Compile rounds finished. One round covers one burst of streamed models. */
  rounds: number;
  /** Shader programs the renderer has initialised, as of the last round. */
  programs: number;
  elapsedMs: number;
}

/** The renderer surface the warmup needs; a real `WebGLRenderer` satisfies it. */
export interface ShaderWarmupRenderer {
  /** Links every mounted material's program; returns the materials it prepared. */
  compile(scene: Object3D, camera: Camera): unknown;
  /** Renderer program list; each entry answers `isReady()` once the driver finishes its link. */
  readonly info?: { readonly programs?: readonly unknown[] | null };
}

/** A renderer program's completion check, which three keeps off its public type. */
interface ReadyProgram {
  isReady?(): boolean;
}

function programReady(program: unknown): boolean {
  try {
    return (program as ReadyProgram).isReady?.() !== false;
  } catch {
    return true;
  }
}

/** Defaults sized to cover an initial burst of streamed models without holding the screen. */
export const SHADER_WARMUP_DEFAULTS = {
  /** Loader quiet time after which a round is the last one. */
  quietMs: 400,
  /** Wall-clock cap on the whole warmup. The last round is cut off at it. */
  budgetMs: 5_000,
  /** Floor for a single round, so a driver that never reports completion cannot stall load. */
  roundFloorMs: 1_500,
  /** A scene still streaming after this long gets one last round and is revealed anyway. */
  streamWaitMs: 2_000,
} as const;

/** Options for {@link createShaderWarmup}; the clock, sleep and loader signal are injectable for tests. */
export interface ShaderWarmupOptions {
  renderer: ShaderWarmupRenderer;
  scene: Object3D;
  camera: Camera;
  quietMs?: number;
  budgetMs?: number;
  streamWaitMs?: number;
  /** Called on every state change, so the loading screen can show the phase. */
  onState?: (state: ShaderWarmupState) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Whether the shared model loader has been quiet long enough. */
  loaderQuiet?: (quietMs: number) => boolean;
  /** Changes whenever the shared loader starts a new burst of model loads. */
  loaderStarts?: () => number;
}

/** A warmup in flight: its promise, its latest state, and a way to stop it. */
export interface ShaderWarmup {
  /** Resolves when warm, capped or failed; never rejects. */
  done: Promise<ShaderWarmupState>;
  state(): ShaderWarmupState;
  /** Stop after the round in flight and stop waiting; used when the view unmounts. */
  cancel(): void;
}

/**
 * Warm the scene's shaders through the renderer's async compile, one round per burst of
 * streamed models, so materials first seen during load never compile on a visible frame.
 *
 * A round is `compileAsync` over the mounted scene; the round after it runs only when the
 * model loader started a new burst or the program count grew, which is what a scene that is
 * still streaming looks like. Everything is bounded: the last round is raced against the
 * budget, so a driver that never reports a finished program cannot hold the loading screen.
 * @internal
 */
export function createShaderWarmup(options: ShaderWarmupOptions): ShaderWarmup {
  const quietMs = options.quietMs ?? SHADER_WARMUP_DEFAULTS.quietMs;
  const budgetMs = options.budgetMs ?? SHADER_WARMUP_DEFAULTS.budgetMs;
  const streamWaitMs = options.streamWaitMs ?? SHADER_WARMUP_DEFAULTS.streamWaitMs;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const loaderQuiet = options.loaderQuiet ?? ((quiet: number) => modelLoadIdleMs() >= quiet);
  const loaderStarts = options.loaderStarts ?? modelLoadStarts;
  const startedAt = now();
  let state: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, elapsedMs: 0 };
  let cancelled = false;

  const programs = (): number => options.renderer.info?.programs?.length ?? 0;

  const publish = (next: Partial<ShaderWarmupState>): void => {
    state = { ...state, ...next, elapsedMs: Math.round(now() - startedAt) };
    options.onState?.(state);
  };

  const compileRound = async (): Promise<"compiled" | "timeout" | "error"> => {
    const remaining = budgetMs - (now() - startedAt);
    const allowance = Math.max(SHADER_WARMUP_DEFAULTS.roundFloorMs, remaining);
    const deadline = now() + allowance;
    const before = options.renderer.info?.programs?.length ?? 0;
    try {
      // `compileAsync` reports readiness through three's private program property, which throws
      // when a material regenerated its program mid-poll (ember-command does). Poll the public
      // program list instead: same wait, no crash path.
      options.renderer.compile(options.scene, options.camera);
    } catch {
      return "error";
    }
    for (;;) {
      if (cancelled) return "timeout";
      const programs = options.renderer.info?.programs?.slice(before) ?? [];
      if (programs.every(programReady)) return "compiled";
      if (now() >= deadline) return "timeout";
      await sleep(10);
    }
  };

  /** Wait (bounded) for the loader to go quiet, so a round is the last one when nothing is left. */
  const waitLoaderQuiet = async (limitMs: number): Promise<boolean> => {
    const until = startedAt + budgetMs;
    const limit = Math.min(limitMs, until - now());
    if (loaderQuiet(quietMs)) return true;
    const deadline = now() + Math.max(0, limit);
    while (!cancelled && now() < deadline) {
      await sleep(100);
      if (loaderQuiet(quietMs)) return true;
    }
    return loaderQuiet(quietMs);
  };

  const done = (async (): Promise<ShaderWarmupState> => {
    publish({ phase: "compiling" });
    for (;;) {
      if (cancelled) break;
      const starts = loaderStarts();
      const outcome = await compileRound();
      if (outcome === "error") {
        publish({ phase: "failed" });
        return state;
      }
      const settled = programs();
      publish({ rounds: state.rounds + (outcome === "compiled" ? 1 : 0), programs: settled });
      if (outcome === "timeout" || cancelled || now() - startedAt >= budgetMs) break;
      if (!(await waitLoaderQuiet(streamWaitMs))) break;
      const streamed = loaderStarts() !== starts;
      const linked = programs() > settled;
      if (cancelled || (!streamed && !linked)) break;
      if (now() - startedAt >= budgetMs) break;
    }
    publish({ phase: "ready" });
    return state;
  })();

  return {
    done,
    state: () => state,
    cancel: () => {
      cancelled = true;
    },
  };
}

