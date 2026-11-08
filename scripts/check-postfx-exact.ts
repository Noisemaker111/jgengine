import { postfxExactSources } from "../packages/core/src/postfx/exactSources.draw";
import { openPageSession, withBrowserSession } from "./browser-lib";

/**
 * Proves on this PC's GPU that the post chain's merged draws write the bits of the draws they replace.
 *
 *   bun run check postfx-exact
 *
 * Headless Chrome draws random HDR frames both ways, with the engine's real shader sources, and
 * compares every channel:
 * - the half-precision helpers against the GPU's own target write and multiply blend, bit for bit;
 * - `SceneCompositePass` against the beauty copy, three's GTAO blend and the contact-shadow apply, in
 *   every combination, bit for bit;
 * - `GradePass` doing the OutputPass's work against the OutputPass then the grade, on the 8-bit screen,
 *   for each of three's tone mappings. Inside the larger shader the GPU compiler may order the tone
 *   map's arithmetic differently, so a channel may differ by one level (of 255) on at most 1 channel
 *   in 1000. On the RTX 3070 ACES, Neutral and Reinhard match exactly and AgX, Cineon and Linear
 *   differ on at most 1 channel in 6000, far under the grade's own per-frame film grain.
 * It needs a GPU, so it runs only on demand (no CI job); the PR that changes a merged pass runs it
 * and quotes it.
 */

interface CaseResult {
  name: string;
  channels: number;
  differing: number;
  /** Largest difference of one channel, in the target's own units (half bits or 8-bit levels). */
  largest: number;
  sample: string | null;
  /** The most a channel may differ, and the share of channels that may, when not every bit must match. */
  allowance: { largest: number; share: number } | null;
}

const PAGE = String.raw`(async (sources) => {
  const W = 333, H = 217, AW = Math.round(W / 2), AH = Math.round(H / 2);
  const gl = document.createElement("canvas").getContext("webgl2");
  if (gl === null || gl.getExtension("EXT_color_buffer_float") === null) return "no WebGL 2 with float targets";
  let seed = 20261108;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  // Round-to-nearest-even half bits of a finite float, for building half textures.
  const toHalf = (v) => {
    f32[0] = v; const x = u32[0]; const sign = (x >>> 16) & 0x8000; const e = ((x >>> 23) & 255) - 112; let m = x & 0x7fffff;
    if (e <= 0) { if (e < -10) return sign; m |= 0x800000; const shift = 14 - e; let h = m >>> shift; const rem = m & ((1 << shift) - 1), half = 1 << (shift - 1); if (rem > half || (rem === half && (h & 1))) h++; return sign | h; }
    if (e >= 31) return sign | 0x7bff;
    let h = (e << 10) | (m >>> 13); const rem = m & 0x1fff; if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h++; return sign | h;
  };
  const texture = (w, h, internal, format, type, data, filter) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  // HDR colour with a few very bright and very dark channels; alpha mostly one.
  const beautyBits = new Uint16Array(W * H * 4), aoBits = new Uint16Array(AW * AH * 4), shadow = new Uint8Array(W * H * 4), wide = new Float32Array(W * H * 4);
  for (let i = 0; i < beautyBits.length; i++) beautyBits[i] = toHalf(i % 4 === 3 ? (rand() < 0.5 ? 1 : rand()) : rand() < 0.1 ? rand() * 200 : rand() < 0.1 ? rand() * 1e-4 : rand() * 4);
  for (let i = 0; i < aoBits.length; i++) aoBits[i] = toHalf(rand() < 0.3 ? 1 : rand());
  for (let i = 0; i < shadow.length; i++) shadow[i] = rand() < 0.5 ? 255 : Math.floor(rand() * 256);
  for (let i = 0; i < wide.length; i++) { const r = rand(); wide[i] = (rand() < 0.5 ? -1 : 1) * (r < 0.05 ? rand() * 1e5 : r < 0.15 ? rand() * 1e-5 : r < 0.2 ? rand() * 1e-8 : rand() * 70); }
  const beauty = texture(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, beautyBits, gl.LINEAR);
  const ao = texture(AW, AH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, aoBits, gl.LINEAR);
  const contact = texture(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, shadow, gl.NEAREST);
  const wideTexture = texture(W, H, gl.RGBA32F, gl.RGBA, gl.FLOAT, wide, gl.NEAREST);
  // three's FullScreenQuad is one triangle with uv 0..2; three-stdlib's (the beauty copy, the contact
  // apply) is PlaneGeometry(2, 2). Both draw with an orthographic camera that maps them unchanged.
  const attribute = (location, data, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0); };
  const triangleVao = gl.createVertexArray();
  gl.bindVertexArray(triangleVao);
  attribute(0, [-1, 3, 0, -1, -1, 0, 3, -1, 0], 3);
  attribute(1, [0, 2, 0, 0, 2, 0], 2);
  const planeVao = gl.createVertexArray();
  gl.bindVertexArray(planeVao);
  attribute(0, [-1, 1, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0], 3);
  attribute(1, [0, 1, 1, 1, 0, 0, 1, 0], 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 2, 1, 2, 3, 1]), gl.STATIC_DRAW);
  const drawPlane = () => { gl.bindVertexArray(planeVao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); gl.bindVertexArray(triangleVao); };
  gl.bindVertexArray(triangleVao);
  // What three prepends on WebGL 2: a ShaderMaterial gets precision, the built-in attributes and
  // uniforms and the colour-space functions; a RawShaderMaterial (the OutputPass) only the GLSL 1 names.
  const compat = { vertex: "#define attribute in\n#define varying out\n#define texture2D texture\n", fragment: "#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n" };
  const builtIns = { vertex: "precision highp float;\nprecision highp int;\nin vec3 position;\nin vec2 uv;\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\n", fragment: "precision highp float;\nprecision highp int;\nprecision highp sampler2D;\n" };
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const program = (fragment, options = {}) => {
    const defines = Object.keys(options.defines ?? {}).map((name) => "#define " + name + "\n").join("");
    const vertex = "#version 300 es\n" + defines + (options.raw ? compat.vertex : builtIns.vertex + compat.vertex) + (options.vertex ?? sources.vertex);
    const fragmentSource = "#version 300 es\n" + defines + (options.raw ? compat.fragment : builtIns.fragment + compat.fragment + sources.colorspacePars) + fragment;
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, "position");
    gl.bindAttribLocation(p, 1, "uv");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, "projectionMatrix"), false, identity);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, "modelViewMatrix"), false, identity);
    return p;
  };
  const bind = (p, name, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(p, name), unit); };
  const target = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return fb;
  };
  const read = () => { const out = new Uint16Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.HALF_FLOAT, out); return out; };
  const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.viewport(0, 0, W, H);
  const results = [];
  const compare = (name, expected, actual, allowance = null) => {
    let differing = 0, largest = 0, sample = null;
    for (let i = 0; i < expected.length; i++) if (expected[i] !== actual[i]) {
      differing++;
      largest = Math.max(largest, Math.abs(expected[i] - actual[i]));
      sample ??= "channel " + i + ": " + expected[i].toString(16) + " vs " + actual[i].toString(16);
    }
    results.push({ name, channels: expected.length, differing, largest, sample, allowance });
  };

  // The helpers: rtz16 against the target write, rne16(dst * rtz16(src)) against a multiply blend.
  const pass = program("uniform sampler2D tWide; void main() { gl_FragColor = texelFetch(tWide, ivec2(gl_FragCoord.xy), 0); }");
  target(); bind(pass, "tWide", 0, wideTexture); draw(); const written = read();
  const rtz = program(sources.half + "uniform sampler2D tWide; void main() { gl_FragColor = rtz16(texelFetch(tWide, ivec2(gl_FragCoord.xy), 0)); }");
  target(); bind(rtz, "tWide", 0, wideTexture); draw(); compare("rtz16 = half-float target write", written, read());
  const copyBeauty = program("uniform sampler2D tDiffuse; void main() { gl_FragColor = texelFetch(tDiffuse, ivec2(gl_FragCoord.xy), 0); }");
  const scaledWide = program("uniform sampler2D tWide; void main() { gl_FragColor = texelFetch(tWide, ivec2(gl_FragCoord.xy), 0) * 0.01; }");
  target(); gl.useProgram(copyBeauty); bind(copyBeauty, "tDiffuse", 0, beauty); draw();
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  gl.useProgram(scaledWide); bind(scaledWide, "tWide", 0, wideTexture); draw(); gl.disable(gl.BLEND); const blended = read();
  const rne = program(sources.half + "uniform sampler2D tDiffuse, tWide; void main() { ivec2 p = ivec2(gl_FragCoord.xy); vec4 d = texelFetch(tDiffuse, p, 0); vec4 s = rtz16(texelFetch(tWide, p, 0) * 0.01); gl_FragColor = vec4(rne16(d.rgb * s.rgb), rne16(vec3(d.a * s.a)).x); }");
  target(); bind(rne, "tDiffuse", 0, beauty); bind(rne, "tWide", 1, wideTexture); draw(); compare("rne16 = multiply blend", blended, read());

  // The composite against the draws it replaces.
  const copy = program(sources.beautyCopy);
  const aoBlend = program(sources.aoBlend);
  const apply = program(sources.contactApply);
  const composite = program(sources.composite);
  for (const [name, withAo, withShadow] of [["composite = beauty copy", false, false], ["composite = copy + GTAO blend", true, false], ["composite = copy + contact apply", false, true], ["composite = copy + GTAO blend + contact apply", true, true]]) {
    target(); gl.useProgram(copy); bind(copy, "tDiffuse", 0, beauty); drawPlane();
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    if (withAo) { gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.DST_ALPHA, gl.ZERO); gl.useProgram(aoBlend); bind(aoBlend, "tDiffuse", 0, ao); gl.uniform1f(gl.getUniformLocation(aoBlend, "intensity"), 1); draw(); }
    if (withShadow) { gl.blendFunc(gl.DST_COLOR, gl.ZERO); gl.useProgram(apply); bind(apply, "tShadow", 0, contact); drawPlane(); }
    gl.disable(gl.BLEND);
    const expected = read();
    target(); gl.useProgram(composite);
    bind(composite, "tBeauty", 0, beauty); bind(composite, "tAo", 1, ao); bind(composite, "tShadow", 2, contact);
    gl.uniform1i(gl.getUniformLocation(composite, "uAo"), withAo ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(composite, "uShadow"), withShadow ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(composite, "uIntensity"), 1);
    draw();
    compare(name, expected, read());
  }
  // The grade doing the OutputPass's work, against the OutputPass into a half-float target and the
  // grade from it, compared on the 8-bit screen the grade draws to.
  const target8 = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { fb, t };
  };
  const read8 = () => { const out = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out); return out; };
  const gradeUniforms = (p, exposure) => {
    const set = (name, f, ...v) => { const at = gl.getUniformLocation(p, name); if (at !== null) gl[f](at, ...v); };
    set("uLift", "uniform3f", 0.012, 0.01, 0.018); set("uGain", "uniform3f", 1.05, 1.02, 0.98); set("uGamma", "uniform1f", 0.96);
    set("uSaturation", "uniform1f", 1.12); set("uVignette", "uniform1f", 0.2); set("uGrain", "uniform1f", 0.012); set("uChroma", "uniform1f", 0);
    set("uTime", "uniform1f", 12.375); set("uLutSize", "uniform1f", 0); set("toneMappingExposure", "uniform1f", exposure);
  };
  const tones = [["ACES_FILMIC_TONE_MAPPING", 1], ["AGX_TONE_MAPPING", 1], ["AGX_TONE_MAPPING", 1.40625], ["NEUTRAL_TONE_MAPPING", 0.8125], ["REINHARD_TONE_MAPPING", 1], ["CINEON_TONE_MAPPING", 1], ["LINEAR_TONE_MAPPING", 0.5]];
  for (const [toneMapping, exposure] of tones) {
    const defines = { [toneMapping]: "", SRGB_TRANSFER: "" };
    const output = program(sources.outputFragment, { raw: true, vertex: sources.outputVertex, defines });
    target(); bind(output, "tDiffuse", 0, beauty); gl.uniform1f(gl.getUniformLocation(output, "toneMappingExposure"), exposure); draw();
    const tonedTexture = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
    gl.bindTexture(gl.TEXTURE_2D, tonedTexture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const plain = program(sources.gradeFragment, { vertex: sources.gradeVertex });
    target8(); gradeUniforms(plain, exposure); bind(plain, "tDiffuse", 0, tonedTexture); drawPlane(); const expected = read8();
    const fused = program(sources.gradeFragment, { vertex: sources.gradeVertex, defines: { FUSED_OUTPUT: "", ...defines } });
    target8(); gradeUniforms(fused, exposure); bind(fused, "tDiffuse", 0, beauty); drawPlane();
    const label = toneMapping.toLowerCase().replace(/_tone_mapping$/, "") + ", exposure " + exposure;
    compare("grade with OutputPass (" + label + ") = OutputPass then grade", expected, read8(), { largest: 1, share: 0.001 });
  }

  const error = gl.getError();
  return error === 0 ? results : "GL error " + error;
})`;

const sources = postfxExactSources();

const exit = await withBrowserSession({ keep: false, timeoutMs: 120_000 }, async ({ debugPort }) => {
  const session = await openPageSession(debugPort);
  await session.send("Runtime.enable");
  const result = await session.evaluate<CaseResult[] | string>(`${PAGE}(${JSON.stringify(sources)})`, { awaitPromise: true });
  if (typeof result === "string") {
    console.error(`postfx-exact: could not run: ${result}`);
    return 1;
  }
  let failed = 0;
  for (const row of result) {
    const allowed = row.differing === 0 || (row.allowance !== null && row.largest <= row.allowance.largest && row.differing / row.channels <= row.allowance.share);
    const verdict = row.differing === 0 ? "same bits" : `${row.differing} differing, by at most ${row.largest} (${row.sample})${allowed ? ", within its allowance" : ""}`;
    console.log(`postfx-exact: ${row.name}: ${verdict} over ${row.channels} channels`);
    if (!allowed) failed += 1;
  }
  return failed === 0 ? 0 : 1;
});
process.exit(exit);
