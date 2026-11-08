import type { RenderCallback, RootStore } from "@react-three/fiber";
import type { WebGLRenderer } from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { observeSharedFrames } from "@jgengine/core/render/useSharedFrame.draw";
import { canvasCover } from "@jgengine/core/ui/canvasCover.view";
import { sceneSwapping } from "@jgengine/core/ui/sceneSwap.view";

import {
  attributeHitch,
  hitchCause,
  HITCH_MS,
  lightSetChange,
  observeFrameWork,
  programVariantChange,
  summarizeBreakdown,
  targetLayout,
  vertexLayout,
  type DrawCost,
  type FrameBreakdown,
  type FrameBreakdownRecord,
  type Hitch,
  type LayoutAttribute,
  type LongFrameTiming,
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

/**
 * Every visible light in a scene as `SpotLight (shadow) in Headlamp/Player`: its type, whether it casts
 * shadows, and its own name or the nearest named ancestors, which is how you find it in the code.
 * Position is left out: a light that moves is not a light that came or went.
 */
function visibleLights(scene: object): string[] {
  const lights: string[] = [];
  const traverse: unknown = Reflect.get(scene, "traverseVisible");
  if (typeof traverse !== "function") return lights;
  Reflect.apply(traverse, scene, [(node: unknown) => {
    if (typeof node !== "object" || node === null || Reflect.get(node, "isLight") !== true) return;
    const type = String(Reflect.get(node, "type"));
    if (type === "AmbientLight" || type === "HemisphereLight") return;
    const names: string[] = [];
    for (let at: unknown = node; typeof at === "object" && at !== null && at !== scene && names.length < 3; at = Reflect.get(at, "parent")) {
      const name: unknown = Reflect.get(at, "name");
      if (typeof name === "string" && name !== "") names.push(name);
    }
    const shadow = Reflect.get(node, "castShadow") === true ? " (shadow)" : "";
    const color: unknown = Reflect.get(node, "color");
    const toHex: unknown = typeof color === "object" && color !== null ? Reflect.get(color, "getHexString") : undefined;
    const hex: unknown = typeof toHex === "function" ? Reflect.apply(toHex, color, []) : undefined;
    const distance: unknown = Reflect.get(node, "distance");
    const look = `${typeof hex === "string" ? ` #${hex}` : ""}${typeof distance === "number" && distance > 0 ? ` ${Math.round(distance)}m` : ""}`;
    lights.push(`${type}${shadow}${look} in ${names.length === 0 ? "unnamed" : names.join("/")}`);
  }]);
  return lights;
}

/** Frames kept: 30 s at 144 Hz. */
const CAPACITY = 4320;
/** Pending GPU timers kept before the oldest are dropped unread. */
const MAX_PENDING_QUERIES = 512;
/** @internal */
export const FRAME_RETENTION_LIMIT = 1024;
/** Hitches a session keeps: an hour of one stall every two seconds. */
const HITCH_LOG_LIMIT = 2000;
/** Long animation frames kept to attribute hitches from. */
const LONG_FRAME_LIMIT = 600;

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
  const wrapped = new WeakSet<object>();
  const context = renderer.getContext();
  const timers = gpuTimers(context);
  const restore: (() => void)[] = [];
  const retention = { callbacks: 0, draws: 0, passes: 0, subscribers: 0, shaders: 0 };

  const records: FrameBreakdownRecord[] = [];
  let next = 0;
  const pushRecord = (record: FrameBreakdownRecord) => {
    if (records.length < CAPACITY) records.push(record);
    else records[next] = record;
    next = (next + 1) % CAPACITY;
  };
  const ordered = () => (records.length < CAPACITY ? records.slice() : [...records.slice(next), ...records.slice(0, next)]);

  // The whole session's hitches, past the record window: a stall minutes ago is still the one the
  // player felt. Each keeps its record (GPU times resolve into it later) and when it ended.
  const hitchLog: { endMs: number; record: FrameBreakdownRecord; covered: Hitch["covered"] }[] = [];
  let hitchDropped = 0;
  let sessionStart = performance.now();
  let sessionFrames = 0;
  let sessionGcMb = 0;
  // What the browser ran in each long frame, for the frames the r3f loop cannot see into.
  const longFrames: LongFrameTiming[] = [];
  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const scripts: unknown = Reflect.get(entry, "scripts");
        if (longFrames.length >= LONG_FRAME_LIMIT) longFrames.shift();
        longFrames.push({
          startTime: entry.startTime,
          duration: entry.duration,
          scripts: (Array.isArray(scripts) ? scripts : []).map((script: unknown) => ({
            startTime: numberField(script, "startTime") ?? 0,
            duration: numberField(script, "duration") ?? 0,
            invoker: nameField(script, "invoker") ?? nameField(script, "invokerType") ?? "script",
            source: `${nameField(script, "sourceFunctionName") ?? "(anonymous)"} ${nameField(script, "sourceURL") ?? "?"}:${numberField(script, "sourceCharPosition") ?? -1}`,
            layoutMs: numberField(script, "forcedStyleAndLayoutDuration") ?? 0,
          })),
        });
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: false });
    restore.push(() => observer?.disconnect());
  }

  // The frame being filled.
  let current: FrameBreakdownRecord | null = null;
  let frameStart = 0;
  // What covered the world when this frame began: a stall then froze the card, not the game.
  let frameCovered: Hitch["covered"] = undefined;
  const coverNow = (): Hitch["covered"] => (sceneSwapping() ? "travel card" : canvasCover.covered() ? "canvas cover" : undefined);
  let lastWorkEnd = 0;
  let lastHeap: number | null = null;
  const addCpu = (name: string, ms: number) => {
    if (current !== null && ms > 0) current.cpu[name] = (current.cpu[name] ?? 0) + ms;
  };
  // Self time: each timed scope pays only for what its nested scopes did not, so the CPU list adds up
  // to the frame's work instead of counting a pass inside a callback twice.
  // Kept as parallel arrays reused every frame: an object per scope would be garbage the breakdown
  // then reports as the game's.
  const cpuLabels: string[] = [];
  const cpuStarts: number[] = [];
  const cpuChildren: number[] = [];
  let cpuDepth = 0;
  const cpuEnter = (label: string) => {
    if (current?.calls !== undefined) current.calls[label] = (current.calls[label] ?? 0) + 1;
    cpuLabels[cpuDepth] = label;
    cpuStarts[cpuDepth] = performance.now();
    cpuChildren[cpuDepth] = 0;
    cpuDepth += 1;
  };
  const cpuLeave = (excluded = 0): number => {
    const end = performance.now();
    if (cpuDepth === 0) return end;
    cpuDepth -= 1;
    const total = end - (cpuStarts[cpuDepth] ?? end);
    addCpu(cpuLabels[cpuDepth] ?? "", total - (cpuChildren[cpuDepth] ?? 0) - excluded);
    if (cpuDepth > 0) cpuChildren[cpuDepth - 1] = (cpuChildren[cpuDepth - 1] ?? 0) + total;
    return end;
  };
  const fresh = (): FrameBreakdownRecord => ({
    intervalMs: 0, workMs: 0, cpu: {}, calls: {}, gpu: timers === null ? null : {}, draws: 0, triangles: 0,
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
      if (dropped !== undefined) {
        dropped.record.gpu = null;
        timers.gl.deleteQuery(dropped.query);
        const left = (unresolved.get(dropped.record) ?? 1) - 1;
        if (left <= 0) unresolved.delete(dropped.record);
        else unresolved.set(dropped.record, left);
      }
    }
  };
  const startTimer = (label: string) => {
    if (timers === null || current === null) return;
    const query = timers.gl.createQuery();
    if (query === null) { current.gpu = null; return; }
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
        unresolved.delete(entry.record);
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
    // Bound, not `(...args) => apply(...)`: that spread made an array on every draw.
    const call: Callable = Function.prototype.bind.call(original, target);
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
    if (entry === undefined) {
      if (table.size >= FRAME_RETENTION_LIMIT) { retention.draws += 1; return; }
      table.set(label, { label, draws: 1, triangles, cpuMs: ms, pass });
    }
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
  // `build` is a fixed function given its inputs, never a closure made per draw.
  const labelFor = <Extra>(cache: WeakMap<object, string>, thing: unknown, build: (thing: unknown, extra: Extra) => string, extra: Extra): string => {
    if (typeof thing !== "object" || thing === null) return build(thing, extra);
    let label = cache.get(thing);
    if (label === undefined) {
      label = build(thing, extra);
      cache.set(thing, label);
    }
    return label;
  };
  // A material that already had a program and built another: which part of the scene changed under it.
  const recompiledFor = (material: unknown): string | null => {
    if (typeof material !== "object" || material === null) return null;
    const properties: unknown = renderer.properties.get(material);
    const programs: unknown = typeof properties === "object" && properties !== null ? Reflect.get(properties, "programs") : undefined;
    const currentProgram: unknown = typeof properties === "object" && properties !== null ? Reflect.get(properties, "currentProgram") : undefined;
    if (!(programs instanceof Map) || programs.size < 2 || typeof currentProgram !== "object" || currentProgram === null) return null;
    const nextKey: unknown = Reflect.get(currentProgram, "cacheKey");
    if (typeof nextKey !== "string") return null;
    const previousKey = [...programs.keys()].reverse().find((key): key is string => typeof key === "string" && key !== nextKey);
    if (previousKey === undefined) return null;
    const defines: unknown = Reflect.get(material, "defines");
    return programVariantChange(previousKey, nextKey, typeof defines === "object" && defines !== null ? Object.keys(defines).length : 0);
  };
  // Each scene's lights at the last light recompile (or first draw), so the next one can say which
  // lights came or went. Per scene, because a post pass draws its own light-less scene.
  let lastScene: unknown = null;
  const lightsSeen = new WeakMap<object, string[]>();
  let untoldLights: string | null = null;
  const lightsChanged = (scene: unknown): string | null => {
    if (typeof scene !== "object" || scene === null) return null;
    const now = visibleLights(scene);
    const before = lightsSeen.get(scene);
    lightsSeen.set(scene, now);
    return before === undefined ? null : lightSetChange(before, now);
  };
  // Each program's (vertex layout, colour target) pairs drawn so far: ANGLE on Direct3D builds a
  // shader for each new pair at that draw, in the GPU process, so a frame stalls with nothing on the
  // page's clock. Null for a pair already drawn; otherwise the target, and the layout when that is new.
  const pairsDrawn = new WeakMap<object, Set<string>>();
  const layoutsDrawn = new WeakMap<object, Set<string>>();
  const layoutCache = new WeakMap<object, WeakMap<object, string>>();
  const targetCache = new WeakMap<object, string>();
  const firstDrawOf = (material: unknown, geometry: unknown, object: unknown): string | null => {
    if (typeof material !== "object" || material === null || typeof geometry !== "object" || geometry === null) return null;
    // A stand-in renderer (tests, a headless host) may keep no program record: nothing to tell.
    const live = renderer as Partial<Pick<WebGLRenderer, "properties" | "getRenderTarget">>;
    if (live.properties === undefined || live.getRenderTarget === undefined) return null;
    const properties: unknown = live.properties.get(material);
    const program: unknown = typeof properties === "object" && properties !== null ? Reflect.get(properties, "currentProgram") : undefined;
    if (typeof program !== "object" || program === null) return null;
    let byGeometry = layoutCache.get(program);
    if (byGeometry === undefined) layoutCache.set(program, (byGeometry = new WeakMap()));
    let layout = byGeometry.get(geometry);
    if (layout === undefined) {
      const getAttributes: unknown = Reflect.get(program, "getAttributes");
      const active: unknown = typeof getAttributes === "function" ? Reflect.apply(getAttributes, program, []) : {};
      const attributes: unknown = Reflect.get(geometry, "attributes");
      layout = vertexLayout(Object.keys(typeof active === "object" && active !== null ? active : {}), (name) => {
        // Instancing attributes live on the object (InstancedMesh), the rest on the geometry.
        const own: unknown = typeof attributes === "object" && attributes !== null ? Reflect.get(attributes, name) : undefined;
        const found: unknown = own ?? (typeof object === "object" && object !== null ? Reflect.get(object, name) : undefined);
        return typeof found === "object" && found !== null ? (found as LayoutAttribute) : undefined;
      });
      byGeometry.set(geometry, layout);
    }
    const bound = live.getRenderTarget.call(renderer);
    let target = bound === null ? "screen" : targetCache.get(bound);
    if (target === undefined) targetCache.set(bound!, (target = targetLayout(bound as Parameters<typeof targetLayout>[0])));
    let pairs = pairsDrawn.get(program);
    if (pairs === undefined) pairsDrawn.set(program, (pairs = new Set()));
    const pair = `${layout}|${target}`;
    if (pairs.has(pair)) return null;
    pairs.add(pair);
    let layouts = layoutsDrawn.get(program);
    if (layouts === undefined) layoutsDrawn.set(program, (layouts = new Set()));
    const newLayout = !layouts.has(layout);
    layouts.add(layout);
    return pairs.size === 1 ? `first draw, ${target}` : newLayout ? `${target}, new vertex layout ${layout}` : target;
  };
  wrap(renderer, "renderBufferDirect", (original) => (camera: unknown, scene: unknown, geometry: unknown, material: unknown, object: unknown, group: unknown) => {
    if (scene !== lastScene) {
      lastScene = scene;
      if (typeof scene === "object" && scene !== null && !lightsSeen.has(scene)) lightsChanged(scene);
    }
    const start = performance.now();
    const compiledBefore = current?.compileMs ?? 0;
    const linkedBefore = current?.compiles ?? 0;
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
      const objectName = labelFor(objectLabels, object, objectLabel, geometry);
      const materialName = labelFor(materialLabels, material, labelOf, "material");
      tally(objects, objectName, triangles, ms, pass);
      tally(materials, materialName, triangles, ms, pass);
      // This draw built or first used a program: name it, and the pass that drew it, so a compile
      // hitch says what to warm up. A link the driver finished off the main thread still counts: the
      // GPU process builds it before the frame can show, so "1 program linked" needs a name too.
      if (current !== null && (current.compileMs - compiledBefore >= 1 || current.compiles > linkedBefore)) {
        const shaders = current.shaders ??= [];
        const variant = recompiledFor(material);
        // Every compile re-reads the lights (compiles are rare), so a new place's first materials keep
        // the snapshot current; the change is told on the first recompile it caused.
        const change = lightsChanged(scene);
        if (change !== null) untoldLights = change;
        const lights = variant !== null && variant.includes("light") ? untoldLights : null;
        if (lights !== null) untoldLights = null;
        const where = pass === "main" ? "" : ` [${pass}]`;
        if (shaders.length < FRAME_RETENTION_LIMIT) shaders.push(`${materialName} on ${objectName}${where}${variant === null ? "" : ` (recompiled: ${variant}${lights === null ? "" : `; lights ${lights}`})`}`);
        else retention.shaders += 1;
      }
      const first = current === null ? null : firstDrawOf(material, geometry, object);
      if (first !== null && current !== null) {
        const firstDraws = current.firstDraws ??= [];
        if (firstDraws.length < FRAME_RETENTION_LIMIT) firstDraws.push(`${materialName} on ${objectName}${pass === "main" ? "" : ` [${pass}]`} → ${first}`);
        else retention.shaders += 1;
      }
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
  let passCount = 0;
  activePasses = (composer) => {
    for (const pass of composer.passes) {
      const render: unknown = Reflect.get(pass, "render");
      if (wrapped.has(pass) || typeof render !== "function") continue;
      if (passCount >= FRAME_RETENTION_LIMIT) { wrapped.add(pass); retention.passes += 1; continue; }
      passCount += 1;
      const name = nameField(pass, "name") ?? pass.constructor.name;
      // The pass that draws the scene is the main pass, whatever the composer calls it.
      const label = /RenderPass$/.test(name) ? "main" : `post:${name.replace(/^_/, "")}`;
      wrapped.add(pass);
      const timedPass = (...args: unknown[]): unknown => {
        enterPass(label);
        cpuEnter(label === "main" ? "pass:main" : label);
        try {
          return Reflect.apply(render, pass, args);
        } finally {
          lastWorkEnd = cpuLeave();
          leavePass();
        }
      };
      Reflect.set(pass, "render", timedPass);
      restore.push(() => { if (Reflect.get(pass, "render") === timedPass) Reflect.set(pass, "render", render); });
    }
  };

  // Frame callbacks: each r3f subscriber timed under a stable label.
  const labels = new WeakMap<object, string>();
  const callbacks: Record<string, RenderCallback> = {};
  const subscriberWrappers = new Map<object, { ref: { current: RenderCallback }; original: RenderCallback; wrapper: RenderCallback }>();
  const liveSubscribers = new Set<object>();
  let nextLabel = 0;
  const callbackLabel = (suffix: string): string | null => {
    if (nextLabel >= FRAME_RETENTION_LIMIT) { retention.callbacks += 1; return null; }
    const label = `frame#${nextLabel}${suffix}`;
    nextLabel += 1;
    return label;
  };
  const memberLabels = new WeakMap<object, string>();
  const detailedWork = new URLSearchParams(window.location.search).get("frameMembers") === "1";
  if (detailedWork) {
    observeFrameWork((name, count) => {
      if (current?.calls === undefined) return;
      let owner = "unattributed";
      for (let index = cpuDepth - 1; index >= 0; index -= 1) {
        const label = cpuLabels[index];
        if (label?.startsWith("frame#") === true) { owner = label; break; }
      }
      const label = `${owner} | ${name}`;
      current.calls[label] = (current.calls[label] ?? 0) + count;
    });
    restore.push(() => observeFrameWork(null));
    observeSharedFrames(store, {
      enter(task) {
        let label = memberLabels.get(task);
        if (label === undefined) {
          label = callbackLabel(":sharedMember") ?? "frame#overflow:sharedMember";
          memberLabels.set(task, label);
        }
        if (label !== "frame#overflow:sharedMember") callbacks[label] = task.current;
        cpuEnter(label);
      },
      leave: () => { cpuLeave(); },
    });
    restore.push(() => observeSharedFrames(store, null));
  }
  const wrapSubscribers = () => {
    liveSubscribers.clear();
    for (const subscription of store.getState().internal.subscribers) liveSubscribers.add(subscription.ref);
    for (const ref of subscriberWrappers.keys()) if (!liveSubscribers.has(ref)) subscriberWrappers.delete(ref);
    for (const subscription of store.getState().internal.subscribers) {
      const fn = subscription.ref.current;
      if (typeof fn !== "function" || wrapped.has(fn) || fn === tick) continue;
      if (!subscriberWrappers.has(subscription.ref) && subscriberWrappers.size >= FRAME_RETENTION_LIMIT) { retention.subscribers += 1; continue; }
      let label = labels.get(subscription.ref);
      if (label === undefined) {
        label = callbackLabel(fn.name !== "" && fn.name !== "anonymous" ? `:${fn.name}` : "") ?? "frame#overflow";
        labels.set(subscription.ref, label);
      }
      if (label !== "frame#overflow") callbacks[label] = fn;
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
      subscriberWrappers.set(subscription.ref, { ref: subscription.ref, original: fn, wrapper: timedCallback });
    }
  };
  restore.push(() => {
    for (const { ref, original, wrapper } of subscriberWrappers.values()) if (ref.current === wrapper) ref.current = original;
    subscriberWrappers.clear();
  });

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
      sessionFrames += 1;
      sessionGcMb += current.heapDropMb;
      if (current.intervalMs > HITCH_MS) {
        if (hitchLog.length < HITCH_LOG_LIMIT) hitchLog.push({ endMs: now, record: current, covered: frameCovered });
        else hitchDropped += 1;
      }
    }
    current = fresh();
    frameStart = now;
    frameCovered = coverNow();
    lastWorkEnd = now;
    wrapSubscribers();
  };
  const tickRef = { current: tick };
  const unsubscribe = store.getState().internal.subscribe(tickRef, -Number.MAX_SAFE_INTEGER, store);
  restore.push(unsubscribe);

  const breakdown: FrameBreakdown = {
    summary(options = {}) {
      const programs = renderer.info.programs?.length ?? null;
      const complete = ordered().map((record) => unresolved.has(record) ? { ...record, gpu: null } : record);
      // Draw costs are gathered over the whole window, so a tail of it reports frames only.
      if (options.last !== undefined) return { ...summarizeBreakdown(complete.slice(-options.last), { objects: [], materials: [] }, { programs, top: options.top }), workCounts: detailedWork ? "enabled" : "disabled", retention: { ...retention } };
      return { ...summarizeBreakdown(complete, { objects: [...objects.values()], materials: [...materials.values()] }, { programs, top: options.top }), workCounts: detailedWork ? "enabled" : "disabled", retention: { ...retention } };
    },
    records: () => ordered().map((record) => unresolved.has(record) ? { ...record, gpu: null } : record),
    callbacks: () => ({ ...callbacks }),
    session() {
      const hitches = hitchLog.map(({ endMs, record, covered }) => {
        const complete = unresolved.has(record) ? { ...record, gpu: null } : record;
        return {
          atS: Math.round(((endMs - sessionStart) / 1000) * 100) / 100,
          ms: Math.round(record.intervalMs * 10) / 10,
          ...attributeHitch(hitchCause(complete), endMs, record.intervalMs, longFrames),
          ...(covered === undefined ? {} : { covered }),
        };
      });
      return {
        seconds: Math.round((performance.now() - sessionStart) / 100) / 10,
        frames: sessionFrames,
        gcMb: Math.round(sessionGcMb * 10) / 10,
        hitches,
        dropped: hitchDropped,
      };
    },
    reset() {
      records.length = 0;
      next = 0;
      hitchLog.length = 0;
      hitchDropped = 0;
      sessionStart = performance.now();
      sessionFrames = 0;
      sessionGcMb = 0;
      longFrames.length = 0;
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
      // A remount installs the next breakdown before this one's cleanup runs: leave that one published.
      if (window.__jgFrameBreakdown === breakdown) delete window.__jgFrameBreakdown;
    },
  };
  active = breakdown;
  window.__jgFrameBreakdown = breakdown;
  return breakdown;
}

