import { describe, expect, test } from "bun:test";
import { loadGlslTranslator, translateGlsl } from "./glslToWgsl.draw";
import { DRAW_ID_INPUT, failingLine, WebGpuGl, withDrawIdInput } from "./webgpuGl.draw";

test("a translation error quotes the GLSL line it names", () => {
  const shaders = [{ type: 0x8b31, source: "void main() {}" }, { type: 0x8b30, source: "a\nb\n  float x = 1.0 * * 2.0;\n" }];
  expect(failingLine("Fragment line 3: Expected LeftParen, found Star", shaders)).toBe(" (at: float x = 1.0 * * 2.0;)");
  expect(failingLine("something else", shaders)).toBe("");
});

// A stand-in GPU device: every object answers any call, and buffer maps resolve only when the test
// says the GPU has caught up, so the order of fence and readback can be checked without a GPU.
function stubDevice(options: { features?: string[]; mapped?: (size: number) => ArrayBuffer } = {}) {
  const pendingMaps: (() => void)[] = [];
  const passes: { timestampWrites?: { beginningOfPassWriteIndex: number; endOfPassWriteIndex: number } }[] = [];
  /** Every call made on a render pass, in order. */
  const calls: [string, unknown[]][] = [];
  const views: { baseMipLevel?: number }[] = [];
  const buffers: { size: number; usage: number }[] = [];
  const anything = (): any => new Proxy(function () {}, {
    get: (_t, key) => (key === "then" ? undefined : anything()),
    apply: () => anything(),
  });
  const buffer = (size: number) => ({
    size,
    mapAsync: () => new Promise<void>((resolve) => { pendingMaps.push(resolve); }),
    getMappedRange: () => options.mapped?.(size) ?? new ArrayBuffer(size),
    unmap() {},
    destroy() {},
  });
  const device: any = new Proxy({
    features: new Set<string>(options.features ?? []),
    createCommandEncoder: () => new Proxy({
      beginRenderPass: (desc: (typeof passes)[number]) => {
        passes.push(desc);
        return new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : (...args: unknown[]) => { calls.push([String(key), args]); return anything(); }) });
      },
    }, { get: (t: any, k) => t[k] ?? anything() }),
    limits: { minUniformBufferOffsetAlignment: 256, maxTextureDimension2D: 8192, maxVertexBuffers: 8 },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => { buffers.push({ size, usage }); return buffer(size); },
    createTexture: (desc: { format: string; size: number[] | { width: number; height: number }; sampleCount?: number; mipLevelCount?: number }) => ({
      format: desc.format,
      sampleCount: desc.sampleCount ?? 1,
      mipLevelCount: desc.mipLevelCount ?? 1,
      createView(view: { baseMipLevel?: number } = {}) { views.push(view); return anything(); },
      destroy() {},
    }),
    queue: new Proxy({ onSubmittedWorkDone: () => new Promise(() => {}) }, { get: (t: any, k) => t[k] ?? anything() }),
    destroy() {},
  }, { get: (t: any, k) => t[k] ?? anything() });
  return { device, views, passes, calls, buffers, landAllMaps: () => { for (const resolve of pendingMaps.splice(0)) resolve(); } };
}

function stubContext(width = 64, height = 64, features: string[] = []) {
  stubGlobals();
  const stub = stubDevice({ features });
  const canvas = { width, height } as HTMLCanvasElement;
  const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) } as unknown as GPUCanvasContext;
  return { ...stub, gl: new WebGpuGl(canvas, stub.device, context, {}, "stub") as any };
}

function stubGlobals(): void {
  const g = globalThis as any;
  g.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128 };
  g.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  g.GPUMapMode ??= { READ: 1, WRITE: 2 };
  if (g.navigator?.gpu === undefined) Object.defineProperty(g, "navigator", { configurable: true, value: { ...g.navigator, gpu: { getPreferredCanvasFormat: () => "bgra8unorm" } } });
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
/** End the open pass and encode every ended one: passes reach the encoder only when work after them needs it. */
const encodePasses = (gl: any) => { gl.endPass(); gl.encodeEnded(); };

describe("WebGpuGl readback fences", () => {
  test("a fence made right after readPixels signals only once that readback has landed (autoExposure's pattern)", async () => {
    stubGlobals();
    const { device, landAllMaps } = stubDevice();
    const canvas = { width: 64, height: 64 } as HTMLCanvasElement;
    const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({}) } as unknown as GPUCanvasContext;
    const gl = new WebGpuGl(canvas, device, context, {}, "stub") as any;

    const tex = gl.createTexture();
    gl.bindTexture(0x0de1, tex);
    gl.texStorage2D(0x0de1, 1, 0x8058, 16, 16); // RGBA8
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(0x8ca8, fb); // READ_FRAMEBUFFER
    gl.framebufferTexture2D(0x8ca8, 0x8ce0, 0x0de1, tex, 0);
    const pbo = gl.createBuffer();
    gl.bindBuffer(0x88eb, pbo); // PIXEL_PACK_BUFFER
    gl.bufferData(0x88eb, 16 * 16 * 4, 0x88e1);

    gl.readPixels(0, 0, 16, 16, 0x1908, 0x1401, 0);
    const sync = gl.fenceSync(0x9117, 0);
    gl.finish(); // submits the batch
    await flushPromises();
    expect(gl.clientWaitSync(sync, 0, 0)).toBe(0x911b); // TIMEOUT_EXPIRED: the read has not landed

    landAllMaps();
    await flushPromises();
    expect(gl.clientWaitSync(sync, 0, 0)).toBe(0x911a); // ALREADY_SIGNALED
    expect(gl.stats.reads).toBe(1);
    expect([...gl.warnings.keys()]).toEqual([]);
  });

  test("a fence with no readback before it signals as soon as its batch is submitted", async () => {
    stubGlobals();
    const { device } = stubDevice();
    const canvas = { width: 8, height: 8 } as HTMLCanvasElement;
    const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({}) } as unknown as GPUCanvasContext;
    const gl = new WebGpuGl(canvas, device, context, {}, "stub") as any;
    const sync = gl.fenceSync(0x9117, 0);
    expect(gl.clientWaitSync(sync, 0, 0)).toBe(0x911b);
    gl.finish();
    expect(gl.clientWaitSync(sync, 0, 0)).toBe(0x911a);
  });

  test("loseContext from three's forceContextLoss destroys the device and reports the context lost", () => {
    stubGlobals();
    const { device } = stubDevice();
    let destroyed = 0;
    device.destroy = () => { destroyed += 1; };
    const canvas = { width: 8, height: 8 } as HTMLCanvasElement;
    const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({}) } as unknown as GPUCanvasContext;
    const gl = new WebGpuGl(canvas, device, context, {}, "stub") as any;
    expect(gl.isContextLost()).toBe(false);
    gl.getExtension("WEBGL_lose_context").loseContext();
    gl.getExtension("WEBGL_lose_context").loseContext();
    expect(gl.isContextLost()).toBe(true);
    expect(destroyed).toBe(1);
  });
});

describe("WebGpuGl as three sees it", () => {
  test("WEBGL_multi_draw is offered with the two calls three makes, so a BatchedMesh draws in one call", () => {
    const { gl } = stubContext();
    expect(gl.getSupportedExtensions()).toContain("WEBGL_multi_draw");
    const ext = gl.getExtension("WEBGL_multi_draw");
    expect(typeof ext.multiDrawElementsWEBGL).toBe("function");
    expect(typeof ext.multiDrawArraysWEBGL).toBe("function");
  });

  test("a BatchedMesh vertex shader reads gl_DrawID from an integer input, with every line where it was", async () => {
    // Without a value for gl_DrawID every item would draw with the first item's matrix (Harbor
    // Heat's palms, plants and awnings stacked in one place). The shape of three's batching chunk.
    const vs = [
      "#version 300 es",
      "#extension GL_ANGLE_multi_draw : require",
      "precision highp float;",
      "precision highp int;",
      "#if ! defined( GL_ANGLE_multi_draw )",
      "#define gl_DrawID _gl_DrawID",
      "uniform int _gl_DrawID;",
      "#endif",
      "uniform highp sampler2D batchingTexture;",
      "mat4 getBatchingMatrix( const in float i ) {",
      "  vec4 v = texelFetch( batchingTexture, ivec2( int( i ) * 4, 0 ), 0 );",
      "  return mat4( v, v, v, v );",
      "}",
      "uniform mat4 projectionMatrix;",
      "in vec3 position;",
      "void main() { gl_Position = projectionMatrix * getBatchingMatrix( float( gl_DrawID ) ) * vec4( position, 1.0 ); }",
    ].join("\n");
    const fs = "#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { color = vec4(1.0); }";
    const rewritten = withDrawIdInput(vs);
    expect(rewritten.split("\n").length).toBe(vs.split("\n").length);
    expect(withDrawIdInput(fs)).toBe(fs);
    await loadGlslTranslator(new URL("./glslToWgsl.wasm", import.meta.url));
    const result = translateGlsl(rewritten, fs);
    if (!("ok" in result)) throw new Error(result.error);
    expect(result.ok.layout.vertex_inputs.find((input) => input.name === DRAW_ID_INPUT)?.kind).toBe("i");
    expect(result.ok.layout.uniforms.map((u) => u.name)).not.toContain("_gl_DrawID");
  });

  test("a one-element shadow sampler array translates and is marked as an array, so three binds its depth texture (Deepward's spot light)", async () => {
    const vs = "#version 300 es\nin vec3 position;\nout vec2 vUv;\nvoid main() { vUv = position.xy; gl_Position = vec4(position, 1.0); }";
    const fs = [
      "#version 300 es",
      "precision highp float;",
      "precision highp sampler2DShadow;",
      "in vec2 vUv;",
      "out vec4 color;",
      "uniform sampler2DShadow spotShadowMap[ 1 ];",
      "float getShadow( sampler2DShadow shadowMap, vec3 coord ) { return texture( shadowMap, coord ); }",
      "void main() { color = vec4( getShadow( spotShadowMap[ 0 ], vec3( vUv, 0.5 ) ) ); }",
    ].join("\n");
    await loadGlslTranslator(new URL("./glslToWgsl.wasm", import.meta.url));
    const result = translateGlsl(vs, fs);
    if (!("ok" in result)) throw new Error(result.error);
    expect(result.ok.layout.samplers.map((s) => [s.name, s.kind, s.array])).toEqual([["spotShadowMap", "Depth", true]]);
  });
});

// A linked one-sampler program without the naga translation, and a draw with no vertex buffers:
// what the cache decides is which of bindGroupFor / pipelineFor a draw had to run again.
const drawSetup = (features: string[] = []) => {
  const { gl, passes, calls } = stubContext(64, 64, features);
  const program = {
    kind: "program", id: 900, shaders: [], linked: true, log: "", pending: null, compiled: true,
    translated: { layout: { samplers: [{ kind: "Float", dim: "D2", texture_binding: 0, sampler_binding: 1 }], fragment_outputs: 1 } },
    vertex: {}, fragment: {}, uniforms: new Map(), samplerIndex: new Map(), active: [], attribs: [],
    bytes: new Uint8Array(256), blockSize: 16, dirty: true, slotBatch: -1, slotOffset: 0,
    units: new Int32Array(1), layouts: new Map(), vertexCache: new WeakMap(), textureSets: new Map(), lastTextures: null, pipelineSets: new Map(),
  };
  gl.program = program;
  const plan = { id: 901, key: "none", slots: [], constants: [], instanceCapacity: (n: number) => n };
  gl.vertexPlan = () => plan;
  const groups: unknown[] = [];
  const bindGroupFor = gl.bindGroupFor.bind(gl);
  gl.bindGroupFor = (p: unknown, sig: string, list: unknown[]) => { groups.push(list[0]); return bindGroupFor(p, sig, list); };
  let pipelines = 0;
  const pipelineFor = gl.pipelineFor.bind(gl);
  gl.pipelineFor = (...args: unknown[]) => { pipelines += 1; return pipelineFor(...args); };
  const texture = () => {
    const t = gl.createTexture();
    gl.bindTexture(0x0de1, t);
    gl.texStorage2D(0x0de1, 1, 0x8058, 4, 4);
    return t;
  };
  return { gl, passes, calls, groups, pipelines: () => pipelines, texture, draw: () => gl.drawArrays(4, 0, 3) };
};

describe("WebGpuGl uniforms", () => {
  test("scalar uniform calls land in the block, and an unchanged value leaves it clean", () => {
    const { gl } = drawSetup();
    const p = gl.program;
    const block = new ArrayBuffer(64);
    Object.assign(p, { block, f32: new Float32Array(block), i32: new Int32Array(block), u32: new Uint32Array(block), bytes: new Uint8Array(block), blockSize: 64 });
    p.uniforms = new Map([
      ["tint", { name: "tint", offset: 16, kind: "f", columns: 1, rows: 3, column_stride: 0, count: 2, stride: 16, array: true }],
      ["mode", { name: "mode", offset: 48, kind: "i", columns: 1, rows: 1, column_stride: 0, count: 1, stride: 0, array: false }],
    ]);
    gl.uniform3f(gl.getUniformLocation(p, "tint"), 1, 2, 0.1);
    gl.uniform3f(gl.getUniformLocation(p, "tint[1]"), 4, 5, 6);
    gl.uniform1i(gl.getUniformLocation(p, "mode"), 2.7);
    expect([...p.f32.subarray(4, 7)]).toEqual([1, 2, Math.fround(0.1)]);
    expect([...p.f32.subarray(8, 11)]).toEqual([4, 5, 6]);
    expect(p.i32[12]).toBe(2);
    expect(p.dirty).toBe(true);
    p.dirty = false;
    gl.uniform3f(gl.getUniformLocation(p, "tint"), 1, 2, 0.1);
    expect(p.dirty).toBe(false);
    gl.uniform3f(gl.getUniformLocation(p, "tint"), 1, 2, 0.2);
    expect(p.dirty).toBe(true);
  });
});

describe("WebGpuGl pass replay", () => {
  const frame = (s: ReturnType<typeof drawSetup>, draws: number) => {
    for (let i = 0; i < draws; i += 1) s.draw();
    s.calls.length = 0;
    s.gl.present();
    // Less the present blit's own draw.
    const names = s.calls.map(([name]) => name);
    names.splice(names.lastIndexOf("draw"), 1);
    return names;
  };

  test("a pass that repeats last frame's commands is replayed from render bundles, and one that changes is encoded again", () => {
    const s = drawSetup();
    s.texture();
    expect(frame(s, 3).filter((n) => n === "draw").length).toBe(3); // first frame: encoded
    // The first repeat records the bundles and replays them; later repeats only replay.
    for (const n of [1, 2]) {
      const replayed = frame(s, 3);
      expect(replayed.filter((name) => name === "draw").length).toBe(0);
      expect(replayed).toContain("executeBundles");
      expect(s.gl.stats.replayedPasses).toBe(n);
    }
    expect(s.gl.stats.bundles).toBe(1);
    const changed = frame(s, 4);
    expect(changed.filter((n) => n === "draw").length).toBe(4);
    expect(changed).not.toContain("executeBundles");
  });

  test("a pass that alternates between two forms (a ping-pong target) is replayed in both", () => {
    const s = drawSetup();
    s.texture();
    for (const draws of [3, 4, 3, 4]) frame(s, draws);
    const replayed = s.gl.stats.replayedPasses;
    for (const draws of [3, 4]) expect(frame(s, draws).filter((n) => n === "draw").length).toBe(0);
    expect(s.gl.stats.replayedPasses).toBe(replayed + 2);
  });

  test("uniforms are bound relative to the pass's own range, so a pass after a different one still repeats", () => {
    const s = drawSetup();
    s.texture();
    const fb = s.gl.createFramebuffer();
    const t = s.texture();
    s.gl.bindFramebuffer(0x8d40, fb);
    s.gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, t, 0);
    // The default framebuffer's pass draws a different number of times each frame; fb's pass, after it, does not.
    const twoPasses = (first: number) => {
      s.gl.bindFramebuffer(0x8d40, null);
      // Each draw with new uniforms (a moving object), so the first pass's share of the ring changes.
      for (let i = 0; i < first; i += 1) { s.gl.program.dirty = true; s.draw(); }
      s.gl.bindFramebuffer(0x8d40, fb);
      s.gl.program.dirty = true;
      s.draw();
      s.gl.present();
    };
    twoPasses(1);
    twoPasses(2);
    const before = s.gl.stats.replayedPasses;
    twoPasses(3);
    expect(s.gl.stats.replayedPasses).toBe(before + 1);
  });

  test("a pass whose draws read a constant vertex attribute repeats, bound relative to its own range of the constant ring", () => {
    const s = drawSetup();
    s.texture();
    // Attribute 0 is not an array: each draw writes its constant value into the batch's constant ring.
    const plan = { id: 902, key: "constant", slots: [{ constant: true }], constants: [0], instanceCapacity: (n: number) => n };
    s.gl.vertexPlan = () => plan;
    const fb = s.gl.createFramebuffer();
    s.gl.bindFramebuffer(0x8d40, fb);
    s.gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, s.texture(), 0);
    // The default framebuffer's pass takes a different share of the constant ring each frame; fb's pass, after it, does not.
    const twoPasses = (first: number) => {
      s.gl.bindFramebuffer(0x8d40, null);
      for (let i = 0; i < first; i += 1) { s.gl.vertexAttrib1f(0, i); s.draw(); }
      s.gl.bindFramebuffer(0x8d40, fb);
      s.gl.vertexAttrib1f(0, 7);
      s.draw();
      s.gl.present();
    };
    twoPasses(1);
    twoPasses(2);
    const before = s.gl.stats.replayedPasses;
    twoPasses(3);
    expect(s.gl.stats.replayedPasses).toBe(before + 1);
    expect(s.gl.stats.unreplayablePasses).toBe(0);
  });
});

describe("WebGpuGl multi-draw", () => {
  test("a multi-draw sets its bindings once and draws each item with firstInstance as its draw id", () => {
    const { gl, calls, texture } = drawSetup();
    texture();
    // The real vertex plan, for a program whose one input is the draw id.
    delete gl.vertexPlan;
    gl.program.translated.layout.vertex_inputs = [{ name: DRAW_ID_INPUT, column: 0, location: 0, components: 1, kind: "i" }];
    const indices = gl.createBuffer();
    gl.bindBuffer(0x8893, indices);
    gl.bufferData(0x8893, new Uint16Array(64), 0x88e4);
    const ext = gl.getExtension("WEBGL_multi_draw");
    ext.multiDrawElementsWEBGL(4, new Int32Array([9, 6, 0, 12]), 1, 0x1403, new Int32Array([99, 0, 12, 24]), 1, 3);
    encodePasses(gl);
    // Item 1 is empty and skipped; starts are byte offsets into 2-byte indices.
    expect(calls.filter(([name]) => name === "drawIndexed").map(([, args]) => args)).toEqual([[6, 1, 0, 0, 0], [12, 1, 12, 0, 2]]);
    expect(calls.filter(([name]) => name === "setBindGroup").length).toBe(2);
    expect(calls.find(([name, args]) => name === "setVertexBuffer" && args[0] === 0)?.[1][1]).toBe(gl.drawIdBuffer.gpu);

    // More items than the id buffer holds: it grows before the draw binds it.
    calls.length = 0;
    ext.multiDrawArraysWEBGL(4, new Int32Array(2000), 0, new Int32Array(2000).fill(3), 0, 2000);
    encodePasses(gl);
    expect(gl.drawIdBuffer.size).toBe(2048 * 4);
    expect(calls.filter(([name]) => name === "draw").at(-1)?.[1]).toEqual([3, 1, 0, 1999]);
  });
});

describe("WebGpuGl per-program draw caches", () => {
  const setup = () => drawSetup();

  test("a repeated draw reuses its bind group and pipeline; rebinding, sampler state or GL state rebuild only what they change", () => {
    const { gl, groups, pipelines, texture, draw } = setup();
    const a = texture();
    draw();
    draw();
    expect(groups).toEqual([a]);
    expect(pipelines()).toBe(1);

    const b = texture(); // binds b on unit 0
    draw();
    expect(groups).toEqual([a, b]);
    expect(pipelines()).toBe(1);

    gl.bindTexture(0x0de1, b); // the same binding again changes nothing
    draw();
    expect(groups.length).toBe(2);

    gl.bindTexture(0x0de1, a); // back to a, with no upload in between: the set a drew with before
    draw();
    expect(groups).toEqual([a, b]);
    gl.bindTexture(0x0de1, b);
    draw();
    expect(groups).toEqual([a, b]);

    gl.texParameteri(0x0de1, 0x2801, 0x2600); // MIN_FILTER NEAREST: a new sampler
    draw();
    expect(groups).toEqual([a, b, b]);

    gl.enable(0x0be2); // BLEND: a new pipeline, same textures
    draw();
    expect(pipelines()).toBe(2);
    gl.disable(0x0be2); // and back: the first pipeline again
    draw();
    expect(pipelines()).toBe(2);
    expect(groups.length).toBe(3);

    gl.deleteTexture(b);
    draw();
    expect(groups).toEqual([a, b, b, null]);
  });

  test("GL state a pipeline does not use (blend factors with blending off) shares its pipeline; a polygon offset of -1 is a state of its own", () => {
    const { gl, pipelines, texture, draw } = setup();
    texture();
    draw();
    gl.blendFunc(0x0302, 0x0303);
    gl.depthFunc(0x0203); // depth test off: its function does not matter either
    draw();
    expect(pipelines()).toBe(1);
    gl.enable(0x8037);
    gl.polygonOffset(-1, -1);
    draw();
    expect(pipelines()).toBe(2);
    gl.polygonOffset(1, 1);
    draw();
    expect(pipelines()).toBe(3);
    gl.polygonOffset(-1, -1);
    draw();
    expect(pipelines()).toBe(3);
  });

  test("re-pointing an attribute where it already points, or binding an index buffer, keeps the vertex plan; a new buffer in the same layout keeps the pipeline", () => {
    const { gl, pipelines, texture, draw } = setup();
    texture();
    delete gl.vertexPlan;
    gl.program.translated.layout.vertex_inputs = [{ name: "position", column: 0, location: 0, components: 3, kind: "f" }];
    const plans = new Set<unknown>();
    const vertexPlan = gl.vertexPlan.bind(gl);
    gl.vertexPlan = (p: unknown) => { const plan = vertexPlan(p); plans.add(plan); return plan; };
    const buffer = () => { const b = gl.createBuffer(); gl.bindBuffer(0x8892, b); gl.bufferData(0x8892, new Float32Array(9), 0x88e4); return b; };
    const point = (b: unknown) => { gl.bindBuffer(0x8892, b); gl.vertexAttribPointer(0, 3, 0x1406, false, 12, 0); };
    const a = buffer();
    gl.enableVertexAttribArray(0);
    point(a);
    draw();
    point(a);
    gl.bindBuffer(0x8893, gl.createBuffer());
    draw();
    expect(plans.size).toBe(1);
    point(buffer());
    draw();
    expect(plans.size).toBe(2);
    expect(pipelines()).toBe(1);
  });

  test("a draw over WebGPU's 8 vertex buffers packs them into one once, and again only when one of them changes", () => {
    const { gl, texture, draw } = setup();
    texture();
    delete gl.vertexPlan;
    const inputs = Array.from({ length: 9 }, (_, i) => ({ name: `a${i}`, column: 0, location: i, components: 1, kind: "f" }));
    gl.program.translated.layout.vertex_inputs = inputs;
    const sources = inputs.map((_, i) => {
      const b = gl.createBuffer();
      gl.bindBuffer(0x8892, b);
      gl.bufferData(0x8892, new Float32Array([i, i, i]), 0x88e4);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 1, 0x1406, false, 4, 0);
      return b;
    });
    // Three vertices of nine floats: the packed buffer is the only 108-byte write.
    const packs: number[][] = [];
    const queue = gl.queue;
    gl.queue = new Proxy(queue, { get: (t, k) => (k === "writeBuffer" ? (target: unknown, offset: number, data: ArrayBufferView) => {
      if (data.byteLength === 108) packs.push([...new Float32Array(data.buffer, data.byteOffset, 9)]);
      return t.writeBuffer(target, offset, data);
    } : t[k]) });
    draw();
    draw();
    expect(packs).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8]]);
    gl.bindBuffer(0x8892, sources[4]);
    gl.bufferSubData(0x8892, 0, new Float32Array([7, 7, 7]));
    draw();
    expect(packs).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 7, 5, 6, 7, 8]]);
  });

  test("a cached draw still marks its textures as used by the current batch, so an upload after it submits first", () => {
    const { gl, groups, texture, draw } = setup();
    const t = texture();
    draw();
    gl.finish();
    const batch = gl.batch;
    expect(t.usedBatch).toBeLessThan(batch);
    draw();
    expect(groups.length).toBe(1);
    expect(t.usedBatch).toBe(batch);
  });
});

describe("WebGpuGl GPU timers", () => {
  test("a TIME_ELAPSED query spans its first pass's start to its last pass's end, and answers once the stamps read back", async () => {
    stubGlobals();
    // Stamp k reads back as k microseconds.
    const { device, passes, buffers, landAllMaps } = stubDevice({ features: ["timestamp-query"], mapped: (size) => new BigUint64Array(Array.from({ length: size / 8 }, (_, k) => BigInt(k * 1000))).buffer });
    const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) } as unknown as GPUCanvasContext;
    const gl = new WebGpuGl({ width: 16, height: 16 } as HTMLCanvasElement, device, context, {}, "stub") as any;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    expect(ext.TIME_ELAPSED_EXT).toBe(0x88bf);
    // The stamps resolve into a buffer WebGPU accepts as a resolve target (QUERY_RESOLVE 0x200 | COPY_SRC 0x4).
    // Without it every batch fails validation and its GPU work is dropped, which reads as a faster frame.
    expect(buffers.find((b) => b.size === 4096 * 8)?.usage).toBe(0x200 | 0x4);

    const untimed = passes.length;
    gl.clear(0x4000); // a clear before the query waits for the next pass's load op
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    const tex = gl.createTexture();
    gl.bindTexture(0x0de1, tex);
    gl.texStorage2D(0x0de1, 1, 0x8058, 4, 4);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(0x8d40, fb);
    gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, tex, 0);
    gl.clear(0x4000); // pass 1: the default framebuffer's clear lands when the target changes
    gl.bindFramebuffer(0x8d40, null);
    gl.clear(0x4000); // pass 2: fb's clear lands; this one waits past the query for the next pass
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.encodeEnded();
    const timed = passes.slice(untimed).filter((pass) => pass.timestampWrites !== undefined);
    expect(timed.length).toBe(2);
    expect(timed.map((pass) => [pass.timestampWrites!.beginningOfPassWriteIndex, pass.timestampWrites!.endOfPassWriteIndex])).toEqual([[0, 1], [2, 3]]);

    gl.finish();
    await flushPromises();
    expect(gl.getQueryParameter(q, 0x8867)).toBe(false); // not until the GPU has written the stamps
    landAllMaps();
    await flushPromises();
    expect(gl.getQueryParameter(q, 0x8867)).toBe(true);
    expect(gl.getQueryParameter(q, 0x8866)).toBe(3000);
    expect(gl.getParameter(ext.GPU_DISJOINT_EXT)).toBe(false);

    const empty = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, empty);
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    expect(gl.getQueryParameter(empty, 0x8867)).toBe(true);
    expect(gl.getQueryParameter(empty, 0x8866)).toBe(0);
  });

  test("a timer starting or stopping between a clear and its draws keeps the clear as their pass's load op, not a pass of its own", () => {
    // The frame breakdown times each shadow map from its first draw: every shadow map drew as a
    // clear-only pass and then a pass of draws (47 passes a frame on Odd Orbit, 15 of them clears).
    const { gl, passes, texture, draw } = drawSetup(["timestamp-query"]);
    texture();
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const before = passes.length;
    gl.clear(0x4000 | 0x0100);
    gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery());
    draw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.clear(0x4000);
    gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery());
    draw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.finish();
    const opened = passes.slice(before) as unknown as { colorAttachments: { loadOp: string }[]; depthStencilAttachment?: { depthLoadOp: string } }[];
    expect(opened.map((pass) => pass.colorAttachments[0]!.loadOp)).toEqual(["clear", "clear"]);
    expect(opened[0]!.depthStencilAttachment?.depthLoadOp).toBe("clear");
  });

  test("timers started and stopped between draws into one target keep one pass, and read that whole pass", () => {
    // The frame breakdown starts and stops timers around shadow maps and post passes every frame; each
    // one ended the pass, so a timed page drew extra passes (each a store and a load of its target)
    // that WebGL never pays, and every WebGPU measurement with telemetry on was slowed by its instrument.
    const { gl, passes, texture, draw } = drawSetup(["timestamp-query"]);
    texture();
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery());
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    const before = passes.length;
    draw();
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    draw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.beginQuery(ext.TIME_ELAPSED_EXT, gl.createQuery());
    draw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    draw();
    gl.finish();
    const opened = passes.slice(before);
    expect(opened.length).toBe(1);
    const stamps = opened[0]!.timestampWrites!;
    expect([q.start, q.end]).toEqual([stamps.beginningOfPassWriteIndex, stamps.endOfPassWriteIndex]);
  });

  test("without timestamp queries the context offers no GPU timer", () => {
    const { gl } = stubContext();
    expect(gl.getSupportedExtensions()).not.toContain("EXT_disjoint_timer_query_webgl2");
    expect(gl.getExtension("EXT_disjoint_timer_query_webgl2")).toBeNull();
  });
});

describe("WebGpuGl framebuffer completeness", () => {
  const attachLevel = (gl: any, levels: number, level: number) => {
    const tex = gl.createTexture();
    gl.bindTexture(0x0de1, tex);
    gl.texStorage2D(0x0de1, levels, 0x8058, 768, 256);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(0x8d40, fb);
    gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, tex, level);
    return fb;
  };

  test("a mip level past the texture's last is incomplete, and nothing is encoded against it (Deepward's level 10 of 10)", () => {
    const { gl, views } = stubContext();
    attachLevel(gl, 10, 10);
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd6); // INCOMPLETE_ATTACHMENT
    gl.clearColor(1, 0, 0, 1);
    gl.clear(0x4000);
    gl.finish();
    expect(views.some((view) => view.baseMipLevel === 10)).toBe(false);
    expect([...gl.warnings.keys()].some((w: string) => w.includes("incomplete framebuffer") && w.includes("mip level 10"))).toBe(true);
  });

  test("a fractional level count from three (log2(768) + 1) is truncated as GL truncates it, so level 10 stays incomplete", () => {
    const { gl, views } = stubContext();
    attachLevel(gl, Math.log2(768) + 1, 10);
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd6);
    gl.clear(0x4000);
    gl.finish();
    expect(views.some((view) => view.baseMipLevel === 10)).toBe(false);
  });

  test("the last mip level is complete and is rendered into", () => {
    const { gl, views } = stubContext();
    attachLevel(gl, 10, 9);
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd5); // FRAMEBUFFER_COMPLETE
    gl.clearColor(1, 0, 0, 1);
    gl.clear(0x4000);
    gl.finish();
    expect(views.some((view) => view.baseMipLevel === 9)).toBe(true);
  });

  describe("a multisampled scene resolved as three resolves it (blit, then invalidate)", () => {
    type Pass = { colorAttachments: { loadOp: string; storeOp: string; resolveTarget?: unknown }[]; depthStencilAttachment?: { depthStoreOp?: string } };
    const setup = () => {
      const s = drawSetup();
      const { gl } = s;
      const storage = (internal: number, point: number) => {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(0x8d41, rb);
        gl.renderbufferStorageMultisample(0x8d41, 4, internal, 64, 64);
        gl.framebufferRenderbuffer(0x8d40, point, 0x8d41, rb);
      };
      const scene = gl.createFramebuffer();
      gl.bindFramebuffer(0x8d40, scene);
      storage(0x8058, 0x8ce0);
      storage(0x81a6, 0x8d00);
      const target = gl.createFramebuffer();
      gl.bindFramebuffer(0x8d40, target);
      for (const [internal, point] of [[0x8058, 0x8ce0], [0x81a6, 0x8d00]] as const) {
        const t = gl.createTexture();
        gl.bindTexture(0x0de1, t);
        gl.texStorage2D(0x0de1, 1, internal, 64, 64);
        gl.framebufferTexture2D(0x8d40, point, 0x0de1, t, 0);
      }
      const other = gl.createFramebuffer();
      gl.bindFramebuffer(0x8d40, other);
      const t = gl.createTexture();
      gl.bindTexture(0x0de1, t);
      gl.texStorage2D(0x0de1, 1, 0x8058, 64, 64);
      gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, t, 0);
      const resolve = (mask: number) => {
        gl.bindFramebuffer(0x8ca8, scene);
        gl.bindFramebuffer(0x8ca9, target);
        gl.blitFramebuffer(0, 0, 64, 64, 0, 0, 64, 64, mask);
        gl.invalidateFramebuffer(0x8ca8, [0x8ce0, 0x8d00]);
        gl.finish();
      };
      const resolving = () => (s.passes as unknown as Pass[]).filter((p) => p.colorAttachments[0]?.resolveTarget !== undefined);
      return { ...s, scene, other, resolve, resolving };
    };

    test("the scene's own pass resolves it and stores no multisampled color; its depth, read by the depth resolve after it, is kept", () => {
      const { gl, draw, scene, resolve, resolving, passes } = setup();
      gl.bindFramebuffer(0x8d40, scene);
      draw();
      const before = passes.length;
      resolve(0x4100);
      const all = resolving();
      expect(all.length).toBe(1);
      const own = all[0]!;
      expect(passes.indexOf(own as never)).toBe(before); // the pass that drew, not an empty one after it
      expect(own.colorAttachments[0]!.storeOp).toBe("discard");
      expect(own.depthStencilAttachment?.depthStoreOp).toBe("store");
    });

    test("with another pass ended after the scene's, an empty pass resolves it and the scene's color is stored", () => {
      const { gl, draw, scene, other, resolve, resolving } = setup();
      gl.bindFramebuffer(0x8d40, scene);
      draw();
      gl.bindFramebuffer(0x8d40, other);
      draw();
      resolve(0x4000);
      const all = resolving();
      expect(all.length).toBe(1);
      expect(all[0]!.colorAttachments[0]!.loadOp).toBe("load");
      expect(all[0]!.colorAttachments[0]!.storeOp).toBe("store");
    });
  });

  test("a multisampled depth blitted into a depth texture is resolved by a pass writing its depth (Scrap Signal), not skipped", () => {
    const { gl, passes, calls } = stubContext();
    const storage = (samples: number, internal: number, point: number) => {
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(0x8d41, rb);
      gl.renderbufferStorageMultisample(0x8d41, samples, internal, 64, 64);
      gl.framebufferRenderbuffer(0x8d40, point, 0x8d41, rb);
    };
    const scene = gl.createFramebuffer();
    gl.bindFramebuffer(0x8d40, scene);
    storage(4, 0x8058, 0x8ce0); // RGBA8 color
    storage(4, 0x81a6, 0x8d00); // DEPTH_COMPONENT24
    const depth = gl.createTexture();
    gl.bindTexture(0x0de1, depth);
    gl.texStorage2D(0x0de1, 1, 0x81a6, 64, 64);
    const target = gl.createFramebuffer();
    gl.bindFramebuffer(0x8d40, target);
    gl.framebufferTexture2D(0x8d40, 0x8d00, 0x0de1, depth, 0);
    gl.bindFramebuffer(0x8ca8, scene);
    gl.bindFramebuffer(0x8ca9, target);
    gl.blitFramebuffer(0, 0, 64, 64, 0, 0, 64, 64, 0x0100);
    expect([...gl.warnings.keys()].filter((w: string) => w.includes("blitFramebuffer"))).toEqual([]);
    const pass = passes.at(-1) as unknown as { colorAttachments: unknown[]; depthStencilAttachment: { depthLoadOp: string; depthStoreOp: string } };
    expect(pass.colorAttachments).toEqual([]);
    expect(pass.depthStencilAttachment.depthLoadOp).toBe("load");
    expect(pass.depthStencilAttachment.depthStoreOp).toBe("store");
    expect(calls.filter(([name]) => name === "draw").at(-1)?.[1]).toEqual([3]);
  });

  test("a framebuffer's pass is built once: a loading pass carries no clear values, a clear gets its own, and new storage for an attachment rebuilds it", () => {
    const { gl, passes, draw } = drawSetup();
    const tex = gl.createTexture();
    gl.bindTexture(0x0de1, tex);
    gl.texImage2D(0x0de1, 0, 0x8058, 64, 64, 0, 0x1908, 0x1401, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(0x8d40, fb);
    gl.framebufferTexture2D(0x8d40, 0x8ce0, 0x0de1, tex, 0);
    type Color = { view: unknown; loadOp: string; clearValue?: unknown };
    const color = (at: number) => { encodePasses(gl); return (passes.at(at) as unknown as { colorAttachments: Color[] }).colorAttachments[0]!; };
    gl.clearColor(1, 0, 0, 1);
    gl.clear(0x4000);
    draw();
    expect(color(-1).loadOp).toBe("clear");
    expect(color(-1).clearValue).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    const first = color(-1).view;
    gl.bindFramebuffer(0x8d40, null);
    draw();
    gl.bindFramebuffer(0x8d40, fb);
    draw();
    expect(color(-1)).toEqual({ view: first, loadOp: "load", storeOp: "store" } as Color);
    // New storage: the old view is of a destroyed texture, so the pass must not reuse it.
    gl.bindTexture(0x0de1, tex);
    gl.texImage2D(0x0de1, 0, 0x8058, 32, 32, 0, 0x1908, 0x1401, null);
    draw();
    expect(gl.passTarget.width).toBe(32);
    expect(color(-1).view).not.toBe(first);
  });

  test("a framebuffer with nothing attached is incomplete; the default one is complete", () => {
    const { gl } = stubContext();
    gl.bindFramebuffer(0x8d40, gl.createFramebuffer());
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd7); // INCOMPLETE_MISSING_ATTACHMENT
    gl.bindFramebuffer(0x8d40, null);
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd5);
  });
});
