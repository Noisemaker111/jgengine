import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { chromium, type Browser } from "playwright-core";
import { chromeGraphicsArgs, findChromeExecutable } from "../../../../scripts/browser-lib";
import { SURFACE_BUMP_NORMAL_GLSL } from "./terrainSurfaceShader.draw";

setDefaultTimeout(30_000);

// Runs the shared bump chunk on a real GPU: a camera-facing quad whose shading normal lies in the
// screen plane, the frame a wet puddle's flat normal reaches when seen edge-on. Its derivative
// determinant is exactly 0, so the bump vector is zero; each pixel reports whether the normal it
// ends with is finite and unit length.
const PAGE = `<canvas id="c" width="16" height="16"></canvas><script>
window.run = (chunk) => {
  const gl = document.getElementById("c").getContext("webgl2");
  const vs = "#version 300 es\\nin vec2 p; out vec3 vViewPosition; void main() { vViewPosition = -vec3(p * 4.0, -10.0); gl_Position = vec4(p, 0.0, 1.0); }";
  const fs = "#version 300 es\\nprecision highp float; in vec3 vViewPosition; out vec4 color; void main() {" +
    " float faceDirection = 1.0; vec3 normal = vec3(1.0, 0.0, 0.0); float jgBumpH = vViewPosition.x * vViewPosition.y * 0.05;\\n" +
    chunk + "\\n color = vec4(any(isnan(normal)) || any(isinf(normal)) ? 1.0 : 0.0, abs(length(normal) - 1.0) < 0.01 ? 1.0 : 0.0, 0.0, 1.0); }";
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return { error: gl.getShaderInfoLog(shader) };
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const pixels = new Uint8Array(16 * 16 * 4);
  gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let broken = 0, unit = 0;
  for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] > 127) broken++; if (pixels[i + 1] > 127) unit++; }
  return { broken, unit };
};
</script>`;

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox", ...chromeGraphicsArgs()] });
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

test("the surface bump keeps a finite unit normal when the pixel frame is degenerate", async () => {
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const result = await page.evaluate((chunk) => (window as any).run(chunk), SURFACE_BUMP_NORMAL_GLSL);
  await page.close();
  expect(result).toEqual({ broken: 0, unit: 256 });
});
