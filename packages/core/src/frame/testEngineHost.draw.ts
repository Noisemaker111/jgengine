import * as THREE from "three";
import { act, createElement, type ReactElement } from "@jgengine/core/ui/jsx";
import { createRoot } from "@jgengine/core/ui/jsx/client.view";
import { EngineHostProvider } from "./engineHost.draw";

import { flushAfterRenderTasks, flushBeforeRenderTasks } from "./afterRenderBoard.draw";
import type { EngineFrameState, EngineFrameloop } from "./engineLoop.draw";
import { bindFrameSource, type FrameSource } from "./frameBoard.draw";
import type { EngineHost } from "./engineHost.draw";

/**
 * A headless {@link EngineHost} for draw tests: a real scene/camera/clock over a
 * stub renderer, the shared frame board bound to a task list this host steps
 * manually, and `render` counted instead of drawn. This replaces the r3f
 * the old r3f test harness — `frameloop` is always "never" and
 * `step(delta)` is the only way frames advance, so tests stay deterministic.
 * @internal
 */
export interface TestEngineHost {
  readonly host: EngineHost;
  readonly state: EngineFrameState;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Rendered frame count (the stub renderer's `render` calls). */
  readonly renders: number;
  /** Every `setFpsLimit` value the host was handed, in order. */
  readonly fpsLimits: readonly number[];
  /** Run one frame: `delta` seconds (default 1/60), board tasks in priority order, then render. */
  step(delta?: number): void;
  dispose(): void;
}

export function createTestEngineHost(options?: {
  width?: number;
  height?: number;
  camera?: THREE.PerspectiveCamera;
  scene?: THREE.Scene;
}): TestEngineHost {
  const width = options?.width ?? 100;
  const height = options?.height ?? 100;
  const scene = options?.scene ?? new THREE.Scene();
  const camera = options?.camera ?? new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  if (options?.camera === undefined) camera.position.set(0, 0, 5);
  const clock = new THREE.Clock();
  const counts = { renders: 0 };
  const renderer = {
    render() {
      counts.renders += 1;
    },
    domElement: typeof document === "undefined" ? new EventTarget() : document.createElement("canvas"),
    getPixelRatio: () => 1,
    getSize: (target: { set: (w: number, h: number) => void }) => target.set(width, height),
  } as unknown as THREE.WebGLRenderer;
  let covered = false;
  let frameloop: EngineFrameloop = "never";
  const fpsLimits: number[] = [];
  let elapsed = 0;
  const bound = new Map<number, { priority: number; run: (state: EngineFrameState, delta: number) => void }>();
  let nextId = 0;

  const state = {
    renderer,
    gl: renderer,
    scene,
    camera,
    clock,
    size: { width, height },
    elapsed: 0,
    delta: 0,
    width,
    height,
    get frameloop() {
      return frameloop;
    },
    invalidate() {},
    setCovered(next: boolean) {
      covered = next;
    },
    get covered() {
      return covered;
    },
    renderPriority: 0,
    renderTakenOver: false,
  } as EngineFrameState;

  const testHost: TestEngineHost = {
    host: {
      frame: state,
      advance: (elapsedOverride?: number) => {
        if (covered) return;
        const delta = elapsedOverride === undefined ? 1 / 60 : Math.max(0, elapsedOverride - elapsed);
        testHost.step(delta);
      },
      setFrameloop: (mode) => {
        frameloop = mode;
      },
      setFpsLimit: (fps) => {
        fpsLimits.push(fps);
      },
    },
    fpsLimits,
    state,
    scene,
    camera,
    get renders() {
      return counts.renders;
    },
    step(delta = 1 / 60) {
      if (covered) return;
      elapsed += delta;
      state.delta = delta;
      state.elapsed = elapsed;
      clock.elapsedTime = elapsed;
      flushBeforeRenderTasks();
      const ordered = [...bound.values()].sort((a, b) => a.priority - b.priority);
      for (const entry of ordered) entry.run(state, delta);
      renderer.render(scene, camera);
      flushAfterRenderTasks();
    },
    dispose() {
      bindFrameSource(null);
    },
  };

  const source: FrameSource = (priority, run) => {
    const id = nextId;
    nextId += 1;
    bound.set(id, { priority, run });
    return () => bound.delete(id);
  };
  bindFrameSource(source);

  return testHost;
}

let testDomUsers = 0;

/**
 * Give a draw test the DOM react-dom needs, for as long as it holds the returned release: a
 * happy-dom window on the globals, registered for the first holder and removed with the last. Not
 * a test preload: a global `document`, `fetch` and `Response` in every test file made model tests
 * that assert there is no DOM fail, and broke the tests that serve real pages to a browser.
 * @internal
 */
export async function acquireTestDom(): Promise<() => Promise<void>> {
  if (testDomUsers === 0 && typeof document !== "undefined") return async () => {};
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  if (testDomUsers === 0) GlobalRegistrator.register();
  testDomUsers += 1;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    testDomUsers -= 1;
    if (testDomUsers === 0) await GlobalRegistrator.unregister();
  };
}

export interface MountedTestDraws {
  readonly engine: TestEngineHost;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** Re-render `element` under the same host provider (the old `root.render` call). */
  render(element: ReactElement): Promise<void>;
  /** Advance the engine clock `seconds` (default one 60 fps frame) inside act. */
  advance(seconds?: number): Promise<void>;
  unmount(): Promise<void>;
}

/**
 * Mount `element` under an {@link EngineHostProvider} bound to a fresh
 * {@link createTestEngineHost} through react-dom â€” the engine-side replacement
 * for the old r3f test harness. `frameloop` is
 * "never"; `advance`/`render` are the only ways frames and trees move.
 * @internal
 */
export async function mountTestDraws(
  element: ReactElement,
  options?: { camera?: THREE.PerspectiveCamera; width?: number; height?: number; scene?: THREE.Scene },
): Promise<MountedTestDraws> {
  const releaseDom = await acquireTestDom();
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const engine = createTestEngineHost(options);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (next: ReactElement) =>
    act(async () => {
      root.render(createElement(EngineHostProvider, { host: engine.host }, next));
    });
  await render(element);
  return {
    engine,
    scene: engine.scene,
    camera: engine.camera,
    render,
    advance: (seconds = 1 / 60) => act(async () => engine.step(seconds)),
    unmount: async () => {
      try {
        await act(async () => root.unmount());
      } finally {
        engine.dispose();
        if (previous === undefined) delete environment.IS_REACT_ACT_ENVIRONMENT;
        else environment.IS_REACT_ACT_ENVIRONMENT = previous;
        await releaseDom();
      }
    },
  };
}
