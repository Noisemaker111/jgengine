/** The part of a three.js `WebGLRenderer` the bench wraps. */
interface Renderer {
  render(scene: never, camera: never): void;
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
}

declare global {
  interface Window { bench?: { firstFrameMs: number; renders: number[]; renderCount(): number } }
}

/**
 * Times every `renderer.render` call (with the GPU flushed by a one-pixel read, so the time covers
 * the draw, not just queuing it) and publishes the first frame's time since navigation start.
 */
export function exposeBench(renderer: Renderer, ready: Promise<void>): void {
  const renders: number[] = [];
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const render = renderer.render.bind(renderer);
  let count = 0;
  renderer.render = (scene, camera) => {
    const start = performance.now();
    render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    renders.push(performance.now() - start);
    count += 1;
  };
  // A frame drawn before this wrap (the plain page draws while setting up) still counts as first.
  const firstDrawn = count > 0 ? Promise.resolve() : ready;
  void firstDrawn.then(() => {
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    window.bench = { firstFrameMs: performance.now(), renders, renderCount: () => count };
  });
}
