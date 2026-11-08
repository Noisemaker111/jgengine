// @skill jgengine-world
/**
 * The engine's renderer for a game canvas. three's WebGLRenderer draws every backend, so scenes,
 * materials and shaders stay the same; the `webgpu` backend hands it a WebGL-shaped context that
 * submits through WebGPU ({@link WebGpuGl}). Where WebGPU is missing it falls back to WebGL.
 */
import { WebGLRenderer, type WebGLRendererParameters } from "three";
import { guardInstanceCounts } from "../instancing/instanceCountGuard.draw";
import type { RendererBackend } from "../settings/rendererBackend";
import { loadGlslTranslator } from "./glslToWgsl.draw";
import { createWebGpuGl, type WebGpuGl } from "./webgpuGl.draw";

const backends = new WeakMap<WebGLRenderer, { backend: RendererBackend; webgpu: WebGpuGl | null }>();

/** Which backend actually draws `renderer` (`webgl` for one this module did not make). */
export function rendererBackendOf(renderer: WebGLRenderer): RendererBackend {
  return backends.get(renderer)?.backend ?? "webgl";
}

/** The WebGPU context behind `renderer`, for counters and diagnostics; `null` on WebGL. */
export function webGpuContextOf(renderer: WebGLRenderer): WebGpuGl | null {
  return backends.get(renderer)?.webgpu ?? null;
}

/** React Three Fiber's `gl` factory for `backend`. */
export function engineRendererFactory(backend: RendererBackend): (defaults: WebGLRendererParameters) => Promise<WebGLRenderer> {
  return async (defaults) => {
    const params: WebGLRendererParameters = { ...defaults, powerPreference: "high-performance" };
    const canvas = defaults.canvas;
    if (backend === "webgpu" && typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
      try {
        await loadGlslTranslator();
        const gl = await createWebGpuGl(canvas, {
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
        console.warn("[jgengine] WebGPU is not available here; drawing with WebGL");
      } catch (error) {
        console.warn(`[jgengine] WebGPU did not start (${error instanceof Error ? error.message : String(error)}); drawing with WebGL`);
      }
    }
    const renderer = new WebGLRenderer(params);
    backends.set(renderer, { backend: "webgl", webgpu: null });
    guardInstanceCounts(renderer);
    return renderer;
  };
}
