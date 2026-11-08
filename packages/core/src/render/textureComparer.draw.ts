import * as THREE from "three";

/** Side of the square of texels one comparison fragment counts, so the readback is 1/256 of the texture. */
const COMPARE_BLOCK = 16;

/**
 * Bit-exact comparison of two textures of the same size on the GPU, for audits that prove a faster
 * path draws what the plain one would. Every channel's bits count, so a colour target differs on any
 * changed channel and a depth texture on its depth. It draws with its own GL program rather than
 * `renderer.render`, so a loading-time draw hold cannot swallow the comparison.
 * @internal
 */
export class TextureComparer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private color: WebGLTexture | null = null;
  private width = 0;
  private height = 0;
  private pixels = new Uint8Array(0);

  /**
   * Texels whose bits differ between `a` and `b`, or -1 when the comparison could not run. With a
   * `tolerance`, only texels where some channel differs by more than it count (for 8-bit targets,
   * one level is 1 / 255).
   */
  count(renderer: THREE.WebGLRenderer, a: THREE.Texture, b: THREE.Texture, width: number, height: number, tolerance = 0): number {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const textures = [a, b];
    const handles = textures.map((texture) => (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture);
    const blocksX = Math.ceil(width / COMPARE_BLOCK);
    const blocksY = Math.ceil(height / COMPARE_BLOCK);
    if (handles[0] === undefined || handles[1] === undefined || !this.prepare(gl, blocksX, blocksY)) return -1;
    const previous = renderer.getRenderTarget();
    // texelFetch reads raw depth only with comparison off, and a depth texture read that way is
    // incomplete (reads zero) unless it filters NEAREST; three's PCF maps compare and filter LINEAR.
    const setRaw = (raw: boolean) => {
      textures.forEach((texture, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, handles[unit]!);
        const compare = !raw && texture.compareFunction !== null && texture.compareFunction !== undefined;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, compare ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, raw || texture.minFilter === THREE.NearestFilter ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, raw || texture.magFilter === THREE.NearestFilter ? gl.NEAREST : gl.LINEAR);
      });
    };
    try {
      setRaw(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.viewport(0, 0, blocksX, blocksY);
      for (const capability of [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.SCISSOR_TEST, gl.CULL_FACE, gl.RASTERIZER_DISCARD]) gl.disable(capability);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program!, "a"), 0);
      gl.uniform1i(gl.getUniformLocation(this.program!, "b"), 1);
      gl.uniform2i(gl.getUniformLocation(this.program!, "size"), width, height);
      gl.uniform1f(gl.getUniformLocation(this.program!, "tolerance"), tolerance);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.readPixels(0, 0, blocksX, blocksY, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
      setRaw(false);
    } finally {
      // three caches GL state; after raw calls it must forget it all, then rebind the pass's target.
      renderer.resetState();
      renderer.setRenderTarget(previous);
    }
    let differing = 0;
    for (let index = 0; index < this.pixels.length; index += 4) {
      // A texel the comparison never wrote means it did not run: no verdict rather than a false one.
      if (this.pixels[index + 1] !== 255) return -1;
      differing += this.pixels[index]! + 256 * this.pixels[index + 2]!;
    }
    return differing;
  }

  private prepare(gl: WebGL2RenderingContext, width: number, height: number): boolean {
    // A restored context drops every object; isProgram says so.
    if (this.gl !== gl || this.program === null || !gl.isProgram(this.program)) {
      this.release();
      this.gl = gl;
      const program = linkProgram(gl, [
        "#version 300 es",
        "void main() {",
        // One triangle that covers the viewport, with no vertex buffer.
        "  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);",
        "  gl_Position = vec4(corner, 0.0, 1.0);",
        "}",
      ].join("\n"), [
        "#version 300 es",
        "precision highp float;",
        "precision highp sampler2D;",
        "uniform sampler2D a;",
        "uniform sampler2D b;",
        "uniform ivec2 size;",
        "uniform float tolerance;",
        "out vec4 outColor;",
        "void main() {",
        `  ivec2 block = ivec2(gl_FragCoord.xy) * ${COMPARE_BLOCK};`,
        "  int count = 0;",
        `  for (int y = 0; y < ${COMPARE_BLOCK}; y++) for (int x = 0; x < ${COMPARE_BLOCK}; x++) {`,
        "    ivec2 texel = block + ivec2(x, y);",
        "    if (texel.x >= size.x || texel.y >= size.y) continue;",
        "    vec4 ta = texelFetch(a, texel, 0), tb = texelFetch(b, texel, 0);",
        "    bool differs = tolerance > 0.0 ? any(greaterThan(abs(ta - tb), vec4(tolerance))) : any(notEqual(floatBitsToUint(ta), floatBitsToUint(tb)));",
        "    if (differs) count++;",
        "  }",
        // Differing texels in red (low byte) and blue (high byte); green marks every block the comparison wrote.
        "  outColor = vec4(float(count % 256) / 255.0, 1.0, float(count / 256) / 255.0, 1.0);",
        "}",
      ].join("\n"));
      if (program === null) return false;
      this.program = program;
      this.vao = gl.createVertexArray();
      this.framebuffer = gl.createFramebuffer();
      this.width = 0;
    }
    if (this.width !== width || this.height !== height) {
      if (this.color !== null) gl.deleteTexture(this.color);
      this.color = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.color);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
      this.width = width;
      this.height = height;
      this.pixels = new Uint8Array(width * height * 4);
    }
    return true;
  }

  private release(): void {
    const gl = this.gl;
    if (gl === null) return;
    if (this.program !== null) gl.deleteProgram(this.program);
    if (this.vao !== null) gl.deleteVertexArray(this.vao);
    if (this.framebuffer !== null) gl.deleteFramebuffer(this.framebuffer);
    if (this.color !== null) gl.deleteTexture(this.color);
    this.program = this.vao = this.framebuffer = this.color = null;
  }

  dispose(): void {
    this.release();
    this.gl = null;
  }
}

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram | null {
  const program = gl.createProgram();
  const shaders = ([[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const).map(([type, source]) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  for (const shader of shaders) gl.deleteShader(shader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) return program;
  gl.deleteProgram(program);
  return null;
}
