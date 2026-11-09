/**
 * Where each frame goes: the record of one frame (CPU per system, GPU per render pass, draws, shader
 * compiles, uploads, heap) and the summary of a window of them (percentiles, the costliest systems,
 * passes, objects and materials, and every hitch with what caused it). This file is the arithmetic;
 * `frameBreakdown.draw.ts` fills the records from a live renderer.
 */

/** A frame slower than this is a hitch: two frames missed at 60 Hz. */
export const HITCH_MS = 33;

/** Receives counts from instrumented work while deep frame diagnostics are active. @internal */
export type FrameWorkObserver = (name: string, count: number) => void;
let workObserver: FrameWorkObserver | null = null;

/** Install or remove the active frame's work-count receiver. @internal */
export function observeFrameWork(observer: FrameWorkObserver | null): void { workObserver = observer; }

/** Current receiver, or null when detailed counts are disabled. @internal */
export function frameWorkObserver(): FrameWorkObserver | null { return workObserver; }

/** One frame, as the hooks saw it. GPU times arrive a few frames late; `gpu` is null until they do. */
export interface FrameBreakdownRecord {
  /** Time since the previous frame started (the frame interval the player sees). */
  intervalMs: number;
  /** Main-thread work: from the first frame callback to the end of the last render call. */
  workMs: number;
  /** CPU milliseconds by system: sim phases and stages, frame callbacks, render submission, passes. */
  cpu: Record<string, number>;
  /** Calls observed in timed scopes, not the number of items processed. */
  calls?: Record<string, number>;
  /** GPU milliseconds by render pass (shadow, main, each post pass); null while unresolved or unsupported. */
  gpu: Record<string, number> | null;
  draws: number;
  triangles: number;
  /**
   * Shader programs linked this frame, and the milliseconds the main thread spent compiling, linking
   * and waiting on a program's first use (three's uniform and attribute queries wait for the link).
   */
  compiles: number;
  compileMs: number;
  /** The draws that waited on a shader program this frame, as "material on object". */
  shaders?: string[];
  /**
   * Draws that ran a program with a vertex layout or target it had not drawn with before, as
   * "material on object": ANGLE on Direct3D builds a shader for each at that draw, in the GPU
   * process, so the frame stalls with nothing on the page's own clock.
   */
  firstDraws?: string[];
  /** Where each program linked this frame was asked for: the first game or engine function on its stack. */
  links?: string[];
  /** Texture and buffer uploads this frame: calls, bytes and main-thread milliseconds. */
  uploads: number;
  uploadBytes: number;
  uploadMs: number;
  /** JS heap in MB at the end of the frame, and how much it dropped since the last frame (a collection). */
  heapMb: number | null;
  heapDropMb: number;
}

/** One object or material's share of the draws: totals while gathering, per-frame averages in a summary. */
export interface DrawCost {
  label: string;
  draws: number;
  triangles: number;
  /** Main-thread milliseconds spent submitting its draws (state changes, uniforms, the draw call). */
  cpuMs: number;
  /** GPU milliseconds its draws took, each timed on its own; only in a window timed by draws. */
  gpuMs?: number;
  /** The pass its draws were mostly in (shadow, main, a post pass). */
  pass: string;
}

/**
 * How the breakdown times the GPU.
 * - `span`: one timer around each pass. Cheap, but it also counts the time the GPU sat idle waiting
 *   for the CPU to submit the pass's commands, so a pass the CPU submits slowly reads as GPU time.
 * - `draws`: one timer around every draw and clear, summed into its pass. That is the work the GPU
 *   did; the timers themselves cost CPU, so frame times in such a window are not the player's.
 */
export type GpuTiming = "span" | "draws";

/** A frame over {@link HITCH_MS}, with the cause read from what happened inside it. */
export interface Hitch {
  /** Seconds since the window started. */
  atS: number;
  ms: number;
  cause: "compile" | "upload" | "gc" | "system" | "gpu" | "script" | "other";
  detail: string;
  /**
   * What the player was looking at instead of the world when the frame began: a scene swap's travel
   * card or a full-screen cover. The stall froze that, not the game. Absent when the world showed.
   */
  covered?: "travel card" | "canvas cover";
  /** The scripts the browser's long-animation-frame timing saw run during this frame, longest first. */
  scripts?: HitchScript[];
}

/** One script the browser ran inside a slow frame, as its long-animation-frame timing names it. */
export interface HitchScript {
  ms: number;
  /** What called it: `FrameRequestCallback`, `MessagePort.onmessage` (React's scheduler), `DOMWindow.onkeydown`, a promise. */
  invoker: string;
  /** `function url:char` in the generated bundle; a harness rewrites it to a source line. */
  source: string;
  /** Style and layout the script forced synchronously. */
  layoutMs: number;
}

/** The fields of one `PerformanceLongAnimationFrameTiming` the hitch log reads. @internal */
export interface LongFrameTiming {
  startTime: number;
  duration: number;
  scripts: readonly { startTime: number; duration: number; invoker: string; source: string; layoutMs: number }[];
}

/** Every hitch of a play session, not only the frames still in the breakdown's window. */
export interface HitchSession {
  /** Seconds since install or the last reset. */
  seconds: number;
  frames: number;
  /** Megabytes the heap dropped between frames over the session (collections). */
  gcMb: number;
  hitches: Hitch[];
  /** Hitches past the log's limit, counted but not kept. */
  dropped: number;
}

/*
 * The scene-dependent part of three's program cache key, in the order `getProgramCacheKeyParameters`
 * pushes it after the shader id and the material's defines (three 0.187).
 */
const PROGRAM_KEY_PARAMETERS = [
  "precision", "outputColorSpace", "envMapMode", "envMapPMREM", "envMapMaxLod", "envMapSize",
  "mapUv", "alphaMapUv", "lightMapUv", "aoMapUv", "bumpMapUv", "normalMapUv", "displacementMapUv", "emissiveMapUv",
  "metalnessMapUv", "roughnessMapUv", "anisotropyMapUv", "clearcoatMapUv", "clearcoatNormalMapUv", "clearcoatRoughnessMapUv",
  "diffuseRoughnessMapUv", "iridescenceMapUv", "iridescenceThicknessMapUv", "sheenColorMapUv", "sheenRoughnessMapUv",
  "specularMapUv", "specularColorMapUv", "specularIntensityMapUv", "transmissionMapUv", "thicknessMapUv",
  "combine", "fogExp2", "sizeAttenuation", "morphTargetsCount",
  "sun lights", "directional lights", "point lights", "spot lights", "spot light maps", "hemisphere lights", "rect area lights",
  "sun light shadows", "directional light shadows", "point light shadows", "spot light shadows", "spot light shadows with maps",
  "light probes", "light probe grids", "shadowMapType", "toneMapping", "clipping planes", "clip intersections", "depthPacking",
] as const;

/*
 * The two flag masks `getProgramCacheKeyBooleans` pushes after the parameters, each bit's name by
 * its layer index (three 0.187): an object drawn instanced in one place and plain in another, or a
 * material flipped to double-sided, recompiles with no parameter changed.
 */
const PROGRAM_KEY_FLAGS: readonly (readonly string[])[] = [
  ["instancing", "instancingColor", "instancingMorph", "matcap", "envMap", "normalMapObjectSpace", "normalMapTangentSpace",
    "clearcoat", "iridescence", "alphaTest", "vertexColors", "vertexAlphas", "vertexUv1s", "vertexUv2s", "vertexUv3s",
    "vertexTangents", "anisotropy", "alphaHash", "batching", "dispersion", "batchingColor", "gradientMap", "packedNormalMap",
    "vertexNormals", "retroreflection", "diffuseRoughness"],
  ["fog", "useFog", "flatShading", "logarithmicDepthBuffer", "reversedDepthBuffer", "skinning", "morphTargets", "morphNormals",
    "morphColors", "premultipliedAlpha", "shadowMapEnabled", "doubleSided", "flipSided", "useDepthPacking", "dithering",
    "transmission", "sheen", "opaque", "pointsUvs", "decodeVideoTexture", "decodeVideoTextureEmissive", "alphaToCoverage",
    "light probe grids", "hasPositionAttribute"],
];
const PRECISIONS = new Set(["highp", "mediump", "lowp"]);

/** The defines in a key's `name,value` pairs, as `NAME=value`. */
function definesOf(parts: readonly string[], end: number): Map<string, string> {
  const defines = new Map<string, string>();
  for (let index = 1; index + 1 < end; index += 2) defines.set(parts[index] ?? "", parts[index + 1] ?? "");
  return defines;
}

/**
 * Why a material that already had a program compiled another: what differs between its previous
 * program's cache key and the new one, as `point lights 3→2`, `instancing on→off` or `+define USE_X`.
 * A material recompiles for the whole scene when a light is added or removed, and per object when it
 * is drawn instanced in one place and plain in another, so this names the change to avoid. The
 * parameters start at the precision; `defines` (how many the material has now) places them when a
 * key carries none. Null when the keys are not three's layout.
 * @internal
 */
export function programVariantChange(previousKey: string, nextKey: string, defines: number): string | null {
  if (previousKey === nextKey) return null;
  const before = previousKey.split(",");
  const after = nextKey.split(",");
  const start = (parts: readonly string[]) => {
    const found = parts.findIndex((part, index) => index >= 1 && PRECISIONS.has(part));
    return found === -1 ? 1 + defines * 2 : found;
  };
  const was = start(before);
  const now = start(after);
  const changes: string[] = [];
  if (before[0] !== after[0]) changes.push(`shader ${before[0]}→${after[0]}`);
  const oldDefines = definesOf(before, was);
  const newDefines = definesOf(after, now);
  for (const [name, value] of newDefines) {
    const previous = oldDefines.get(name);
    if (previous === undefined) changes.push(`+define ${name}`);
    else if (previous !== value) changes.push(`define ${name} ${previous}→${value}`);
  }
  for (const name of oldDefines.keys()) if (!newDefines.has(name)) changes.push(`-define ${name}`);
  for (let index = 0; index < PROGRAM_KEY_PARAMETERS.length; index += 1) {
    const a = before[was + index];
    const b = after[now + index];
    if (a === undefined || b === undefined) return changes.length > 0 ? changes.join(", ") : null;
    if (a !== b) changes.push(`${PROGRAM_KEY_PARAMETERS[index]} ${a}→${b}`);
  }
  PROGRAM_KEY_FLAGS.forEach((names, mask) => {
    const a = Number(before[was + PROGRAM_KEY_PARAMETERS.length + mask]);
    const b = Number(after[now + PROGRAM_KEY_PARAMETERS.length + mask]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return;
    names.forEach((name, bit) => {
      const on = (b >>> bit) & 1;
      if (((a >>> bit) & 1) !== on) changes.push(`${name} ${on === 1 ? "off→on" : "on→off"}`);
    });
  });
  const tail = PROGRAM_KEY_PARAMETERS.length + PROGRAM_KEY_FLAGS.length;
  if (before[was + tail] !== after[now + tail]) changes.push(`output color space ${before[was + tail]}→${after[now + tail]}`);
  const oldCustom = before.slice(was + tail + 1).join();
  const newCustom = after.slice(now + tail + 1).join();
  if (oldCustom !== newCustom) {
    // Engine patches chain their keys with `|`: name the segments one key has and the other lacks.
    const oldParts = oldCustom.split("|");
    const newParts = newCustom.split("|");
    const gone = oldParts.filter((part) => !newParts.includes(part));
    const came = newParts.filter((part) => !oldParts.includes(part));
    const clip = (part: string) => (part.length > 60 ? `${part.slice(0, 60)}…` : part);
    changes.push(`custom key ${[...gone.map((part) => `-${clip(part)}`), ...came.map((part) => `+${clip(part)}`)].join(" ")}`);
  }
  return changes.length > 0 ? changes.join(", ") : "material flags";
}

/**
 * Which lights came and went between two looks at the scene, as `+1 SpotLight (shadow) at 3,1,-40`:
 * the light a recompile's "point lights 3→2" is about. Labels are counted, so two identical lamps read
 * `+2`. At most `limit` entries, then how many more. Null when nothing changed.
 * @internal
 */
export function lightSetChange(before: readonly string[], after: readonly string[], limit = 6): string | null {
  const counts = new Map<string, number>();
  for (const label of before) counts.set(label, (counts.get(label) ?? 0) - 1);
  for (const label of after) counts.set(label, (counts.get(label) ?? 0) + 1);
  const changes = [...counts].filter(([, delta]) => delta !== 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (changes.length === 0) return null;
  const shown = changes.slice(0, limit).map(([label, delta]) => `${delta > 0 ? "+" : ""}${delta} ${label}`);
  return changes.length > limit ? `${shown.join("; ")}; ${changes.length - limit} more` : shown.join("; ");
}

/**
 * The first game or engine function on a link's call stack, past three, the breakdown's own wrapper
 * and dependencies: `bakeImpostorLinked packages/core/src/lod/impostor.draw.ts:171`. Null when none
 * is on it. Reads V8's `at fn (url:line:col)` frames.
 * @internal
 */
export function linkCaller(stack: string): string | null {
  for (const line of stack.split("\n")) {
    const frame = /^\s*at (?:(?:async )?(\S+) \()?(.*?):(\d+):\d+\)?$/.exec(line);
    if (frame === null) continue;
    const url = frame[2]!.replace(/\?.*$/, "");
    if (url.includes("node_modules") || url.includes("/devtools/frameBreakdown") || !/\/(packages|games)\//.test(url)) continue;
    const path = url.replace(/^.*?\/((?:packages|games)\/.*)$/, "$1");
    return `${frame[1] ?? "(anonymous)"} ${path}:${frame[3]}`;
  }
  return null;
}

/** "; linked from …" for a compile hitch no draw named: each caller once, with how many it linked. */
function linkedFrom(links: readonly string[] | undefined): string {
  if (links === undefined || links.length === 0) return "";
  const counts = new Map<string, number>();
  for (const link of links) counts.set(link, (counts.get(link) ?? 0) + 1);
  const named = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([link, count]) => (count > 1 ? `${link} ×${count}` : link));
  return `, linked from ${named.join(", ")}`;
}

/** A vertex attribute as three keeps it: plain, or interleaved (its array on `data`). */
export interface LayoutAttribute {
  itemSize?: number;
  normalized?: boolean;
  array?: { constructor: { name: string } };
  data?: { array?: { constructor: { name: string } } };
}

/**
 * The vertex layout a draw feeds a program: each attribute the program reads, with its size, element
 * type and normalisation (`-` when the draw has none). ANGLE on Direct3D builds a vertex shader per
 * layout at the first draw that uses it, so one program drawn with two layouts builds twice.
 * @internal
 */
export function vertexLayout(active: readonly string[], attributeOf: (name: string) => LayoutAttribute | undefined): string {
  return [...active].sort().map((name) => {
    const attribute = attributeOf(name);
    if (attribute === undefined) return `${name}:-`;
    const array = attribute.array ?? attribute.data?.array;
    return `${name}:${attribute.itemSize ?? "?"}${attribute.normalized === true ? "n" : ""}:${array?.constructor.name ?? "?"}`;
  }).join(",");
}

const TEXEL_TYPES: Record<number, string> = { 1009: "rgba8", 1015: "float", 1016: "half-float" };

/**
 * The colour outputs a draw writes, which ANGLE on Direct3D builds a pixel shader per: `screen`, or
 * how many colour textures the target has, their texel type and whether it is multisampled.
 * @internal
 */
export function targetLayout(target: { textures?: readonly { type?: number }[]; texture?: { type?: number }; samples?: number } | null): string {
  if (target === null) return "screen";
  const textures = target.textures ?? (target.texture === undefined ? [] : [target.texture]);
  const types = textures.map((texture) => TEXEL_TYPES[texture.type ?? 1009] ?? `type ${texture.type}`);
  return `${types.length > 1 ? `${types.length}× ` : ""}${[...new Set(types)].join("+")}${(target.samples ?? 0) > 0 ? " msaa" : ""}`;
}

/**
 * The scripts that ran inside a frame that ended at `endMs` after `intervalMs`, longest first, and
 * the cause they make it when the frame's own record named nothing: a slow frame with no compile,
 * upload, collection, system or pass is the browser running something else, and this says what.
 * @internal
 */
export function attributeHitch(
  base: Pick<Hitch, "cause" | "detail">,
  endMs: number,
  intervalMs: number,
  timings: readonly LongFrameTiming[],
): Pick<Hitch, "cause" | "detail" | "scripts"> {
  const start = endMs - intervalMs;
  const scripts: HitchScript[] = [];
  for (const timing of timings) {
    if (timing.startTime + timing.duration < start || timing.startTime > endMs) continue;
    for (const script of timing.scripts) {
      if (script.startTime + script.duration < start || script.startTime > endMs) continue;
      scripts.push({ ms: round(script.duration, 1), invoker: script.invoker, source: script.source, layoutMs: round(script.layoutMs, 1) });
    }
  }
  scripts.sort((a, b) => b.ms - a.ms);
  const top = scripts.slice(0, 5);
  const longest = top[0];
  // Like a system or pass, a script is the cause only when it took a quarter of the frame: a 4.5 s
  // frame with a 23 ms frame callback in it froze somewhere else.
  if (base.cause === "other" && longest !== undefined && longest.ms >= 8 && longest.ms >= intervalMs / 4) {
    return { cause: "script", detail: `${longest.invoker} ${longest.source} ${longest.ms} ms${longest.layoutMs >= 1 ? ` (forced layout ${longest.layoutMs} ms)` : ""}`, scripts: top };
  }
  return top.length === 0 ? base : { ...base, scripts: top };
}

/** Percentiles of one series. */
export interface Spread {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

/** A named cost over the window: its average per frame and its 95th percentile. */
export interface NamedCost {
  name: string;
  avgMs: number;
  p95Ms: number;
}

/** A window of frames, summarized for a person or a diff. */
export interface FrameBreakdownSummary {
  frames: number;
  seconds: number;
  /** The frame interval: what the player sees. */
  frame: Spread;
  /** Main-thread work per frame: what a frame costs the CPU, whatever the display's refresh. */
  work: Spread;
  /** GPU time per frame over the frames whose timers resolved; null where timer queries are unsupported. */
  gpu: Spread | null;
  /** Frames with complete GPU timings, or absent in an older saved record. */
  gpuFrames?: number;
  /** How the window's GPU times were taken; absent in an older record, which timed spans. */
  gpuTiming?: GpuTiming;
  cpu: NamedCost[];
  passes: NamedCost[];
  /** Calls per frame for observed scopes. Missing on older records. */
  calls?: { name: string; avg: number; max: number }[];
  /** Number of CPU and call rows omitted by the summary limit. */
  omitted?: { cpu: number; calls: number };
  /** Detailed work counters cover only instrumented owners; absent on older records. */
  workCounts?: "enabled" | "disabled";
  /** Callback source lookup coverage, when the performance harness attempted it. */
  sources?: { resolved: number; unresolved: number; error?: string };
  /** Observations omitted because the recorder's retention limits were reached. */
  retention?: { callbacks: number; draws: number; passes: number; subscribers: number; shaders: number };
  counts: {
    drawsAvg: number;
    drawsMax: number;
    trianglesAvg: number;
    trianglesMax: number;
    programs: number | null;
    compiles: number;
    compileMs: number;
    uploads: number;
    uploadMb: number;
    heapMb: number | null;
    gcMb: number;
  };
  objects: DrawCost[];
  materials: DrawCost[];
  hitches: Hitch[];
}

/** A running breakdown, as `installFrameBreakdown` returns it and `window.__jgFrameBreakdown` holds it. */
export interface FrameBreakdown {
  /** The window so far, or its last `last` frames. */
  summary(options?: { top?: number; last?: number }): FrameBreakdownSummary;
  records(): FrameBreakdownRecord[];
  /** Each `frame#<n>` label with the frame callback it times, so a harness can name its source file. */
  callbacks(): Record<string, (...args: never[]) => void>;
  /** Every hitch since install or the last reset, however long ago, each with the scripts that ran in it. */
  session(): HitchSession;
  /** Switch how the GPU is timed (when given) and return the mode in force; reset after switching. */
  gpuTiming(mode?: GpuTiming): GpuTiming;
  reset(): void;
  dispose(): void;
}

declare global {
  interface Window {
    /** The installed frame breakdown, for the perf panel and `bun run perf` to read. */
    __jgFrameBreakdown?: FrameBreakdown;
  }
}

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/** p50/p95/p99/max/avg of a series; zeros for an empty one. @internal */
export function spread(values: readonly number[]): Spread {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  // `sorted` is not empty here, so every index below is inside it.
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return {
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(at(1)),
    avg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

/** Average and p95 of each named cost across frames; a frame without the name counts as 0. */
function namedCosts(frames: readonly Record<string, number>[], top: number): NamedCost[] {
  const names = new Set<string>();
  for (const frame of frames) for (const name of Object.keys(frame)) names.add(name);
  const costs = [...names].map((name) => {
    const series = frames.map((frame) => frame[name] ?? 0);
    const s = spread(series);
    return { name, avgMs: round(s.avg, 3), p95Ms: round(s.p95, 3) };
  });
  return costs.sort((a, b) => b.avgMs - a.avgMs).slice(0, top);
}

/**
 * What made a slow frame slow, read in order of how sure the signal is: a shader compile or a large
 * upload stalls the main thread outright, a heap drop is a collection, then the costliest system or
 * GPU pass; anything left is outside the game (the browser, the compositor, the OS).
 * @internal
 */
export function hitchCause(record: FrameBreakdownRecord): Pick<Hitch, "cause" | "detail"> {
  const which = record.shaders !== undefined && record.shaders.length > 0 ? ` for ${record.shaders.slice(0, 3).join(", ")}` : "";
  if (record.compileMs >= 2) {
    const what = record.compiles > 0 ? `${record.compiles} shader program(s) compiled` : "waited on shader programs at first use";
    return { cause: "compile", detail: `${what}, ${round(record.compileMs, 1)} ms${which}` };
  }
  if (record.uploadMs >= 4 || record.uploadBytes >= 4 * 1024 * 1024) {
    return { cause: "upload", detail: `${record.uploads} upload(s), ${round(record.uploadBytes / 1048576, 1)} MB, ${round(record.uploadMs, 1)} ms` };
  }
  if (record.heapDropMb >= 2) return { cause: "gc", detail: `garbage collection freed ~${round(record.heapDropMb, 1)} MB` };
  const [system, systemMs] = Object.entries(record.cpu).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const [pass, passMs] = Object.entries(record.gpu ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  // A system or pass is the cause only when it took a real share of the frame: a 2 s frame with a
  // 16 ms GPU pass in it froze somewhere else (Deepward's desktop build blamed BeautyPass for one).
  const share = record.intervalMs / 4;
  // A program's first draw with a new layout builds a driver shader off the page's clock: told beside
  // whatever the frame is blamed on, since that build is what the GPU process was doing.
  const firsts = record.firstDraws !== undefined && record.firstDraws.length > 0 ? `; first draws of ${record.firstDraws.length} program and layout pair(s): ${record.firstDraws.slice(0, 3).join(", ")}` : "";
  if (systemMs >= 8 && systemMs >= passMs && systemMs >= share) return { cause: "system", detail: `${system} ${round(systemMs, 1)} ms on the CPU${firsts}` };
  if (passMs >= 8 && passMs >= share) return { cause: "gpu", detail: `${pass} ${round(passMs, 1)} ms on the GPU${firsts}` };
  if (record.compiles > 0) return { cause: "compile", detail: `${record.compiles} shader program(s) linked${which || linkedFrom(record.links)}` };
  const largest = Math.max(systemMs, passMs) >= 8 ? `; the largest game cost was ${systemMs >= passMs ? `${system} ${round(systemMs, 1)} ms on the CPU` : `${pass} ${round(passMs, 1)} ms on the GPU`}` : "";
  return { cause: "other", detail: `${round(record.intervalMs - record.workMs, 1)} ms outside the game's frame work (browser, compositor, OS)${largest}${firsts}` };
}

/** Summarize a window of frames plus the draw costs gathered over it. @internal */
export function summarizeBreakdown(
  records: readonly FrameBreakdownRecord[],
  draws: { objects: readonly DrawCost[]; materials: readonly DrawCost[] },
  options: { programs?: number | null | undefined; top?: number | undefined; hitches?: number | undefined; gpuTiming?: GpuTiming | undefined } = {},
): FrameBreakdownSummary {
  const top = options.top ?? 12;
  const resolved = records.flatMap((record) => (record.gpu === null ? [] : [record.gpu]));
  const gpuTotals = resolved.map((gpu) => Object.values(gpu).reduce((sum, ms) => sum + ms, 0));
  let elapsed = 0;
  const hitches: Hitch[] = [];
  for (const record of records) {
    elapsed += record.intervalMs;
    if (record.intervalMs > HITCH_MS) hitches.push({ atS: round(elapsed / 1000, 2), ms: round(record.intervalMs, 1), ...hitchCause(record) });
  }
  const lastHeap = records.map((record) => record.heapMb).filter((mb): mb is number => mb !== null).at(-1);
  const byCost = (a: DrawCost, b: DrawCost) => (b.gpuMs ?? 0) - (a.gpuMs ?? 0) || b.cpuMs - a.cpuMs || b.triangles - a.triangles;
  const n = Math.max(1, records.length);
  const includeMembers = <T extends { name: string }>(items: T[]): T[] => {
    const first = items.slice(0, top);
    const seen = new Set(first.map((item) => item.name));
    return [...first, ...items.filter((item) => (item.name.includes(":sharedMember") || item.name.includes(" | ")) && !seen.has(item.name)).slice(0, top)];
  };
  const cpuRows = namedCosts(records.map((record) => record.cpu), Number.POSITIVE_INFINITY);
  const callRows = [...new Set(records.flatMap((record) => Object.keys(record.calls ?? {})))].map((name) => {
    const values = records.map((record) => record.calls?.[name] ?? 0);
    return { name, avg: round(values.reduce((sum, value) => sum + value, 0) / n, 2), max: Math.max(...values) };
  }).sort((a, b) => b.avg - a.avg);
  const selectedCpu = includeMembers(cpuRows);
  const selectedCalls = includeMembers(callRows);
  const perFrame = (cost: DrawCost): DrawCost => ({
    ...cost, draws: round(cost.draws / n, 1), triangles: Math.round(cost.triangles / n), cpuMs: round(cost.cpuMs / n, 3),
    ...(cost.gpuMs === undefined ? {} : { gpuMs: round(cost.gpuMs / Math.max(1, resolved.length), 3) }),
  });
  return {
    frames: records.length,
    seconds: round(elapsed / 1000, 1),
    frame: spread(records.map((record) => record.intervalMs)),
    work: spread(records.map((record) => record.workMs)),
    gpu: resolved.length === 0 ? null : spread(gpuTotals),
    gpuFrames: resolved.length,
    gpuTiming: options.gpuTiming ?? "span",
    cpu: selectedCpu,
    passes: namedCosts(resolved, top),
    calls: selectedCalls,
    omitted: { cpu: cpuRows.length - selectedCpu.length, calls: callRows.length - selectedCalls.length },
    counts: {
      drawsAvg: round(records.reduce((sum, record) => sum + record.draws, 0) / Math.max(1, records.length), 1),
      drawsMax: records.reduce((max, record) => Math.max(max, record.draws), 0),
      trianglesAvg: Math.round(records.reduce((sum, record) => sum + record.triangles, 0) / Math.max(1, records.length)),
      trianglesMax: records.reduce((max, record) => Math.max(max, record.triangles), 0),
      programs: options.programs ?? null,
      compiles: records.reduce((sum, record) => sum + record.compiles, 0),
      compileMs: round(records.reduce((sum, record) => sum + record.compileMs, 0), 1),
      uploads: records.reduce((sum, record) => sum + record.uploads, 0),
      uploadMb: round(records.reduce((sum, record) => sum + record.uploadBytes, 0) / 1048576, 1),
      heapMb: lastHeap === undefined ? null : round(lastHeap, 1),
      gcMb: round(records.reduce((sum, record) => sum + record.heapDropMb, 0), 1),
    },
    objects: [...draws.objects].sort(byCost).slice(0, top).map(perFrame),
    materials: [...draws.materials].sort(byCost).slice(0, top).map(perFrame),
    hitches: hitches.sort((a, b) => b.ms - a.ms).slice(0, options.hitches ?? 20),
  };
}

/** Frames per second a frame time allows, rounded; 0 for none. @internal */
export function fpsAt(ms: number): number {
  return ms > 0 ? Math.round(1000 / ms) : 0;
}

/**
 * The short text a person reads: frame spread, the cost per frame against 60 and 144 Hz, the top CPU
 * systems and GPU passes, counts, the costliest objects and materials, and the worst hitches.
 * @internal
 */
export function renderBreakdownText(summary: FrameBreakdownSummary, title: string): string {
  const cost = Math.max(summary.work.p50, summary.gpu?.p50 ?? 0);
  const cost95 = Math.max(summary.work.p95, summary.gpu?.p95 ?? 0);
  const ms = (value: number) => `${value.toFixed(2)} ms`;
  const lines = [
    `${title}: ${summary.frames} frames over ${summary.seconds} s`,
    `frame   p50 ${ms(summary.frame.p50)}  p95 ${ms(summary.frame.p95)}  p99 ${ms(summary.frame.p99)}  max ${ms(summary.frame.max)}  (${fpsAt(summary.frame.p50)} fps)`,
    `cpu     p50 ${ms(summary.work.p50)}  p95 ${ms(summary.work.p95)}   main-thread work per frame`,
    summary.gpu === null
      ? "gpu     unavailable or unresolved"
      : `gpu     p50 ${ms(summary.gpu.p50)}  p95 ${ms(summary.gpu.p95)} (${summary.gpuFrames ?? "?"}/${summary.frames} frames complete; ${summary.gpuTiming === "draws" ? "work: every draw timed on its own" : "span: pass timers, which also count the GPU idle waiting on the CPU"})`,
    summary.gpu === null ? "cost    unavailable without GPU timing" :
      `cost    larger CPU/GPU p50 ${ms(cost)}, p95 ${ms(cost95)}; overlap assumed, not an FPS prediction`,
    "",
    "top cpu (avg / p95 per frame):",
    ...summary.cpu.map((entry) => `  ${entry.name.padEnd(40)} ${entry.avgMs.toFixed(2).padStart(7)} / ${entry.p95Ms.toFixed(2)}`),
    ...(summary.calls === undefined || summary.calls.length === 0 ? ["scope calls: unavailable"] : ["scope calls (avg / max per frame):", ...summary.calls.map((entry) => `  ${entry.name} ${entry.avg} / ${entry.max}`)]),
    ...(summary.omitted === undefined ? [] : [`omitted from summary: ${summary.omitted.cpu} CPU rows, ${summary.omitted.calls} call rows`]),
    ...(summary.retention === undefined ? [] : [`retention omissions since install: ${summary.retention.callbacks} callbacks, ${summary.retention.draws} draw identities, ${summary.retention.passes} passes, ${summary.retention.subscribers} subscriber observations, ${summary.retention.shaders} shader observations`]),
    summary.workCounts === "enabled" ? "work counts: instrumented owners only; other work is unobserved" : "work counts: unavailable (deep diagnostics disabled or older record)",
    ...(summary.sources === undefined ? [] : [`callback sources: ${summary.sources.resolved} resolved, ${summary.sources.unresolved} unresolved${summary.sources.error === undefined ? "" : ` (${summary.sources.error})`}`]),
    ...(summary.passes.length === 0 ? [] : ["top gpu passes (avg / p95):", ...summary.passes.slice(0, 8).map((entry) => `  ${entry.name.padEnd(40)} ${entry.avgMs.toFixed(2).padStart(7)} / ${entry.p95Ms.toFixed(2)}`)]),
    `draws ${summary.counts.drawsAvg} avg (${summary.counts.drawsMax} max), triangles ${summary.counts.trianglesAvg} avg, programs ${summary.counts.programs ?? "?"}, ` +
      `compiles ${summary.counts.compiles} (${summary.counts.compileMs} ms), uploads ${summary.counts.uploads} (${summary.counts.uploadMb} MB), heap ${summary.counts.heapMb ?? "?"} MB, gc ~${summary.counts.gcMb} MB`,
    "top objects per frame (submit ms, draws, triangles, pass):",
    ...summary.objects.slice(0, 5).map((entry) => `  ${entry.label.padEnd(40)} ${entry.cpuMs.toFixed(3).padStart(7)} ms ${String(entry.draws).padStart(6)} ${entry.triangles} [${entry.pass}]`),
    "top materials per frame:",
    ...summary.materials.slice(0, 5).map((entry) => `  ${entry.label.padEnd(40)} ${entry.cpuMs.toFixed(3).padStart(7)} ms ${String(entry.draws).padStart(6)} ${entry.triangles} [${entry.pass}]${entry.gpuMs === undefined ? "" : ` gpu ${entry.gpuMs.toFixed(3)} ms`}`),
    summary.hitches.length === 0 ? "hitches: none over 33 ms" : `hitches over ${HITCH_MS} ms: ${summary.hitches.length}${summary.hitches.length >= 20 ? "+" : ""}`,
    ...summary.hitches.slice(0, 6).map((hitch) => `  ${hitch.atS.toFixed(2).padStart(6)} s ${hitch.ms.toFixed(1).padStart(6)} ms  ${hitch.cause}: ${hitch.detail}`),
  ];
  return lines.join("\n");
}
