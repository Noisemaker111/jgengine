// @skill jgengine-world
/**
 * The engine's renderer for a game canvas. three's WebGLRenderer draws every backend, so scenes,
 * materials and shaders stay the same; the `webgpu` backend hands it a WebGL-shaped context that
 * submits through WebGPU ({@link WebGpuGl}). Where WebGPU is missing it falls back to WebGL.
 *
 * The canvas factory is synchronous: the shader translator, adapter and device are prepared by
 * {@link prepareEngineRenderer} before the canvas mounts ({@link useEngineRendererFactory}).
 * Preparing first prevents overlapping initialization from creating duplicate scenes, renderers
 * or cameras before the canvas size is known.
 */
import { useEffect, useState } from "@jgengine/core/ui/jsx";
import { WebGLRenderer, type WebGLRendererParameters } from "three";
import { guardInstanceCounts } from "../instancing/instanceCountGuard.draw";
import type { RendererBackend } from "../settings/rendererBackend";
import { loadGlslTranslator } from "./glslToWgsl.draw";
import { createWebGpuGl, requestWebGpuDevice, type WebGpuDevice, type WebGpuGl } from "./webgpuGl.draw";

const backends = new WeakMap<WebGLRenderer, { backend: RendererBackend; webgpu: WebGpuGl | null }>();

/** Which backend actually draws `renderer` (`webgl` for one this module did not make). */
export function rendererBackendOf(renderer: WebGLRenderer): RendererBackend {
  return backends.get(renderer)?.backend ?? "webgl";
}

/** The WebGPU context behind `renderer`, for counters and diagnostics; `null` on WebGL. */
export function webGpuContextOf(renderer: WebGLRenderer): WebGpuGl | null {
  return backends.get(renderer)?.webgpu ?? null;
}

/** Renderer factory for one engine canvas mount; it never awaits. */
export interface EngineRendererFactory {
  (defaults: WebGLRendererParameters): WebGLRenderer;
  /** The backend that was asked for (the renderer may still fall back to WebGL). */
  readonly backend: RendererBackend;
  /** Destroy the prepared WebGPU device if no canvas took it. */
  release(): void;
}

/**
 * Do the asynchronous part of starting `backend` (on WebGPU: the shader translator and one device)
 * and return the synchronous factory for one canvas. The device belongs to the first canvas the
 * factory draws on, and that canvas's context loss destroys it.
 */
export async function prepareEngineRenderer(backend: RendererBackend): Promise<EngineRendererFactory> {
  let gpu: WebGpuDevice | null = null;
  if (backend === "webgpu" && typeof HTMLCanvasElement !== "undefined") {
    try {
      await loadGlslTranslator();
      gpu = await requestWebGpuDevice("high-performance");
      if (gpu === null) console.warn("[jgengine] WebGPU is not available here; drawing with WebGL");
    } catch (error) {
      console.warn(`[jgengine] WebGPU did not start (${error instanceof Error ? error.message : String(error)}); drawing with WebGL`);
    }
  }
  let taken = false;
  // Repeated requests for the same canvas reuse its renderer and context.
  const made = new WeakMap<object, WebGLRenderer>();
  const create = (defaults: WebGLRendererParameters): WebGLRenderer => {
    const params: WebGLRendererParameters = { ...defaults, powerPreference: "high-performance" };
    const canvas = defaults.canvas;
    if (gpu !== null && canvas instanceof HTMLCanvasElement) {
      if (taken) {
        console.warn("degraded: a second canvas asked for one prepared WebGPU device; drawing it with WebGL (mount each canvas through useEngineRendererFactory)");
      } else {
        taken = true;
        const gl = createWebGpuGl(canvas, gpu, {
          alpha: params.alpha ?? false,
          antialias: params.antialias ?? false,
          depth: params.depth ?? true,
          stencil: params.stencil ?? false,
          premultipliedAlpha: params.premultipliedAlpha ?? true,
          preserveDrawingBuffer: params.preserveDrawingBuffer ?? false,
          powerPreference: "high-performance",
        });
        if (gl !== null) {
          const renderer = new WebGLRenderer({ ...params, context: gl as unknown as WebGL2RenderingContext });
          backends.set(renderer, { backend: "webgpu", webgpu: gl });
          guardInstanceCounts(renderer);
          // Perf verbs and probes read its counters here.
          (globalThis as { __jgWebGpu?: WebGpuGl }).__jgWebGpu = gl;
          return renderer;
        }
        gpu.device.destroy();
        console.warn("[jgengine] the canvas gave no WebGPU context; drawing with WebGL");
      }
    }
    const renderer = new WebGLRenderer(params);
    backends.set(renderer, { backend: "webgl", webgpu: null });
    guardInstanceCounts(renderer);
    return renderer;
  };
  const factory = (defaults: WebGLRendererParameters): WebGLRenderer => {
    const canvas = defaults.canvas;
    const known = canvas === undefined ? undefined : made.get(canvas);
    if (known !== undefined) return known;
    const renderer = create(defaults);
    if (canvas !== undefined) made.set(canvas, renderer);
    return renderer;
  };
  return Object.assign(factory, {
    backend,
    release: () => {
      if (gpu !== null && !taken) gpu.device.destroy();
      taken = true;
    },
  });
}

/**
 * The renderer factory for `backend`, or `null` while it is being prepared. Mount the canvas only
 * once it is non-null and its `backend` matches, keyed by that backend, so each canvas mount gets its
 * own prepared device.
 */
export function useEngineRendererFactory(backend: RendererBackend): EngineRendererFactory | null {
  const [factory, setFactory] = useState<EngineRendererFactory | null>(null);
  useEffect(() => {
    let live = true;
    let prepared: EngineRendererFactory | null = null;
    void prepareEngineRenderer(backend).then((ready) => {
      prepared = ready;
      if (live) setFactory(() => ready);
      else ready.release();
    });
    return () => {
      live = false;
      // A device no canvas took is freed; one a canvas took is destroyed by that canvas's context loss.
      prepared?.release();
    };
  }, [backend]);
  return factory !== null && factory.backend === backend ? factory : null;
}
