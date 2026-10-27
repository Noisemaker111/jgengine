import type { RenderCallback, RootStore } from "@react-three/fiber";
import type { WebGLRenderer } from "three";

import { devtools } from "@jgengine/core/devtools/devtools";

import {
  summarizeBreakdown,
  type DrawCost,
  type FrameBreakdown,
  type FrameBreakdownRecord,
} from "./frameBreakdown";

/**
 * The live half of the frame breakdown: hooks one three.js renderer, its WebGL context and the r3f
 * frame loop, and fills one {@link FrameBreakdownRecord} per frame.
 *
 * - CPU per system: the sim's named phases and stages (`devtools.profile`), every r3f frame callback
 *   (`frame#<n>`, named in `callbacks()` by its source), render submission and each post pass.
 * - GPU per pass: `EXT_disjoint_timer_query_webgl2` around the shadow pass, the main render and each
 *   post pass. Only one timer runs at a time in WebGL, so a nested pass pauses its parent's timer.
 * - Counts: draws and triangles (per object and material too), shader links and the time spent on
 *   them, texture and buffer uploads, and the JS heap (a drop between frames is a collection).
 *
 * Dev only: it installs where the frame telemetry does, and `window.__jgFrameBreakdown` reads it.
 */

/** Frames kept: 30 s at 144 Hz. */
const CAPACITY = 4320;
/** Pending GPU timers kept before the oldest are dropped unread. */
const MAX_PENDING_QUERIES = 512;

type Callable = (...args: unknown[]) => unknown;

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}


let active: FrameBreakdown | null = null;
let activePasses: ((composer: { passes: readonly object[] }) => void) | null = null;

/**
 * Time each post pass of a composer by name, CPU and GPU. Cheap when no breakdown is installed; call
 * it each frame before `composer.render` so passes added later are timed too.
 */
export function measureComposerPasses(composer: { passes: readonly object[] }): void {
  activePasses?.(composer);
}

/** Post passes and frame callbacks already timed, so a second sighting does not wrap them twice. */
const wrapped = new WeakSet<object>();

/** One field of a value the engine does not type here (a three.js object, a GL argument); `undefined` off a non-object. */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  const read = field(value, key);
  return typeof read === "number" ? read : undefined;
}

function nameField(value: unknown, key: string): string | undefined {
  const read = field(value, key);
  return typeof read === "string" && read !== "" ? read : undefined;
}

function heapMb(): number | null {
  const used = numberField(Reflect.get(performance, "memory"), "usedJSHeapSize");
  return used === undefined ? null : used / 1048576;
}

function uploadBytes(method: string, args: readonly unknown[]): number {
  for (const arg of args) {
    if (ArrayBuffer.isView(arg)) return arg.byteLength;
  }
  const source = args.at(-1);
  const width = numberField(source, "videoWidth") ?? numberField(source, "width") ?? 0;
  const height = numberField(source, "videoHeight") ?? numberField(source, "height") ?? 0;
  if (width > 0 && height > 0) return width * height * 4;
  const [, size, , texWidth, texHeight] = args;
  if (method.startsWith("tex") && typeof texWidth === "number" && typeof texHeight === "number") return texWidth * texHeight * 4;
  if (typeof size === "number") return size;
  return 0;
}

function labelOf(thing: unknown, fallback: string): string {
  if (typeof thing !== "object" || thing === null) return fallback;
  return `${nameField(thing, "name") ?? nameField(thing, "type") ?? fallback}#${numberField(thing, "id") ?? "?"}`;
}

/** "Rock (InstancedMesh, DodecahedronGeometry) in Boulders#41": what a draw is, by its nearest named ancestor. */
function objectLabel(object: unknown, geometry: unknown): string {
  if (typeof object !== "object" || object === null) return "object";
  const own = nameField(object, "name");
  let ancestor = field(object, "parent");
  for (let depth = 0; typeof ancestor === "object" && ancestor !== null && depth < 8 && nameField(ancestor, "name") === undefined; depth += 1) ancestor = field(ancestor, "parent");
  const objectType = nameField(object, "type") ?? "Object";
  const geometryType = nameField(geometry, "type");
  const kind = `${objectType}${geometryType === undefined ? "" : `, ${nameField(geometry, "name") ?? geometryType}`}`;
  const ancestorName = nameField(ancestor, "name");
  const where = ancestorName === undefined ? "" : ` in ${ancestorName}`;
  return `${own ?? objectType} (${kind})${where} #${numberField(object, "id") ?? "?"}`;
}

function trianglesOf(geometry: unknown, group: unknown, object: unknown): number {
  if (typeof geometry !== "object" || geometry === null) return 0;
  let count = numberField(field(geometry, "index"), "count") ?? numberField(field(field(geometry, "attributes"), "position"), "count") ?? 0;
  const range = numberField(field(geometry, "drawRange"), "count");
  if (range !== undefined && Number.isFinite(range)) count = Math.min(count, range);
  const groupCount = numberField(group, "count");
  if (groupCount !== undefined && Number.isFinite(groupCount)) count = Math.min(count, groupCount);
  const instances = field(object, "isInstancedMesh") === true ? (numberField(object, "count") ?? 1) : (numberField(geometry, "instanceCount") ?? 1);
  return Math.floor(count / 3) * Math.max(1, Number.isFinite(instances) ? instances : 1);
}

/**
 * A WebGL2 context with the disjoint timer extension, or `null`: GPU timers need both, and without
 * them the breakdown still records CPU, compile and upload times.
 */
function gpuTimers(context: WebGLRenderingContext | WebGL2RenderingContext): { gl: WebGL2RenderingContext; ext: TimerExt } | null {
  if (!("createQuery" in context)) return null;
  const ext: unknown = context.getExtension("EXT_disjoint_timer_query_webgl2");
  const elapsed = numberField(ext, "TIME_ELAPSED_EXT");
  const disjoint = numberField(ext, "GPU_DISJOINT_EXT");
  return elapsed === undefined || disjoint === undefined ? null : { gl: context, ext: { TIME_ELAPSED_EXT: elapsed, GPU_DISJOINT_EXT: disjoint } };
}

/** Install the breakdown on a renderer and the r3f loop driving it. @internal */
export function installFrameBreakdown(renderer: WebGLRenderer, store: RootStore): FrameBreakdown {
  active?.dispose();
  const context = renderer.getContext();
  const timers = gpuTimers(context);
  const restore: (() => void)[] = [];

  const records: FrameBreakdownRecord[] = [];
  let next = 0;
  const pushRecord = (record: FrameBreakdownRecord) => {
    if (records.length < CAPACITY) records.push(record);
    else records[next] = record;
    next = (next + 1) % CAPACITY;
  };
  const ordered = () => (records.length < CAPACITY ? records.slice() : [...records.slice(next), ...records.slice(0, next)]);

  // The frame being filled.
  let current: FrameBreakdownRecord | null = null;
  let frameStart = 0;
  let lastWorkEnd = 0;
  let lastHeap: number | null = null;
  const addCpu = (name: string, ms: number) => {
    if (current !== null && ms > 0) current.cpu[name] = (current.cpu[name] ?? 0) + ms;
  };
  // Self time: each timed scope pays only for what its nested scopes did not, so the CPU list adds up
  // to the frame's work instead of counting a pass inside a callback twice.
  const cpuStack: { label: string; start: number; child: number }[] = [];
  const cpuEnter = (label: string) => {
    cpuStack.push({ label, start: performance.now(), child: 0 });
  };
  const cpuLeave = (excluded = 0): number => {
    const end = performance.now();
    const top = cpuStack.pop();
    if (top === undefined) return end;
    const total = end - top.start;
    addCpu(top.label, total - top.child - excluded);
    const parent = cpuStack[cpuStack.length - 1];
    if (parent !== undefined) parent.child += total;
    return end;
  };
  const fresh = (): FrameBreakdownRecord => ({
    intervalMs: 0, workMs: 0, cpu: {}, gpu: timers === null ? null : {}, draws: 0, triangles: 0,
    compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0,
  });

  // GPU timers: a stack of pass labels, one query running for the top of it.
  const gpuStack: string[] = [];
  let running: { query: WebGLQuery; label: string; record: FrameBreakdownRecord } | null = null;
  const pending: { query: WebGLQuery; label: string; record: FrameBreakdownRecord }[] = [];
  const unresolved = new Map<FrameBreakdownRecord, number>();
  const stopTimer = () => {
    if (timers === null || running === null) return;
    timers.gl.endQuery(timers.ext.TIME_ELAPSED_EXT);
    pending.push(running);
    unresolved.set(running.record, (unresolved.get(running.record) ?? 0) + 1);
    running = null;
    if (pending.length > MAX_PENDING_QUERIES) {
      const dropped = pending.shift();
      if (dropped !== undefined) timers.gl.deleteQuery(dropped.query);
    }
  };
  const startTimer = (label: string) => {
    if (timers === null || current === null) return;
    const query = timers.gl.createQuery();
    if (query === null) return;
    timers.gl.beginQuery(timers.ext.TIME_ELAPSED_EXT, query);
    running = { query, label, record: current };
  };
  const enterPass = (label: string) => {
    stopTimer();
    gpuStack.push(label);
    startTimer(label);
  };
  const leavePass = () => {
    stopTimer();
    gpuStack.pop();
    const parent = gpuStack[gpuStack.length - 1];
    if (parent !== undefined) startTimer(parent);
  };
  const readTimers = () => {
    if (timers === null || pending.length === 0) return;
    const { gl, ext } = timers;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT) === true) {
      for (const entry of pending.splice(0)) {
        gl.deleteQuery(entry.query);
        entry.record.gpu = null;
      }
      return;
    }
    for (let entry = pending[0]; entry !== undefined; entry = pending[0]) {
      if (gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE) !== true) break;
      pending.shift();
      const ns = Number(gl.getQueryParameter(entry.query, gl.QUERY_RESULT));
      gl.deleteQuery(entry.query);
      if (entry.record.gpu !== null) entry.record.gpu[entry.label] = (entry.record.gpu[entry.label] ?? 0) + ns / 1e6;
      const left = (unresolved.get(entry.record) ?? 1) - 1;
      if (left <= 0) unresolved.delete(entry.record);
      else unresolved.set(entry.record, left);
    }
  };

  // Wrap a method in place, keeping a restore. The wrapper calls the original on `target`.
  const wrap = (target: object, method: string, make: (original: Callable) => Callable) => {
    const original: unknown = Reflect.get(target, method);
    if (typeof original !== "function") return;
    const call: Callable = (...args) => Reflect.apply(original, target, args);
    Reflect.set(target, method, make(call));
    restore.push(() => {
      Reflect.set(target, method, original);
    });
  };

  // Render submission (CPU) and the main pass (GPU); a render inside a post pass belongs to that pass.
  let renderDepth = 0;
  wrap(renderer, "render", (original) => (...args) => {
    const outer = renderDepth === 0 && gpuStack.length === 0;
    if (outer) enterPass("main");
    renderDepth += 1;
    if (renderDepth === 1) cpuEnter(`render:${gpuStack[gpuStack.length - 1] ?? "main"}`);
    try {
      return original(...args);
    } finally {
      if (renderDepth === 1) lastWorkEnd = cpuLeave();
      renderDepth -= 1;
      if (outer) leavePass();
    }
  });
  wrap(renderer.shadowMap, "render", (original) => (...args) => {
    enterPass("shadow");
    cpuEnter("render:shadow");
    try {
      return original(...args);
    } finally {
      cpuLeave();
      leavePass();
    }
  });

  // Per object and material: draws, triangles and submit time, by the pass they were drawn in.
  const objects = new Map<string, DrawCost>();
  const materials = new Map<string, DrawCost>();
  const tally = (table: Map<string, DrawCost>, label: string, triangles: number, ms: number, pass: string) => {
    const entry = table.get(label);
    if (entry === undefined) table.set(label, { label, draws: 1, triangles, cpuMs: ms, pass });
    else {
      entry.draws += 1;
      entry.triangles += triangles;
      entry.cpuMs += ms;
    }
  };
  // Labels are built once per object and material: this runs for every draw, so building a string
  // there would be a cost of its own the breakdown reports.
  const objectLabels = new WeakMap<object, string>();
  const materialLabels = new WeakMap<object, string>();
  const labelFor = (cache: WeakMap<object, string>, thing: unknown, build: () => string): string => {
    if (typeof thing !== "object" || thing === null) return build();
    let label = cache.get(thing);
    if (label === undefined) {
      label = build();
      cache.set(thing, label);
    }
    return label;
  };
  wrap(renderer, "renderBufferDirect", (original) => (camera: unknown, scene: unknown, geometry: unknown, material: unknown, object: unknown, group: unknown) => {
    const start = performance.now();
    const compiledBefore = current?.compileMs ?? 0;
    try {
      return original(camera, scene, geometry, material, object, group);
    } finally {
      const ms = performance.now() - start;
      const triangles = trianglesOf(geometry, group, object);
      const pass = gpuStack[gpuStack.length - 1] ?? "main";
      if (current !== null) {
        current.draws += 1;
        current.triangles += triangles;
      }
      const objectName = labelFor(objectLabels, object, () => objectLabel(object, geometry));
      const materialName = labelFor(materialLabels, material, () => labelOf(material, "material"));
      tally(objects, objectName, triangles, ms, pass);
      tally(materials, materialName, triangles, ms, pass);
      // This draw built or first used a program: name it, so a compile hitch says what to warm up.
      if (current !== null && current.compileMs - compiledBefore >= 1) (current.shaders ??= []).push(`${materialName} on ${objectName}`);
    }
  });

  // Shader compiles and links, and uploads, on the context itself.
  const timed = (method: string, onCall: (ms: number, args: unknown[], result: unknown) => void) =>
    wrap(context, method, (original) => (...args) => {
      const start = performance.now();
      const result = original(...args);
      onCall(performance.now() - start, args, result);
      return result;
    });
  timed("linkProgram", (ms) => {
    if (current === null) return;
    current.compiles += 1;
    current.compileMs += ms;
  });
  // three asks a program for its uniforms and attributes at its first draw; those queries wait for the link.
  for (const method of ["compileShader", "getShaderParameter", "getProgramParameter", "getProgramInfoLog", "getShaderInfoLog", "getActiveUniform", "getActiveAttrib", "getUniformLocation", "getAttribLocation"]) {
    timed(method, (ms, args) => {
      if (current === null) return;
      if (method === "getProgramParameter" && args[1] !== context.LINK_STATUS) return;
      current.compileMs += ms;
    });
  }
  for (const method of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compressedTexImage2D", "compressedTexSubImage2D", "bufferData", "bufferSubData"]) {
    timed(method, (ms, args) => {
      if (current === null) return;
      current.uploads += 1;
      current.uploadBytes += uploadBytes(method, args);
      current.uploadMs += ms;
    });
  }

  // Post passes: wrapped per instance the first time a composer is seen with them.
  activePasses = (composer) => {
    for (const pass of composer.passes) {
      const render: unknown = Reflect.get(pass, "render");
      if (wrapped.has(pass) || typeof render !== "function") continue;
      const name = nameField(pass, "name") ?? pass.constructor.name;
      // The pass that draws the scene is the main pass, whatever the composer calls it.
      const label = /RenderPass$/.test(name) ? "main" : `post:${name.replace(/^_/, "")}`;
      wrapped.add(pass);
      Reflect.set(pass, "render", (...args: unknown[]): unknown => {
        enterPass(label);
        cpuEnter(label === "main" ? "pass:main" : label);
        try {
          return Reflect.apply(render, pass, args);
        } finally {
          lastWorkEnd = cpuLeave();
          leavePass();
        }
      });
    }
  };

  // Frame callbacks: each r3f subscriber timed under a stable label.
  const labels = new WeakMap<object, string>();
  const callbacks: Record<string, RenderCallback> = {};
  let nextLabel = 0;
  const wrapSubscribers = () => {
    for (const subscription of store.getState().internal.subscribers) {
      const fn = subscription.ref.current;
      if (typeof fn !== "function" || wrapped.has(fn) || fn === tick) continue;
      let label = labels.get(subscription.ref);
      if (label === undefined) {
        label = `frame#${nextLabel}${fn.name !== "" && fn.name !== "anonymous" ? `:${fn.name}` : ""}`;
        nextLabel += 1;
        labels.set(subscription.ref, label);
      }
      callbacks[label] = fn;
      const named = label;
      const timedCallback: RenderCallback = (state, delta, frame) => {
        const before = devtools.frame.last()?.serial ?? 0;
        cpuEnter(named);
        try {
          fn(state, delta, frame);
        } finally {
          const sim = devtools.frame.last();
          if (sim !== null && sim.serial !== before) {
            // This callback is the sim driver: its phases are systems of their own.
            let named = 0;
            for (const [phase, ms] of Object.entries(sim.phases)) {
              addCpu(`sim:${phase}`, ms);
              named += ms;
            }
            addCpu("sim:other", sim.simMs - named);
            cpuLeave(sim.simMs);
          } else cpuLeave();
        }
      };
      wrapped.add(timedCallback);
      subscription.ref.current = timedCallback;
    }
  };

  // The first callback of every frame closes the previous frame and opens the next.
  const tick: RenderCallback = () => {
    const now = performance.now();
    readTimers();
    if (current !== null) {
      current.intervalMs = now - frameStart;
      current.workMs = Math.max(0, lastWorkEnd - frameStart);
      const heap = heapMb();
      current.heapMb = heap;
      current.heapDropMb = heap !== null && lastHeap !== null && heap < lastHeap ? lastHeap - heap : 0;
      lastHeap = heap;
      pushRecord(current);
    }
    current = fresh();
    frameStart = now;
    lastWorkEnd = now;
    wrapSubscribers();
  };
  const tickRef = { current: tick };
  const unsubscribe = store.getState().internal.subscribe(tickRef, -Number.MAX_SAFE_INTEGER, store);
  restore.push(unsubscribe);

  const breakdown: FrameBreakdown = {
    summary(options = {}) {
      const programs = renderer.info.programs?.length ?? null;
      // Draw costs are gathered over the whole window, so a tail of it reports frames only.
      if (options.last !== undefined) return summarizeBreakdown(ordered().slice(-options.last), { objects: [], materials: [] }, { programs, top: options.top });
      return summarizeBreakdown(ordered(), { objects: [...objects.values()], materials: [...materials.values()] }, { programs, top: options.top });
    },
    records: ordered,
    callbacks: () => ({ ...callbacks }),
    reset() {
      records.length = 0;
      next = 0;
      objects.clear();
      materials.clear();
      current = null;
    },
    dispose() {
      stopTimer();
      for (const entry of pending.splice(0)) timers?.gl.deleteQuery(entry.query);
      for (const undo of restore.splice(0).reverse()) undo();
      if (active === breakdown) {
        active = null;
        activePasses = null;
      }
      delete window.__jgFrameBreakdown;
    },
  };
  active = breakdown;
  window.__jgFrameBreakdown = breakdown;
  return breakdown;
}

