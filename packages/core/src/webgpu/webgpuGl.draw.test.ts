import { describe, expect, test } from "bun:test";
import { failingLine, WebGpuGl } from "./webgpuGl.draw";

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
      beginRenderPass: (desc: (typeof passes)[number]) => { passes.push(desc); return anything(); },
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
  return { device, views, passes, buffers, landAllMaps: () => { for (const resolve of pendingMaps.splice(0)) resolve(); } };
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
  test("WEBGL_multi_draw is not offered, so three draws BatchedMesh items one by one with a _gl_DrawID uniform", () => {
    // Offered, three compiles BatchedMesh against gl_DrawID, which the WGSL has no value for:
    // every item drew with the first item's matrix (Harbor Heat's palms stacked in one place).
    const { gl } = stubContext();
    expect(gl.getSupportedExtensions()).not.toContain("WEBGL_multi_draw");
    expect(gl.getExtension("WEBGL_multi_draw")).toBeNull();
  });
});

// A linked one-sampler program without the naga translation, and a draw with no vertex buffers:
// what the cache decides is which of bindGroupFor / pipelineFor a draw had to run again.
const drawSetup = (features: string[] = []) => {
  const { gl, passes } = stubContext(64, 64, features);
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
  return { gl, passes, groups, pipelines: () => pipelines, texture, draw: () => gl.drawArrays(4, 0, 3) };
};

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

  test("a framebuffer with nothing attached is incomplete; the default one is complete", () => {
    const { gl } = stubContext();
    gl.bindFramebuffer(0x8d40, gl.createFramebuffer());
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd7); // INCOMPLETE_MISSING_ATTACHMENT
    gl.bindFramebuffer(0x8d40, null);
    expect(gl.checkFramebufferStatus(0x8d40)).toBe(0x8cd5);
  });
});
