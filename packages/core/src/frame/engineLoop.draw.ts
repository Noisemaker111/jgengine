/**
 * The engine-owned frame loop: one rAF that steps an ordered list of draw
 * systems and renders a plain three.js scene. This is what r3f's Canvas +
 * useFrame gave the shell, without React: systems are registered in mount
 * order (each feature's `*.draw` file becomes one), the camera and renderer
 * are owned here, and the frameloop modes the shell used (`always`, `demand`,
 * `never` plus the fps cap and canvas cover) are first-class loop state.
 *
 * A system is anything with a per-frame `frame(state)`; `mount`/`dispose`
 * bracket its three.js objects' lifetime. Systems never see React, never see
 * the DOM, and read their own stores through closures.
 */
import * as THREE from "three";

import { paceFrame } from "../settings/frameRateLimit";

/** Frameloop modes the shell's Canvas accepted. */
export type EngineFrameloop = "always" | "demand" | "never";

/** Everything a system may read on a rendered frame. Mutable, reused per frame. */
export interface EngineFrameState {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly clock: THREE.Clock;
  /** Seconds since the loop started (r3f's `clock.elapsedTime`). */
  elapsed: number;
  /** Seconds since the previous rendered frame. */
  delta: number;
  /** Canvas CSS pixel size. */
  width: number;
  height: number;
  /** Demand mode: ask for another rendered frame. No-op under always/never. */
  invalidate(): void;
  /** Pause or resume advancing+rendering while a surface covers the canvas. */
  setCovered(covered: boolean): void;
  readonly covered: boolean;
}

/** One ordered participant in the frame. Register in the order frames should run. */
export interface EngineDraw {
  /** Once, after the scene exists and before the first frame. Add objects here. */
  mount?(state: EngineFrameState): void;
  /** Every rendered frame, in registration order. */
  frame(state: EngineFrameState): void;
  /** Once, on teardown. Remove objects and free GPU resources here. */
  dispose?(state: EngineFrameState): void;
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
  /** Register a draw system; returns its unregister. Later registrations run later. */
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

  const clock = new THREE.Clock();
  const state = {
    renderer,
    scene,
    camera,
    clock,
    elapsed: 0,
    delta: 0,
    width: 0,
    height: 0,
    invalidate() {
      if (frameloop === "demand") invalidated = true;
    },
    setCovered(next: boolean) {
      covered = next;
    },
    get covered() {
      return covered;
    },
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
    for (const draw of draws) draw.frame?.(state);
    renderer.render(scene, camera);
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
          const base = pacedStartBase();
          advance(base + (now - paceStart) / 1000);
        }
      } else {
        advance();
      }
    }
    if (frameloop !== "never") raf = requestAnimationFrame(frame);
  }

  let paceBase: number | null = null;
  function pacedStartBase(): number {
    if (paceBase === null) paceBase = clock.elapsedTime;
    return paceBase;
  }

  const loop: EngineLoop = {
    state,
    scene,
    camera,
    renderer,
    add(draw) {
      draws.push(draw);
      draw.mount?.(state);
      invalidated = true;
      return () => {
        const index = draws.indexOf(draw);
        if (index >= 0) draws.splice(index, 1);
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
  return loop;
}
