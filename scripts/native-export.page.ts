// The in-page half of `bun run perf native export`. It runs inside the game page (serialized with
// Function.prototype.toString), so it imports nothing. It records what three.js really draws, at
// the level a native renderer can replay: every program three linked (vertex and fragment GLSL),
// every draw of every pass (shadow maps, the beauty pass, each post pass) with its GL state, its
// program's uniform values and its textures, the render targets and clears between them, buffer
// and texture contents as they change, and the canvas pixels of chosen frames as the reference.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Installs `globalThis.__jgNative`. The caller first puts the live renderers in `globalThis.__jgRenderers`. */
export async function installNativeRecorder(port: number): Promise<{ ok: boolean; error?: string; summary?: unknown }> {
  const g = globalThis as any;
  if (g.__jgNative !== undefined) return { ok: true, summary: "already installed" };
  const renderers: any[] = g.__jgRenderers ?? [];
  if (renderers.length === 0) return { ok: false, error: "no WebGLRenderer instances handed in" };
  // The game's renderer draws to the page's biggest canvas.
  const renderer = renderers.slice().sort((a, b) => b.domElement.width * b.domElement.height - a.domElement.width * a.domElement.height)[0];
  const gl: WebGL2RenderingContext = renderer.getContext();
  const base = `http://127.0.0.1:${port}`;
  const put = async (name: string, body: Blob | ArrayBuffer | Uint8Array | string): Promise<void> => {
    const res = await fetch(`${base}/put?name=${encodeURIComponent(name)}`, { method: "POST", body: body as BodyInit });
    if (!res.ok) throw new Error(`put ${name}: HTTP ${res.status}`);
  };

  // ---- binary blobs: every part 16-byte aligned so the reader can view it in place ----
  type Chunks = { parts: Uint8Array[]; size: number };
  const blob = (): Chunks => ({ parts: [], size: 0 });
  function append(b: Chunks, view: ArrayBufferView): { offset: number; bytes: number } {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
    const pad = (16 - (b.size % 16)) % 16;
    if (pad > 0) { b.parts.push(new Uint8Array(pad)); b.size += pad; }
    const offset = b.size;
    b.parts.push(bytes);
    b.size += bytes.byteLength;
    return { offset, bytes: bytes.byteLength };
  }
  // One Blob over the parts: the browser streams it to the receiver without a second copy in JS.
  const concat = (b: Chunks): Blob => new Blob(b.parts as BlobPart[]);

  const data = blob(); // geometry, buffer updates, texture data, uniform-free payloads
  const handles = new WeakMap<object, number>(); // GL object -> id (textures, framebuffers, programs)
  const handleList: object[] = [];
  const handleId = (h: object | null): number => {
    if (h === null || h === undefined) return -1;
    let id = handles.get(h);
    if (id === undefined) { id = handleList.length; handles.set(h, id); handleList.push(h); }
    return id;
  };

  // ---- GL state tracking (three caches state, so a call happens only on change) ----
  const st: any = {
    fb: null, readFb: null, viewport: [0, 0, 0, 0], scissor: [0, 0, 0, 0], enabled: new Set<number>(),
    blendEq: [gl.FUNC_ADD, gl.FUNC_ADD], blendFunc: [gl.ONE, gl.ZERO, gl.ONE, gl.ZERO], blendColor: [0, 0, 0, 0],
    depthFunc: gl.LESS, depthMask: true, colorMask: [true, true, true, true], cullFace: gl.BACK, frontFace: gl.CCW,
    polygonOffset: [0, 0], clearColor: [0, 0, 0, 0], clearDepth: 1, clearStencil: 0, stencilMask: 0xff,
    stencilFunc: [gl.ALWAYS, 0, 0xff], stencilOp: [gl.KEEP, gl.KEEP, gl.KEEP], unit: 0, bound: new Map<number, object>(), program: null, drawBuffers: null,
  };
  const wrap = (name: string, after: (...args: any[]) => void): void => {
    const original = (gl as any)[name].bind(gl);
    (gl as any)[name] = (...args: any[]) => { const r = original(...args); after(...args); return r; };
  };
  wrap("bindFramebuffer", (target: number, fb: object | null) => {
    if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) { st.fb = fb; event([OP.FB, handleId(fb)]); }
    if (target === gl.FRAMEBUFFER || target === gl.READ_FRAMEBUFFER) st.readFb = fb;
  });
  wrap("viewport", (x: number, y: number, w: number, h: number) => { st.viewport = [x, y, w, h]; });
  wrap("scissor", (x: number, y: number, w: number, h: number) => { st.scissor = [x, y, w, h]; });
  wrap("enable", (cap: number) => { st.enabled.add(cap); });
  wrap("disable", (cap: number) => { st.enabled.delete(cap); });
  wrap("blendEquation", (m: number) => { st.blendEq = [m, m]; });
  wrap("blendEquationSeparate", (a: number, b: number) => { st.blendEq = [a, b]; });
  wrap("blendFunc", (s: number, d: number) => { st.blendFunc = [s, d, s, d]; });
  wrap("blendFuncSeparate", (a: number, b: number, c: number, d: number) => { st.blendFunc = [a, b, c, d]; });
  wrap("blendColor", (r: number, g2: number, b: number, a: number) => { st.blendColor = [r, g2, b, a]; });
  wrap("depthFunc", (f: number) => { st.depthFunc = f; });
  wrap("depthMask", (m: boolean) => { st.depthMask = m; });
  wrap("colorMask", (r: boolean, g2: boolean, b: boolean, a: boolean) => { st.colorMask = [r, g2, b, a]; });
  wrap("cullFace", (m: number) => { st.cullFace = m; });
  wrap("frontFace", (m: number) => { st.frontFace = m; });
  wrap("polygonOffset", (f: number, u: number) => { st.polygonOffset = [f, u]; });
  wrap("clearColor", (r: number, g2: number, b: number, a: number) => { st.clearColor = [r, g2, b, a]; });
  wrap("clearDepth", (d: number) => { st.clearDepth = d; });
  wrap("clearStencil", (s: number) => { st.clearStencil = s; });
  wrap("stencilMask", (m: number) => { st.stencilMask = m; });
  wrap("stencilFunc", (f: number, r: number, m: number) => { st.stencilFunc = [f, r, m]; });
  wrap("stencilOp", (a: number, b: number, c: number) => { st.stencilOp = [a, b, c]; });
  wrap("activeTexture", (u: number) => { st.unit = u - gl.TEXTURE0; });
  wrap("bindTexture", (target: number, tex: object | null) => { if (tex !== null) st.bound.set(st.unit * 100000 + target, tex); else st.bound.delete(st.unit * 100000 + target); });
  wrap("useProgram", (p: object | null) => { st.program = p; });
  wrap("drawBuffers", (b: number[]) => { st.drawBuffers = Array.from(b); });
  wrap("clear", (mask: number) => {
    event([OP.CLEAR, mask, ...st.clearColor, st.clearDepth, st.clearStencil, st.colorMask.map(Number).join("") === "1111" ? 1 : 0, st.depthMask ? 1 : 0, ...viewScissor()]);
  });
  wrap("generateMipmap", (target: number) => { const tex = st.bound.get(st.unit * 100000 + target); if (tex !== undefined) event([OP.MIPMAP, handleId(tex)]); });
  wrap("blitFramebuffer", (...args: number[]) => { event([OP.BLIT, handleId(st.readFb), handleId(st.fb), ...args]); });
  wrap("copyTexSubImage2D", (target: number, level: number, dx: number, dy: number, x: number, y: number, w: number, h: number) => {
    const tex = st.bound.get(st.unit * 100000 + target);
    event([OP.COPYTEX, handleId(st.readFb), tex === undefined ? -1 : handleId(tex), level, dx, dy, x, y, w, h]);
  });
  for (const name of ["drawArrays", "drawArraysInstanced", "drawElements", "drawElementsInstanced"]) {
    const original = (gl as any)[name].bind(gl);
    (gl as any)[name] = (...args: any[]) => { const r = original(...args); onDraw(name, args); return r; };
  }
  function viewScissor(): number[] {
    return [...st.viewport, st.enabled.has(gl.SCISSOR_TEST) ? 1 : 0, ...st.scissor];
  }

  // ---- recorded frames ----
  const OP = { FRAME: 0, FB: 1, CLEAR: 2, DRAW: 3, MIPMAP: 4, BLIT: 5, COPYTEX: 6, BUFFER: 7, TEXDATA: 8, READBACK: 9 };
  const rec: any = { on: false, events: [] as number[][], frames: 0, frameStarts: [] as number[], readbacks: [] as any[], readbackAt: new Set<number>(), canvasDrawn: false, times: [] as number[] };
  function event(row: number[]): void { if (rec.on) rec.events.push(row); }

  // ---- states, programs, uniforms ----
  const stateKeys = new Map<string, number>();
  const states: any[] = [];
  function stateId(): number {
    const s = {
      blend: st.enabled.has(gl.BLEND), blendEq: st.blendEq, blendFunc: st.blendFunc, blendColor: st.blendColor,
      depthTest: st.enabled.has(gl.DEPTH_TEST), depthFunc: st.depthFunc, depthMask: st.depthMask, colorMask: st.colorMask,
      cull: st.enabled.has(gl.CULL_FACE), cullFace: st.cullFace, frontFace: st.frontFace,
      polygonOffset: st.enabled.has(gl.POLYGON_OFFSET_FILL) ? st.polygonOffset : null,
      stencil: st.enabled.has(gl.STENCIL_TEST) ? { func: st.stencilFunc, op: st.stencilOp, mask: st.stencilMask } : null,
      alphaToCoverage: st.enabled.has(gl.SAMPLE_ALPHA_TO_COVERAGE), drawBuffers: st.drawBuffers,
    };
    const key = JSON.stringify(s);
    let id = stateKeys.get(key);
    if (id === undefined) { id = states.length; stateKeys.set(key, id); states.push(s); }
    return id;
  }

  const programs: any[] = []; // { three program, leaves: [{ name, type, size, leaf }], vert, frag }
  const programOf = new WeakMap<object, number>(); // GL program handle -> index
  function flattenUniform(v: any): { kind: "num"; values: number[] } | { kind: "tex"; textures: any[] } {
    if (v === null || v === undefined) return { kind: "num", values: [] };
    if (typeof v === "number") return { kind: "num", values: [v] };
    if (typeof v === "boolean") return { kind: "num", values: [v ? 1 : 0] };
    if (v.isTexture === true) return { kind: "tex", textures: [v] };
    if (v.isColor === true) return { kind: "num", values: [v.r, v.g, v.b] };
    if (v.isVector2 === true) return { kind: "num", values: [v.x, v.y] };
    if (v.isVector3 === true) return { kind: "num", values: [v.x, v.y, v.z] };
    if (v.isVector4 === true || v.isQuaternion === true) return { kind: "num", values: [v.x, v.y, v.z, v.w] };
    if (v.isMatrix3 === true || v.isMatrix4 === true || v.isMatrix2 === true) return { kind: "num", values: Array.from(v.elements) };
    if (ArrayBuffer.isView(v)) return { kind: "num", values: Array.from(v as unknown as ArrayLike<number>) };
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0]?.isTexture === true) return { kind: "tex", textures: v };
      if (v.length > 0 && v[0] !== null && typeof v[0] === "object" && v[0].isTexture !== true) {
        const out: number[] = [];
        for (const e of v) { const f = flattenUniform(e); if (f.kind === "num") out.push(...f.values); }
        return { kind: "num", values: out };
      }
      if (v.some((e: any) => e === null || e?.isTexture === true)) return { kind: "tex", textures: v };
      return { kind: "num", values: v.map(Number) };
    }
    return { kind: "num", values: [] };
  }
  function patchProgram(program: any): number {
    const known = programOf.get(program.program);
    if (known !== undefined) return known;
    const index = programs.length;
    programOf.set(program.program, index);
    const leaves: any[] = [];
    const walk = (list: any[], prefix: string): void => {
      for (const u of list) {
        const name = `${prefix}${typeof u.id === "number" ? `[${u.id}]` : (prefix === "" ? u.id : `.${u.id}`)}`;
        if (Array.isArray(u.seq)) { walk(u.seq, name); continue; }
        const leaf = { name, type: u.type, size: u.size ?? 1, u, last: null as any };
        const original = u.setValue;
        u.setValue = function (this: any, glc: any, v: any, textures: any) { original.call(this, glc, v, textures); this.__jgv = v; this.__jgn = (this.__jgn ?? 0) + 1; };
        leaves.push(leaf);
      }
    };
    walk(program.getUniforms().seq, "");
    const shaders = gl.getAttachedShaders(program.program) ?? [];
    const src = (type: number) => { const s = shaders.find((x) => gl.getShaderParameter(x, gl.SHADER_TYPE) === type); return s === undefined ? "" : gl.getShaderSource(s) ?? ""; };
    const attributes: any[] = [];
    const count = gl.getProgramParameter(program.program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < count; i += 1) { const info = gl.getActiveAttrib(program.program, i); if (info !== null) attributes.push({ name: info.name, type: info.type, size: info.size, location: gl.getAttribLocation(program.program, info.name) }); }
    programs.push({ index, program, name: program.name, cacheKey: String(program.cacheKey ?? "").slice(0, 400), leaves, vert: src(gl.VERTEX_SHADER), frag: src(gl.FRAGMENT_SHADER), attributes });
    return index;
  }
  for (const program of renderer.info.programs ?? []) patchProgram(program);

  // ---- textures (resolved from GL handles at the end) and their contents ----
  const threeTextures = new Map<number, any>(); // handle id -> three texture seen in a uniform
  const textureVersions = new Map<number, number>();
  const textureRefs: any[] = [];
  function textureRef(tex: any): number {
    if (tex === null || tex === undefined) return -1;
    const props = renderer.properties.get(tex);
    const h = props.__webglTexture;
    if (h === undefined) return -2;
    const id = handleId(h);
    if (!threeTextures.has(id)) threeTextures.set(id, tex);
    // A data texture whose contents change while recording (bones, lookup tables) is captured each time.
    if (rec.on && tex.isRenderTargetTexture !== true && tex.image?.data !== undefined && ArrayBuffer.isView(tex.image.data)) {
      const v = tex.version;
      if (textureVersions.get(id) !== v) {
        textureVersions.set(id, v);
        const ref = append(data, tex.image.data);
        textureRefs.push({ handle: id, frame: rec.frames, ...ref });
        event([OP.TEXDATA, id, textureRefs.length - 1]);
      }
    }
    return id;
  }

  // ---- geometry (attributes by name) and buffer contents ----
  const geometries: any[] = [];
  const geometryIds = new WeakMap<object, number>();
  const attrVersion = new WeakMap<object, number>();
  const attrIds = new WeakMap<object, number>();
  const attrs: any[] = [];
  const bufferRefs: any[] = [];
  function attributeFloats(attr: any): ArrayBufferView {
    const count = attr.count, size = attr.itemSize;
    if (attr.isInterleavedBufferAttribute !== true && attr.array.length === count * size) return attr.array;
    const out = new Float32Array(count * size);
    const get = [attr.getX, attr.getY, attr.getZ, attr.getW];
    for (let i = 0; i < count; i += 1) for (let c = 0; c < size; c += 1) out[i * size + c] = get[c]!.call(attr, i);
    return out;
  }
  function attributeId(attr: any): number {
    let id = attrIds.get(attr);
    const version = attr.isInterleavedBufferAttribute ? attr.data.version : attr.version;
    if (id === undefined) {
      id = attrs.length;
      attrIds.set(attr, id);
      const arr = attributeFloats(attr);
      attrs.push({ id, itemSize: attr.itemSize, count: attr.count, normalized: attr.normalized === true, array: arr.constructor.name, instanced: attr.isInstancedBufferAttribute === true || attr.data?.isInstancedInterleavedBuffer === true, meshPerAttribute: attr.meshPerAttribute ?? attr.data?.meshPerAttribute ?? 1, ...append(data, arr) });
      attrVersion.set(attr, version);
    } else if (attrVersion.get(attr) !== version) {
      attrVersion.set(attr, version);
      // Offsets go in a side table: the event stream is Float32 and byte offsets outgrow its integers.
      bufferRefs.push({ attribute: id, frame: rec.frames, ...append(data, attributeFloats(attr)) });
      event([OP.BUFFER, id, bufferRefs.length - 1]);
    }
    return id;
  }
  function geometryId(geometry: any, object: any): number {
    const key = object.isInstancedMesh === true || object.isSkinnedMesh === true || object.isBatchedMesh === true ? object : geometry;
    let id = geometryIds.get(key);
    const named: Record<string, number> = {};
    for (const [name, attr] of Object.entries(geometry.attributes)) named[name] = attributeId(attr);
    if (object.isInstancedMesh === true) {
      named["instanceMatrix"] = attributeId(object.instanceMatrix);
      if (object.instanceColor !== null) named["instanceColor"] = attributeId(object.instanceColor);
    }
    let index = -1;
    if (geometry.index !== null) index = attributeId(geometry.index);
    if (id === undefined) {
      id = geometries.length;
      geometryIds.set(key, id);
      geometries.push({ id, name: geometry.name, object: object.name || object.type, attributes: named, index });
    }
    return id;
  }

  // ---- draws ----
  const objects: any[] = [];
  const objectIds = new WeakMap<object, number>();
  let current: any = null;
  const proto: any = { renderBufferDirect: renderer.renderBufferDirect };
  renderer.renderBufferDirect = function (camera: any, scene: any, geometry: any, material: any, object: any, group: any) {
    current = { camera, geometry, material, object, group };
    try { return proto.renderBufferDirect.call(this, camera, scene, geometry, material, object, group); } finally { current = null; }
  };
  function objectId(object: any): number {
    let id = objectIds.get(object);
    if (id === undefined) { id = objects.length; objectIds.set(object, id); objects.push({ id, name: object.name || object.parent?.name || "", type: object.type }); }
    return id;
  }
  function onDraw(name: string, args: any[]): void {
    if (st.fb === null) rec.canvasDrawn = true;
    if (!rec.on) return;
    if (current === null) { event([OP.DRAW, -1]); return; }
    const programIndex = programOf.get(st.program) ?? (() => { const p = renderer.info.programs.find((x: any) => x.program === st.program); return p === undefined ? -1 : patchProgram(p); })();
    const geo = geometryId(current.geometry, current.object);
    const indexed = name.startsWith("drawElements");
    const instanced = name.endsWith("Instanced");
    const mode = args[0];
    // drawArrays(mode, first, count[, n]); drawElements(mode, count, type, byteOffset[, n]).
    const start = indexed ? args[3] / (args[2] === gl.UNSIGNED_INT ? 4 : args[2] === gl.UNSIGNED_SHORT ? 2 : 1) : args[1];
    const vcount = indexed ? args[1] : args[2];
    const instances = instanced ? args[indexed ? 4 : 3] : 1;
    // Uniform values that changed since this program's last recorded draw.
    const deltas: number[] = [];
    const p = programs[programIndex];
    if (p !== undefined) {
      p.leaves.forEach((leaf: any, i: number) => {
        const v = leaf.u.__jgv;
        if (v === undefined) return;
        const f = flattenUniform(v);
        let values: number[];
        if (f.kind === "tex") values = f.textures.map((t: any) => textureRef(t));
        else values = f.values;
        const last = leaf.last;
        let same = last !== null && last.length === values.length;
        if (same) for (let k = 0; k < values.length; k += 1) if (last[k] !== values[k]) { same = false; break; }
        if (same) return;
        leaf.last = values;
        deltas.push(i, values.length, ...values);
      });
    }
    event([OP.DRAW, programIndex, stateId(), geo, mode, start, vcount, instances, indexed ? 1 : 0, objectId(current.object), current.object.matrixWorld.determinantAffine?.() < 0 ? 1 : 0, ...viewScissor(), deltas.length, ...deltas]);
  }

  // ---- frames and readbacks ----
  // A frame is one animation-frame task that drew to the canvas. Every rAF callback is wrapped so
  // the boundary (and a readback, which must happen in the task three drew in, since the canvas
  // keeps no copy) runs right after it.
  const pixels = blob();
  function endTask(): void {
    if (!rec.canvasDrawn) return;
    rec.canvasDrawn = false;
    if (!rec.on) return;
    const frame = rec.frames;
    if (rec.readbackAt.has(frame)) {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const out = new Uint8Array(w * h * 4);
      const prev = st.fb;
      (gl as any).bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prev);
      rec.readbacks.push({ frame, width: w, height: h, ...append(pixels, out) });
    }
    rec.frames += 1;
    rec.times.push(performance.now());
    rec.frameStarts.push(rec.events.length);
  }
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) => origRaf((t) => { try { cb(t); } finally { endTask(); } });

  const native: any = { main: null };
  g.__jgNative = native;

  native.identify = async (): Promise<unknown> => {
    const candidates: any[] = [];
    const spy = renderer.render;
    renderer.render = function (this: any, scene: any, camera: any) {
      if (scene?.isScene === true && camera?.isPerspectiveCamera === true) candidates.push({ scene, camera });
      return spy.call(this, scene, camera);
    };
    for (let i = 0; i < 3; i += 1) await new Promise((r) => origRaf(() => r(null)));
    renderer.render = spy;
    let best: any = null, bestNodes = -1;
    for (const c of candidates) { let n = 0; c.scene.traverse(() => { n += 1; }); if (n > bestNodes) { best = c; bestNodes = n; } }
    if (best === null) throw new Error("no perspective scene render seen in 3 frames");
    native.main = best;
    return { nodes: bestNodes, programs: programs.length, canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
  };

  /** Record from the next frame; read the canvas back on the listed frame numbers. */
  native.start = (readbackFrames: number[]): void => {
    rec.readbackAt = new Set(readbackFrames);
    // Every program's uniforms are recorded in full on its first draw.
    for (const p of programs) for (const leaf of p.leaves) leaf.last = null;
    rec.on = true;
    rec.canvasDrawn = false;
    rec.frameStarts = [rec.events.length];
    rec.times = [performance.now()];
  };
  native.addReadback = (offset: number): number => { const f = rec.frames + offset; rec.readbackAt.add(f); return f; };
  native.status = (): unknown => ({ frames: rec.frames, events: rec.events.length, readbacks: rec.readbacks.length });

  native.stop = async (prefix: string): Promise<unknown> => {
    rec.on = false;
    // Resolve every GL handle the stream named.
    const fbs: any[] = [];
    const texDescs: any[] = [];
    const resolved = new Map<number, any>();
    const describeTexture = (tex: any, id: number): any => {
      const image = tex.image ?? {};
      const d: any = { handle: id, uuid: tex.uuid, name: tex.name, kind: tex.constructor?.name, width: image.width ?? 0, height: image.height ?? 0, depth: image.depth ?? 1, format: tex.format, type: tex.type, internalFormat: tex.internalFormat, colorSpace: tex.colorSpace, wrapS: tex.wrapS, wrapT: tex.wrapT, wrapR: tex.wrapR, magFilter: tex.magFilter, minFilter: tex.minFilter, anisotropy: tex.anisotropy, generateMipmaps: tex.generateMipmaps, flipY: tex.flipY, unpackAlignment: tex.unpackAlignment, premultiplyAlpha: tex.premultiplyAlpha, compareFunction: tex.compareFunction ?? null, isRenderTarget: tex.isRenderTargetTexture === true, isDepth: tex.isDepthTexture === true, isCube: tex.isCubeTexture === true, is3D: tex.isData3DTexture === true, isArray: tex.isDataArrayTexture === true, isCompressed: tex.isCompressedTexture === true };
      if (d.isRenderTarget && d.isCube && !attachedHandles.has(id)) {
        // A cube render target filled before recording (the PMREM environment): read every face
        // and mip back as float, with float colour buffers enabled for the read.
        gl.getExtension("EXT_color_buffer_float");
        const levels = (tex.mipmaps?.length ?? 0) > 0 ? tex.mipmaps.map((m: any) => m.width) : [image.width ?? 0];
        const h = handleList[id] as WebGLTexture;
        const fb = gl.createFramebuffer();
        const prev = st.fb;
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, fb);
        d.faces = [];
        for (let level = 0; level < levels.length; level += 1) {
          const size = levels[level];
          for (let face = 0; face < 6; face += 1) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, h, level);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { d.missing = true; continue; }
            const out = new Float32Array(size * size * 4);
            gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, out);
            d.faces.push({ level, face, size, ...append(data, out) });
          }
        }
        d.width = levels[0]; d.height = levels[0]; d.source = "gpu-float";
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prev);
        gl.deleteFramebuffer(fb);
        renderer.state.reset();
        return d;
      }
      if (d.isRenderTarget || d.isDepth) return d;
      if (d.isCompressed) {
        d.mipmaps = (tex.mipmaps ?? []).map((m: any) => ({ width: m.width, height: m.height, ...append(data, m.data) }));
        return d;
      }
      if (ArrayBuffer.isView(image.data)) { Object.assign(d, { source: "data", array: image.data.constructor.name }, append(data, image.data)); return d; }
      // An image texture: read what the GPU holds (after three's flip and colour handling).
      const h = handleList[id] as WebGLTexture;
      const w = image.videoWidth ?? image.naturalWidth ?? image.width, hgt = image.videoHeight ?? image.naturalHeight ?? image.height;
      d.width = w; d.height = hgt;
      if (d.isCube || !(w > 0 && hgt > 0)) { d.missing = true; return d; }
      const fb = gl.createFramebuffer();
      const prev = st.fb;
      (gl as any).bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, h, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        const out = new Uint8Array(w * hgt * 4);
        gl.readPixels(0, 0, w, hgt, gl.RGBA, gl.UNSIGNED_BYTE, out);
        Object.assign(d, { source: "gpu", array: "Uint8Array" }, append(data, out));
      } else d.missing = true;
      (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prev);
      gl.deleteFramebuffer(fb);
      renderer.state.reset();
      return d;
    };
    // Textures the stream renders into get their contents from the replay; the rest are read back.
    const attachedHandles = new Set<number>();
    for (const rt of native.targets ?? []) for (const t of [...(rt.textures ?? [rt.texture]), rt.depthTexture]) { const h = t ? renderer.properties.get(t).__webglTexture : undefined; if (h !== undefined) attachedHandles.add(handleId(h)); }
    for (const [id, tex] of threeTextures) resolved.set(id, describeTexture(tex, id));
    // Render targets: every framebuffer handle the stream bound.
    const rts = new Set<any>();
    const scanTargets = (): void => {
      const seen = new Set<any>();
      const add = (rt: any) => { if (rt?.isRenderTarget === true && !seen.has(rt)) { seen.add(rt); rts.add(rt); } };
      native.main.scene.traverse((n: any) => { if (n.isLight && n.shadow?.map) add(n.shadow.map); });
      for (const rt of native.targets ?? []) add(rt);
    };
    scanTargets();
    for (const rt of rts) {
      const props = renderer.properties.get(rt);
      const fbList = Array.isArray(props.__webglFramebuffer) ? props.__webglFramebuffer.flat() : [props.__webglFramebuffer];
      const textures = (rt.textures ?? [rt.texture]).map((t: any) => { const h = renderer.properties.get(t).__webglTexture; const id = h === undefined ? -1 : handleId(h); if (id >= 0 && !resolved.has(id)) resolved.set(id, describeTexture(t, id)); return id; });
      let depth = -1;
      if (rt.depthTexture) { const h = renderer.properties.get(rt.depthTexture).__webglTexture; if (h !== undefined) { depth = handleId(h); if (!resolved.has(depth)) resolved.set(depth, describeTexture(rt.depthTexture, depth)); } }
      for (const fb of fbList) if (fb !== undefined) fbs.push({ handle: handleId(fb), width: rt.width, height: rt.height, samples: rt.samples ?? 0, depthBuffer: rt.depthBuffer, stencilBuffer: rt.stencilBuffer, textures, depth, name: rt.texture?.name ?? "" });
      const ms = props.__webglMultisampledFramebuffer;
      if (ms !== undefined) fbs.push({ handle: handleId(ms), width: rt.width, height: rt.height, samples: rt.samples, multisampled: true, textures, depth, name: rt.texture?.name ?? "" });
    }
    for (const d of resolved.values()) texDescs.push(d);
    // Events: flattened into one Float32 array with row offsets.
    const lengths = rec.events.map((r: number[]) => r.length);
    let total = 0; for (const n of lengths) total += n;
    const flat = new Float32Array(total);
    let at = 0; for (const r of rec.events) { flat.set(r, at); at += r.length; }
    const events = append(data, flat);
    const rows = append(data, Int32Array.from(lengths));
    const manifest = {
      three: renderer.constructor?.REVISION ?? null,
      canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      frames: rec.frames, frameStarts: rec.frameStarts, times: rec.times,
      events: { ...events, rows: rec.events.length, rowLengths: rows },
      states, geometries, attributes: attrs, objects, textures: texDescs, textureData: textureRefs, bufferData: bufferRefs, framebuffers: fbs,
      programs: programs.map((p) => ({ index: p.index, name: p.name, cacheKey: p.cacheKey, attributes: p.attributes, uniforms: p.leaves.map((l: any) => ({ name: l.name, type: l.type, size: l.size })) })),
      readbacks: rec.readbacks,
      unresolvedHandles: handleList.length,
    };
    await put(`${prefix}stream.bin`, concat(data));
    await put(`${prefix}readbacks.bin`, concat(pixels));
    for (const p of programs) {
      await put(`${prefix}programs/${String(p.index).padStart(3, "0")}.vert`, p.vert);
      await put(`${prefix}programs/${String(p.index).padStart(3, "0")}.frag`, p.frag);
    }
    await put(`${prefix}stream.json`, JSON.stringify(manifest));
    return { frames: rec.frames, events: rec.events.length, programs: programs.length, geometries: geometries.length, attributes: attrs.length, textures: texDescs.length, framebuffers: fbs.length, readbacks: rec.readbacks.length, bytes: data.size, seconds: rec.times.length > 1 ? (rec.times[rec.times.length - 1] - rec.times[0]) / 1000 : 0 };
  };

  // Remember every render target three binds, so the end can resolve their framebuffers.
  native.targets = new Set<any>();
  const setRT = renderer.setRenderTarget;
  renderer.setRenderTarget = function (this: any, rt: any, face?: number, mip?: number) { if (rt !== null && rt !== undefined) native.targets.add(rt); return setRT.call(this, rt, face, mip); };

  return { ok: true, summary: { programs: programs.length } };
}
