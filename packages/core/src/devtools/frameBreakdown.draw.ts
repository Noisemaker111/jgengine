import { devtools } from "@jgengine/core/devtools/devtools";

import {
  summarizeBreakdown,
  type DrawCost,
  type FrameBreakdownRecord,
  type FrameBreakdownSummary,
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

interface Gl2 {
  createQuery(): WebGLQuery | null;
  deleteQuery(query: WebGLQuery): void;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(query: WebGLQuery, pname: number): unknown;
  getParameter(pname: number): unknown;
  getExtension(name: string): unknown;
  QUERY_RESULT: number;
  QUERY_RESULT_AVAILABLE: number;
  LINK_STATUS: number;
}

/** What the breakdown needs from a three.js WebGLRenderer. */
export interface BreakdownRenderer {
  getContext(): unknown;
  render(scene: unknown, camera: unknown): void;
  renderBufferDirect(camera: unknown, scene: unknown, geometry: unknown, material: unknown, object: unknown, group: unknown): void;
  shadowMap: { render(...args: unknown[]): void };
  info: { programs?: unknown[] | null };
}

/** What it needs from the r3f store: the subscriber list and the subscribe call. */
export interface BreakdownStore {
  getState(): {
    internal: {
      subscribers: { ref: { current: Callable }; priority: number }[];
      subscribe(ref: { current: Callable }, priority: number, store: unknown): () => void;
    };
  };
}

/** A running breakdown. */
export interface FrameBreakdown {
  /** The window so far, or its last `last` frames. */
  summary(options?: { top?: number; last?: number }): FrameBreakdownSummary;
  records(): FrameBreakdownRecord[];
  /** Each `frame#<n>` label with the callback it times, so a harness can name its source file. */
  callbacks(): Record<string, Callable>;
  reset(): void;
  dispose(): void;
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

const WRAPPED = Symbol("jgBreakdownWrapped");

function heapMb(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize / 1048576 : null;
}

function uploadBytes(method: string, args: readonly unknown[]): number {
  for (const arg of args) {
    if (ArrayBuffer.isView(arg)) return arg.byteLength;
  }
  const source = args[args.length - 1] as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | null;
  if (source !== null && typeof source === "object") {
    const width = source.videoWidth ?? source.width ?? 0;
    const height = source.videoHeight ?? source.height ?? 0;
    if (width > 0 && height > 0) return width * height * 4;
  }
  if (method.startsWith("tex") && typeof args[3] === "number" && typeof args[4] === "number") return (args[3] as number) * (args[4] as number) * 4;
  if (typeof args[1] === "number") return args[1] as number;
  return 0;
}

interface Named {
  name?: string;
  type?: string;
  id?: number;
  parent?: Named | null;
}

function labelOf(thing: Named | null | undefined, fallback: string): string {
  if (thing === null || thing === undefined) return fallback;
  const name = thing.name !== undefined && thing.name !== "" ? thing.name : (thing.type ?? fallback);
  return `${name}#${thing.id ?? "?"}`;
}

/** "Rock (InstancedMesh, DodecahedronGeometry) in Boulders#41": what a draw is, by its nearest named ancestor. */
function objectLabel(object: Named | null | undefined, geometry: Named | null | undefined): string {
  if (object === null || object === undefined) return "object";
  const own = object.name !== undefined && object.name !== "" ? object.name : null;
  let ancestor = object.parent ?? null;
  for (let depth = 0; ancestor !== null && depth < 8 && (ancestor.name === undefined || ancestor.name === ""); depth += 1) ancestor = ancestor.parent ?? null;
  const kind = `${object.type ?? "Object"}${geometry?.type !== undefined ? `, ${geometry.name !== undefined && geometry.name !== "" ? geometry.name : geometry.type}` : ""}`;
  const where = ancestor !== null && ancestor.name !== undefined && ancestor.name !== "" ? ` in ${ancestor.name}` : "";
  return `${own ?? kind.split(",")[0]} (${kind})${where} #${object.id ?? "?"}`;
}

function trianglesOf(geometry: unknown, group: unknown, object: unknown): number {
  const geo = geometry as { index?: { count: number } | null; attributes?: { position?: { count: number } }; drawRange?: { count: number }; instanceCount?: number } | null;
  if (geo === null || typeof geo !== "object") return 0;
  let count = geo.index?.count ?? geo.attributes?.position?.count ?? 0;
  const range = geo.drawRange?.count;
  if (typeof range === "number" && Number.isFinite(range)) count = Math.min(count, range);
  const groupCount = (group as { count?: number } | null)?.count;
  if (typeof groupCount === "number" && Number.isFinite(groupCount)) count = Math.min(count, groupCount);
  const instances = (object as { isInstancedMesh?: boolean; count?: number } | null)?.isInstancedMesh === true ? ((object as { count?: number }).count ?? 1) : (geo.instanceCount ?? 1);
  return Math.floor(count / 3) * Math.max(1, Number.isFinite(instances) ? instances : 1);
}

/** Install the breakdown on a renderer and the r3f loop driving it. @internal */
export function installFrameBreakdown(renderer: BreakdownRenderer, store: BreakdownStore): FrameBreakdown {
  active?.dispose();
  const gl = renderer.getContext() as Gl2 & Record<string, unknown>;
  const ext = (gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null) ?? null;
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
    const top = cpuStack.pop()!;
    const end = performance.now();
    const total = end - top.start;
    addCpu(top.label, total - top.child - excluded);
    const parent = cpuStack[cpuStack.length - 1];
    if (parent !== undefined) parent.child += total;
    return end;
  };
  const fresh = (): FrameBreakdownRecord => ({
    intervalMs: 0, workMs: 0, cpu: {}, gpu: ext === null ? null : {}, draws: 0, triangles: 0,
    compiles: 0, compileMs: 0, uploads: 0, uploadBytes: 0, uploadMs: 0, heapMb: null, heapDropMb: 0,
  });

  // GPU timers: a stack of pass labels, one query running for the top of it.
  const gpuStack: string[] = [];
  let running: { query: WebGLQuery; label: string; record: FrameBreakdownRecord } | null = null;
  const pending: { query: WebGLQuery; label: string; record: FrameBreakdownRecord }[] = [];
  const unresolved = new Map<FrameBreakdownRecord, number>();
  const stopTimer = () => {
    if (ext === null || running === null) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push(running);
    unresolved.set(running.record, (unresolved.get(running.record) ?? 0) + 1);
    running = null;
    if (pending.length > MAX_PENDING_QUERIES) {
      const dropped = pending.shift()!;
      gl.deleteQuery(dropped.query);
    }
  };
  const startTimer = (label: string) => {
    if (ext === null || current === null) return;
    const query = gl.createQuery();
    if (query === null) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
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
    if (ext === null || pending.length === 0) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT) === true) {
      for (const entry of pending.splice(0)) {
        gl.deleteQuery(entry.query);
        entry.record.gpu = null;
      }
      return;
    }
    while (pending.length > 0) {
      const entry = pending[0]!;
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

  // Wrap a method in place, keeping a restore.
  const wrap = <T extends object>(target: T, method: keyof T & string, make: (original: Callable) => Callable) => {
    const original = target[method] as unknown as Callable;
    if (typeof original !== "function") return;
    (target as Record<string, unknown>)[method] = make(original);
    restore.push(() => {
      (target as Record<string, unknown>)[method] = original;
    });
  };

  // Render submission (CPU) and the main pass (GPU); a render inside a post pass belongs to that pass.
  let renderDepth = 0;
  wrap(renderer, "render", (original) => function (this: unknown, ...args: unknown[]) {
    const outer = renderDepth === 0 && gpuStack.length === 0;
    if (outer) enterPass("main");
    renderDepth += 1;
    if (renderDepth === 1) cpuEnter(`render:${gpuStack[gpuStack.length - 1] ?? "main"}`);
    try {
      return original.apply(renderer, args);
    } finally {
      if (renderDepth === 1) lastWorkEnd = cpuLeave();
      renderDepth -= 1;
      if (outer) leavePass();
    }
  });
  wrap(renderer.shadowMap, "render", (original) => function (this: unknown, ...args: unknown[]) {
    enterPass("shadow");
    cpuEnter("render:shadow");
    try {
      return original.apply(renderer.shadowMap, args);
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
  wrap(renderer, "renderBufferDirect", (original) => function (this: unknown, ...args: unknown[]) {
    const start = performance.now();
    try {
      return original.apply(renderer, args);
    } finally {
      const ms = performance.now() - start;
      const triangles = trianglesOf(args[2], args[5], args[4]);
      const pass = gpuStack[gpuStack.length - 1] ?? "main";
      if (current !== null) {
        current.draws += 1;
        current.triangles += triangles;
      }
      tally(objects, objectLabel(args[4] as Named, args[2] as Named), triangles, ms, pass);
      tally(materials, labelOf(args[3] as never, "material"), triangles, ms, pass);
    }
  });

  // Shader compiles and links, and uploads, on the context itself.
  const timed = (method: string, onCall: (ms: number, args: unknown[], result: unknown) => void) =>
    wrap(gl, method, (original) => function (this: unknown, ...args: unknown[]) {
      const start = performance.now();
      const result = original.apply(gl, args);
      onCall(performance.now() - start, args, result);
      return result;
    });
  timed("linkProgram", (ms) => {
    if (current === null) return;
    current.compiles += 1;
    current.compileMs += ms;
  });
  for (const method of ["compileShader", "getShaderParameter", "getProgramParameter", "getProgramInfoLog", "getShaderInfoLog"]) {
    timed(method, (ms, args) => {
      if (current === null) return;
      if (method === "getProgramParameter" && args[1] !== gl.LINK_STATUS) return;
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
    for (const pass of composer.passes as { render?: Callable; name?: string; [WRAPPED]?: true }[]) {
      if (pass[WRAPPED] === true || typeof pass.render !== "function") continue;
      const name = pass.name !== undefined && pass.name !== "" ? pass.name : ((pass.constructor as { name?: string }).name ?? "pass");
      // The pass that draws the scene is the main pass, whatever the composer calls it.
      const label = /RenderPass$/.test(name) ? "main" : `post:${name.replace(/^_/, "")}`;
      const original = pass.render;
      pass[WRAPPED] = true;
      pass.render = function (this: unknown, ...args: unknown[]) {
        enterPass(label);
        cpuEnter(label === "main" ? "pass:main" : label);
        try {
          return original.apply(pass, args);
        } finally {
          lastWorkEnd = cpuLeave();
          leavePass();
        }
      };
    }
  };

  // Frame callbacks: each r3f subscriber timed under a stable label.
  const labels = new WeakMap<object, string>();
  const callbacks: Record<string, Callable> = {};
  let nextLabel = 0;
  const wrapSubscribers = () => {
    for (const subscription of store.getState().internal.subscribers) {
      const fn = subscription.ref.current as Callable & { [WRAPPED]?: true };
      if (fn === undefined || fn[WRAPPED] === true || fn === tick) continue;
      let label = labels.get(subscription.ref);
      if (label === undefined) {
        label = `frame#${nextLabel}${fn.name !== "" && fn.name !== "anonymous" ? `:${fn.name}` : ""}`;
        nextLabel += 1;
        labels.set(subscription.ref, label);
      }
      callbacks[label] = fn;
      const named = label;
      const timedCallback = Object.assign(
        function (this: unknown, ...args: unknown[]) {
          const before = devtools.frame.last()?.serial ?? 0;
          cpuEnter(named);
          try {
            return fn.apply(this, args);
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
        },
        { [WRAPPED]: true as const },
      );
      subscription.ref.current = timedCallback;
    }
  };

  // The first callback of every frame closes the previous frame and opens the next.
  const tick: Callable = () => {
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
      for (const entry of pending.splice(0)) gl.deleteQuery(entry.query);
      for (const undo of restore.splice(0).reverse()) undo();
      if (active === breakdown) {
        active = null;
        activePasses = null;
      }
      delete (globalThis as { __jgFrameBreakdown?: unknown }).__jgFrameBreakdown;
    },
  };
  active = breakdown;
  (globalThis as { __jgFrameBreakdown?: unknown }).__jgFrameBreakdown = breakdown;
  return breakdown;
}

