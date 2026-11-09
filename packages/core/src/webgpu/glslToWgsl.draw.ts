/**
 * three.js GLSL ES 3.00 programs translated to WGSL by `native/crates/jg-shader` (naga), built to
 * `glslToWgsl.wasm` by `bun scripts/build-glsl-translator.ts`. Loaded once per page. {@link translateGlslAsync}
 * translates on a few worker threads, as a GPU driver compiles WebGL programs in parallel;
 * {@link translateGlsl} translates on the calling thread.
 */

/** One vertex input of a translated program: a three attribute name, or one column of a matrix attribute. */
export interface WgslVertexInput {
  name: string;
  column: number;
  location: number;
  components: number;
  kind: "f" | "i" | "u";
}

/** Where one of three's uniform names lives in the program's std140 block. */
export interface WgslUniformSlot {
  name: string;
  offset: number;
  kind: "f" | "i" | "u";
  columns: number;
  rows: number;
  column_stride: number;
  count: number;
  stride: number;
  /** Declared as an array (GL names it `name[0]`), even with one element. */
  array: boolean;
}

/** A sampler uniform split into a texture and a sampler binding in group 1. */
export interface WgslSamplerSlot {
  name: string;
  element: number;
  texture_binding: number;
  sampler_binding: number;
  kind: "Float" | "Depth" | "Sint" | "Uint";
  dim: "D2" | "Cube" | "D3" | "D2Array";
  /** Declared as an array, even of one: GL names it `name[0]`. */
  array?: boolean;
}

/** The translated program and what feeding it takes. */
export interface WgslProgram {
  vertex_wgsl: string;
  fragment_wgsl: string;
  layout: {
    vertex_inputs: WgslVertexInput[];
    uniform_size: number;
    uniforms: WgslUniformSlot[];
    samplers: WgslSamplerSlot[];
    fragment_outputs: number;
  };
}

/** What translating one program gives: the program, or why it does not translate. */
export type TranslateResult = { ok: WgslProgram } | { error: string };

interface TranslatorExports {
  memory: WebAssembly.Memory;
  jg_alloc(len: number): number;
  jg_free(ptr: number, len: number): void;
  jg_translate(vert: number, vertLen: number, frag: number, fragLen: number): number;
}

let module: WebAssembly.Module | null = null;
let instance: TranslatorExports | null = null;
let loading: Promise<void> | null = null;

/** Fetch and compile the translator once. Resolves when {@link translateGlsl} can run. */
export function loadGlslTranslator(url: URL | string = new URL("./glslToWgsl.wasm", import.meta.url)): Promise<void> {
  if (module !== null) return Promise.resolve();
  loading ??= (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`glslToWgsl.wasm: HTTP ${response.status}`);
    module = await WebAssembly.compile(await response.arrayBuffer());
    instance = (await WebAssembly.instantiate(module, {})).exports as unknown as TranslatorExports;
    startWorkers(module);
  })();
  return loading;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function write(api: TranslatorExports, text: string): [number, number] {
  const bytes = encoder.encode(text);
  const ptr = api.jg_alloc(bytes.length);
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  return [ptr, bytes.length];
}

/**
 * Translate one program exactly as three passed it to GL. Returns the WGSL and layout, or the
 * translator's error (what a failed `linkProgram` reports).
 */
export function translateGlsl(vertex: string, fragment: string): TranslateResult {
  if (module === null || instance === null) return { error: "the GLSL translator is not loaded (await loadGlslTranslator() first)" };
  const api = instance;
  const [vp, vl] = write(api, vertex);
  const [fp, fl] = write(api, fragment);
  try {
    const out = api.jg_translate(vp, vl, fp, fl);
    const len = new DataView(api.memory.buffer).getUint32(out, true);
    const json = decoder.decode(new Uint8Array(api.memory.buffer, out + 4, len));
    api.jg_free(out, 4 + len);
    return JSON.parse(json) as TranslateResult;
  } catch (error) {
    // A trap leaves the instance's allocator in an unknown state: start a fresh one.
    instance = new WebAssembly.Instance(module, {}).exports as unknown as TranslatorExports;
    return { error: `the GLSL translator trapped: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (api === instance) {
      api.jg_free(vp, vl);
      api.jg_free(fp, fl);
    }
  }
}

/** A translation running on a worker. */
export interface PendingTranslation {
  /** Whether the worker's result has arrived. */
  done(): boolean;
  /** The result: the worker's when it has arrived, otherwise translated now on this thread. */
  finish(): TranslateResult;
  /** Call `callback` once when the worker's result arrives (never, without workers: then call {@link finish}). */
  onDone(callback: () => void): void;
}

// The worker runs the same calls as translateGlsl, on its own instance of the module.
const WORKER_SOURCE = `
let api = null;
let mod = null;
const queue = [];
const enc = new TextEncoder();
const dec = new TextDecoder();
function put(text) { const b = enc.encode(text); const p = api.jg_alloc(b.length); new Uint8Array(api.memory.buffer, p, b.length).set(b); return [p, b.length]; }
function run(m) {
  const [vp, vl] = put(m.vertex);
  const [fp, fl] = put(m.fragment);
  try {
    const out = api.jg_translate(vp, vl, fp, fl);
    const len = new DataView(api.memory.buffer).getUint32(out, true);
    const json = dec.decode(new Uint8Array(api.memory.buffer, out + 4, len));
    api.jg_free(out, 4 + len);
    api.jg_free(vp, vl);
    api.jg_free(fp, fl);
    postMessage({ id: m.id, result: JSON.parse(json) });
  } catch (error) {
    api = new WebAssembly.Instance(mod, {}).exports;
    postMessage({ id: m.id, result: { error: "the GLSL translator trapped: " + (error && error.message || error) } });
  }
}
onmessage = (e) => {
  const m = e.data;
  if (m.module) {
    mod = m.module;
    WebAssembly.instantiate(mod, {}).then((i) => { api = i.exports; for (const q of queue.splice(0)) run(q); });
    return;
  }
  if (api === null) queue.push(m); else run(m);
};`;

interface Job {
  vertex: string;
  fragment: string;
  result: TranslateResult | null;
  onDone: (() => void) | null;
}

let workers: { worker: Worker; queued: number }[] = [];
const jobs = new Map<number, Job>();
let nextJob = 1;

function startWorkers(compiled: WebAssembly.Module): void {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || workers.length > 0) return;
  const count = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2));
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker(url);
      const entry = { worker, queued: 0 };
      worker.onmessage = (event: MessageEvent<{ id: number; result: TranslateResult }>) => {
        const job = jobs.get(event.data.id);
        entry.queued -= 1;
        if (job === undefined) return;
        jobs.delete(event.data.id);
        job.result ??= event.data.result;
        const done = job.onDone;
        job.onDone = null;
        done?.();
      };
      worker.postMessage({ module: compiled });
      workers.push(entry);
    }
  } catch {
    // No workers here (a strict content policy): every translation runs on the calling thread.
    workers = [];
  }
}

/**
 * Start translating one program on the least busy worker. Without workers the translation runs
 * when {@link PendingTranslation.finish} is called.
 */
export function translateGlslAsync(vertex: string, fragment: string): PendingTranslation {
  const job: Job = { vertex, fragment, result: null, onDone: null };
  let least = workers[0];
  for (const w of workers) if (least === undefined || w.queued < least.queued) least = w;
  if (least !== undefined) {
    const id = nextJob++;
    jobs.set(id, job);
    least.queued += 1;
    least.worker.postMessage({ id, vertex, fragment });
  }
  return {
    done: () => job.result !== null || least === undefined,
    finish: () => {
      job.result ??= translateGlsl(vertex, fragment);
      return job.result;
    },
    onDone: (callback) => {
      if (least === undefined) return;
      if (job.result !== null) queueMicrotask(callback);
      else job.onDone = callback;
    },
  };
}
