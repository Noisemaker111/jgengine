// @skill jgengine-ui
/**
 * The engine-owned frame loop: one rAF that steps an ordered list of draw
 * systems and renders a plain three.js scene. This is what r3f's Canvas +
 * useFrame gave the shell, without React: systems are registered with a
 * priority (lower runs first, the render happens once after all of them —
 * r3f's subscriber order), the camera and renderer are owned here, and the
 * frameloop modes the shell used (`always`, `demand`, `never` plus the fps
 * cap and canvas cover) are first-class loop state.
 *
 * A system is anything with a per-frame `frame(state)`; `mount`/`dispose`
 * bracket its three.js objects' lifetime. Systems never see React, never see
 * the DOM, and read their own stores through closures. Per-instance frame
 * work that many mounted copies share (the old `useSharedFrame` /
 * `useFrameWhile` case) joins `loop.tasks` at a priority instead of becoming
 * one draw each.
 */
import * as THREE from "three";

import { paceFrame } from "../settings/frameRateLimit";
import { flushAfterRenderTasks, flushBeforeRenderTasks } from "./afterRenderBoard.draw";
import { bindFrameSource, joinFrameTask, type FrameSource } from "./frameBoard.draw";

/** Frameloop modes the shell's Canvas accepted. */
export type EngineFrameloop = "always" | "demand" | "never";

/** Everything a system may read on a rendered frame. Mutable, reused per frame. */
export interface EngineFrameState {
  readonly renderer: THREE.WebGLRenderer;
  /** r3f's name for the renderer, kept so converted callbacks read drop-in. */
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /**
   * The real scene this state renders, even when `scene` is a scoped parent
   * (see {@link childFrameState}). Draws that set scene-level state —
   * environment, fog, background, shadow caches — must use this, not `scene`.
   * Absent on states built directly over a renderer root.
   */
  readonly rootScene?: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly clock: THREE.Clock;
  /** r3f's `size`: the canvas's CSS pixel size, live across resizes. */
  readonly size: { width: number; height: number };
  /** Seconds since the loop started (r3f's `clock.elapsedTime`). */
  elapsed: number;
  /** Seconds since the previous rendered frame. */
  delta: number;
  /** Canvas CSS pixel size. */
  width: number;
  height: number;
  /** The loop's frameloop mode. */
  readonly frameloop: EngineFrameloop;
  /** Demand mode: ask for another rendered frame. No-op under always/never. */
  invalidate(): void;
  /** Pause or resume advancing+rendering while a surface covers the canvas. */
  setCovered(covered: boolean): void;
  readonly covered: boolean;
  /**
   * r3f's `internal.priority`: nonzero when this canvas renders as one viewport of a
   * priority/scissored composition rather than the default target. Systems that
   * draw the scene into their own buffer (the post chain, the warmup gate) read it.
   */
  readonly renderPriority: number;
}

/** One ordered participant in the frame. Lower `priority` runs first; render happens after all. */
export interface EngineDraw {
  /** r3f `useFrame` priority: subscribers run ascending, then one render. Default 0. */
  readonly priority?: number;
  /** Once, after the scene exists and before the first frame. Add objects here. */
  mount?(state: EngineFrameState): void;
  /** Every rendered frame, in priority then registration order. */
  frame?(state: EngineFrameState): void;
  /**
   * Inputs changed outside a rendered frame. The React bridge calls this after
   * every wrapper commit so prop-driven draws do not wait for the next frame
   * under `frameloop="never"`/`"demand"`; loop hosts may call it the same way
   * when their inputs change between frames.
   */
  update?(state: EngineFrameState): void;
  /** Once, on teardown. Remove objects and free GPU resources here. */
  dispose?(state: EngineFrameState): void;
}

/** A shared per-priority task list: many small frame callbacks inside one draw (useSharedFrame's shape). */
export interface EngineFrameBoard {
  /**
   * Run `task(state, delta)` on every rendered frame at `priority`, after the
   * draws at lower priorities and before higher ones. Tasks at one priority
   * run in join order. Returns the leave; the draw unsubscribes when empty.
   */
  join(priority: number, task: (state: EngineFrameState, delta: number) => void): () => void;
}

/**
 * A frame state scoped to a subtree: draws mounted through this add their
 * objects under `parent` instead of the scene root. `scene` stays typed as
 * Scene for the renderer; only `.add`/`.remove` are used by draws.
 * `rootScene` keeps the real scene reachable for scene-level state.
 */
export function childFrameState(state: EngineFrameState, parent: THREE.Object3D): EngineFrameState {
  return { ...state, scene: parent as THREE.Scene, rootScene: state.rootScene ?? state.scene };
}

/**
 * Compose child draws under one THREE.Group: mounts each child with
 * {@link childFrameState}, forwards the group's optional frame to every
 * child's frame in order, and disposes children on teardown. Children keep
 * their own priorities for ordering against other draws.
 */
export function groupDraw(children: readonly EngineDraw[], frame?: (state: EngineFrameState) => void): EngineDraw {
  const group = new THREE.Group();
  let states: EngineFrameState[] = [];
  const priorities = children.map((child) => child.priority ?? 0);
  return {
    priority: priorities.length === 0 ? 0 : Math.min(...priorities),
    mount(state: EngineFrameState) {
      state.scene.add(group);
      states = children.map((child) => {
        const childState = childFrameState(state, group);
        child.mount?.(childState);
        return childState;
      });
    },
    frame(state: EngineFrameState) {
      frame?.(state);
      for (const child of children) child.frame?.(childFrameState(state, group));
    },
    update(state: EngineFrameState) {
      for (const child of children) child.update?.(childFrameState(state, group));
    },
    dispose(state: EngineFrameState) {
      children.forEach((child, index) => child.dispose?.(states[index] ?? state));
      state.scene.remove(group);
      states = [];
    },
  };
}

export interface EngineLoopOptions {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  /** A camera to use; created from `cameraProps`/`orthographic` when absent. */
  camera?: THREE.Camera;
  orthographic?: boolean;
  /** r3f `camera` prop values applied to the created camera. */
  cameraProps?: {
    fov?: number;
    zoom?: number;
    near?: number;
    far?: number;
  };
  frameloop?: EngineFrameloop;
  /** r3f Canvas `priority`: nonzero marks a scissored viewport render, not the default target. */
  renderPriority?: number;
  /** Rendered fps cap; 0 or undefined renders every admitted refresh. */
  fpsLimit?: number;
  /** r3f `dpr`: a number, or `[min, max]` clamping `devicePixelRatio`. */
  dpr?: number | readonly [number, number];
  /** Called once after renderer/scene/camera exist and size applied, before the first frame. */
  onCreated?: (state: EngineFrameState) => void;
}

export interface EngineLoop {
  readonly state: EngineFrameState;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly renderer: THREE.WebGLRenderer;
  /** Shared frame tasks grouped by priority (the useSharedFrame/useFrameWhile seam). */
  readonly tasks: EngineFrameBoard;
  /** Register a draw system; returns its unregister. Ordered by priority, then registration. */
  add(draw: EngineDraw): () => void;
  /** Demand mode: schedule a rendered frame. */
  invalidate(): void;
  /** Cover/uncover the canvas (menus, loading surfaces): stops advancing and drawing. */
  setCovered(covered: boolean): void;
  /** Change frameloop mode or the fps cap while running. */
  setFrameloop(mode: EngineFrameloop): void;
  setFpsLimit(fps: number): void;
  /** Run one rendered frame now (frameloop "never" drivers call this per admitted refresh). */
  advance(elapsed?: number): void;
  dispose(): void;
}

function applySize(loop: EngineLoop, canvas: HTMLCanvasElement): void {
  const { renderer, camera, state } = loop;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  renderer.setSize(width, height, false);
  state.width = width;
  state.height = height;
  state.size.width = width;
  state.size.height = height;
  // r3f's updateCamera: ortho frusta are pixel-sized (pixel-perfect convention),
  // perspective keeps an aspect. `camera.manual` rigs own their projection.
  const manual = (camera as { manual?: boolean }).manual === true;
  if (!manual && camera instanceof THREE.OrthographicCamera) {
    camera.left = width / -2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
  } else if (!manual && camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
  }
  if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera) {
    camera.updateProjectionMatrix();
  }
}

/**
 * Create the loop on an existing renderer (from `prepareEngineRenderer`'s
 * factory). The renderer's size/pixel-ratio are owned here from now on.
 */
export function createEngineLoop(options: EngineLoopOptions): EngineLoop {
  const { canvas, renderer } = options;
  const scene = options.scene ?? new THREE.Scene();
  const dpr = options.dpr;
  if (dpr !== undefined) {
    const value = typeof dpr === "number"
      ? dpr
      : THREE.MathUtils.clamp(window.devicePixelRatio, dpr[0], dpr[1]);
    renderer.setPixelRatio(value);
  }

  let camera: THREE.Camera;
  if (options.camera !== undefined) {
    camera = options.camera;
  } else if (options.orthographic === true) {
    const created = new THREE.OrthographicCamera(-1, 1, 1, -1, options.cameraProps?.near ?? 0.1, options.cameraProps?.far ?? 1000);
    if (options.cameraProps?.zoom !== undefined) created.zoom = options.cameraProps.zoom;
    created.position.z = 5;
    camera = created;
  } else {
    camera = new THREE.PerspectiveCamera(options.cameraProps?.fov ?? 75, 1, options.cameraProps?.near ?? 0.1, options.cameraProps?.far ?? 1000);
    camera.position.z = 5;
  }

  const draws: EngineDraw[] = [];
  let raf = 0;
  let disposed = false;
  let invalidated = true;
  let covered = false;
  let frameloop: EngineFrameloop = options.frameloop ?? "always";
  let fpsLimit = options.fpsLimit ?? 0;
  let paceAnchor = 0;
  let paceStart: number | null = null;
  /** Scene-clock seconds the last capped frame showed; the sim must not run slow-mo under a cap. */
  let pacedElapsed: number | null = null;
  let paceBase: number | null = null;

  const clock = new THREE.Clock();
  const size = { width: 0, height: 0 };
  const state = {
    renderer,
    gl: renderer,
    scene,
    camera,
    clock,
    size,
    elapsed: 0,
    delta: 0,
    width: 0,
    height: 0,
    get frameloop() {
      return frameloop;
    },
    invalidate() {
      if (frameloop === "demand") invalidated = true;
    },
    setCovered(next: boolean) {
      covered = next;
    },
    get covered() {
      return covered;
    },
    renderPriority: options.renderPriority ?? 0,
  } as EngineFrameState;

  function advance(elapsedOverride?: number): void {
    if (disposed || covered) return;
    if (fpsLimit > 0 && elapsedOverride !== undefined) {
      // Capped path: the caller paces refreshes, so scene time is the override,
      // not wall time — a 60 cap on 144 Hz must not slow the simulation.
      state.delta = pacedElapsed === null ? 0 : Math.max(0, elapsedOverride - pacedElapsed);
      pacedElapsed = elapsedOverride;
      state.elapsed = elapsedOverride;
      clock.elapsedTime = elapsedOverride;
    } else {
      state.delta = clock.getDelta();
      state.elapsed = clock.elapsedTime;
      pacedElapsed = null;
    }
    flushBeforeRenderTasks();
    for (const draw of draws) draw.frame?.(state);
    renderer.render(scene, camera);
    flushAfterRenderTasks();
    invalidated = false;
  }

  function frame(): void {
    if (disposed) return;
    const wants = frameloop === "always" || (frameloop === "demand" && invalidated);
    if (wants && !covered) {
      if (fpsLimit > 0) {
        const now = performance.now();
        if (paceStart === null) {
          paceStart = now;
          paceAnchor = now;
        }
        const admitted = paceFrame(now, paceAnchor, fpsLimit);
        if (admitted !== null) {
          paceAnchor = admitted;
          if (paceBase === null) paceBase = clock.elapsedTime;
          advance(paceBase + (now - paceStart) / 1000);
        }
      } else {
        advance();
      }
    }
    if (frameloop !== "never") raf = requestAnimationFrame(frame);
  }

  /** Insert keeping `draws` sorted by priority, stable within one priority. */
  function insertDraw(draw: EngineDraw): number {
    const priority = draw.priority ?? 0;
    let index = draws.length;
    while (index > 0 && (draws[index - 1]!.priority ?? 0) > priority) index -= 1;
    draws.splice(index, 0, draw);
    return index;
  }

  function removeDraw(draw: EngineDraw): void {
    const index = draws.indexOf(draw);
    if (index >= 0) draws.splice(index, 1);
  }

  const loop: EngineLoop = {
    state,
    scene,
    camera,
    renderer,
    tasks: { join: joinFrameTask },
    add(draw) {
      insertDraw(draw);
      draw.mount?.(state);
      invalidated = true;
      return () => {
        removeDraw(draw);
        draw.dispose?.(state);
      };
    },
    invalidate() {
      state.invalidate();
      invalidated = true;
    },
    setCovered(next) {
      state.setCovered(next);
      if (!next) invalidated = true;
    },
    setFrameloop(mode) {
      frameloop = mode;
      if (mode !== "never" && raf === 0 && !disposed) raf = requestAnimationFrame(frame);
      invalidated = true;
    },
    setFpsLimit(fps) {
      fpsLimit = fps;
      paceStart = null;
      paceBase = null;
      pacedElapsed = null;
      invalidated = true;
    },
    advance,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      for (const draw of draws.splice(0)) draw.dispose?.(state);
      renderer.dispose();
    },
  };

  // Resize: the canvas is styled to fill its box; track client size.
  const resize = () => applySize(loop, canvas);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  options.onCreated?.(state);
  invalidated = true;
  if (frameloop !== "never") raf = requestAnimationFrame(frame);
  // The shared board's tasks become ordered draws on this loop; files that
  // joined while the r3f pump drove re-attach here without re-subscribing.
  const source: FrameSource = (priority, run) => loop.add({
    priority,
    frame: (frameState) => run(frameState, frameState.delta),
  });
  bindFrameSource(source);
  const priorDispose = loop.dispose;
  loop.dispose = () => {
    bindFrameSource(null);
    priorDispose();
  };
  return loop;
}
