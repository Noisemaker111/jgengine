/**
 * three hands plain JS arrays to `uniform*fv` whenever a vector or matrix uniform's value was
 * authored as an array (single vec3 uniforms, flat array uniforms, matrix arrays). Blink's
 * `sequence<float>` binding then allocates a temporary vector for every call — per uniform, per
 * material, per frame — which the allocation profiler showed as the top engine-side garbage
 * (`setValueV3f` and siblings in `WebGLUniforms.js`). Copying the values into a pooled typed array
 * here, once per context prototype, keeps the upload allocation-free for every game; the values
 * and validation are identical because a typed-array store performs the same ToNumber/ToInt32
 * conversion Blink's sequence binding did.
 */

type PooledBuffer = Float32Array | Int32Array | Uint32Array;
type BufferCtor = Float32ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor;

const FLOAT_UPLOADS = [
  "uniform1fv",
  "uniform2fv",
  "uniform3fv",
  "uniform4fv",
  "uniformMatrix2fv",
  "uniformMatrix3fv",
  "uniformMatrix4fv",
] as const;
const INT_UPLOADS = ["uniform1iv", "uniform2iv", "uniform3iv", "uniform4iv"] as const;
const UINT_UPLOADS = ["uniform1uiv", "uniform2uiv", "uniform3uiv", "uniform4uiv"] as const;

const pools = new Map<BufferCtor, Map<number, PooledBuffer>>();
const patched = new WeakSet<object>();

function pooledBuffer(ctor: BufferCtor, length: number): PooledBuffer {
  let byLength = pools.get(ctor);
  if (byLength === undefined) {
    byLength = new Map();
    pools.set(ctor, byLength);
  }
  let buffer = byLength.get(length);
  if (buffer === undefined) {
    buffer = new ctor(length);
    byLength.set(length, buffer);
  }
  return buffer;
}

/**
 * The pooled typed array `data` should upload as, or `undefined` when `data` already is one (or is
 * not array-like at all, so the native binding keeps its own error path). Anything else — a plain
 * array, a `Float64Array`, an arguments object — is copied element-wise, which is the same
 * conversion the sequence binding performed, minus the allocation.
 */
export function pooledUniformData(data: unknown, ctor: BufferCtor): PooledBuffer | undefined {
  if (typeof data !== "object" || data === null || ctor.prototype.isPrototypeOf(data)) return undefined;
  const length = (data as ArrayLike<number>).length;
  if (typeof length !== "number" || length <= 0 || length > 0xffff) return undefined;
  const buffer = pooledBuffer(ctor, length);
  for (let i = 0; i < length; i += 1) {
    const value = (data as ArrayLike<number>)[i];
    buffer[i] = value === undefined ? Number.NaN : value;
  }
  return buffer;
}

type UniformMethod = (this: WebGL2RenderingContext, ...args: unknown[]) => unknown;

function wrapUpload(table: Record<string, unknown>, name: string, ctor: BufferCtor): void {
  const original = table[name] as UniformMethod | undefined;
  if (typeof original !== "function" || (original as { __jgPooled?: boolean }).__jgPooled === true) return;
  const wrapped: UniformMethod = function (this: WebGL2RenderingContext, ...args: unknown[]) {
    const converted = pooledUniformData(args[args.length - 1], ctor);
    if (converted !== undefined) args[args.length - 1] = converted;
    return original.apply(this, args);
  };
  (wrapped as { __jgPooled?: boolean }).__jgPooled = true;
  table[name] = wrapped;
}

/**
 * Route every vector/matrix uniform upload on `proto` through {@link pooledUniformData}. Idempotent
 * per prototype object.
 */
export function patchUniformUploads(proto: object): void {
  if (patched.has(proto)) return;
  patched.add(proto);
  // type-escape: the fifteen uniform*{f,i,ui}v entry points share one (location, ..., data) tail,
  // so one generic wrapper serves them all; the prototype table has per-name signatures.
  const table = proto as Record<string, unknown>;
  for (const name of FLOAT_UPLOADS) wrapUpload(table, name, Float32Array);
  for (const name of INT_UPLOADS) wrapUpload(table, name, Int32Array);
  for (const name of UINT_UPLOADS) wrapUpload(table, name, Uint32Array);
}

let installed = false;

/** Install the pooled uploads on the real WebGL2 prototype; a no-op outside a browser. */
export function installUniformUploads(): void {
  if (installed || typeof WebGL2RenderingContext === "undefined") return;
  installed = true;
  patchUniformUploads(WebGL2RenderingContext.prototype);
}
