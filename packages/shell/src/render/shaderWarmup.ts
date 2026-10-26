import {
  BackSide,
  DoubleSide,
  FrontSide,
  Frustum,
  Group,
  Matrix4,
  MeshDepthMaterial,
  Scene,
  MeshDistanceMaterial,
  Sphere,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
} from "three";

import { modelLoadIdleMs, modelLoadStarts } from "./modelLoad";

/**
 * Where the load-time shader warmup is: waiting for the scene to stop growing, compiling a
 * round, finished, or skipped because the renderer refused. The loading screen renders it.
 */
export interface ShaderWarmupState {
  phase: "waiting" | "compiling" | "ready" | "failed";
  /** Compile rounds finished. One round covers one burst of streamed models. */
  rounds: number;
  /** Shader programs the renderer has initialised, as of the last round. */
  programs: number;
  /** Drawables the first frame can reach; these are compiled before the first frame is shown. */
  planned: number;
  /** Drawables the first frame cannot reach; compiled in the background after the reveal. */
  deferred: number;
  /** Share of the queued links the GPU has run, 0 to 1, for a bar that means something. */
  progress: number;
  elapsedMs: number;
}

/** The renderer surface the warmup needs; a real `WebGLRenderer` satisfies it. */
export interface ShaderWarmupRenderer {
  /** Links every mounted material's program; returns the materials it prepared. Lights come from `targetScene` when given. */
  compile(scene: Object3D, camera: Camera, targetScene?: Scene): unknown;
  /** Whether the shadow pass runs, which draws casters with depth materials the scene never holds. */
  readonly shadowMap?: { readonly enabled?: boolean; autoUpdate?: boolean; needsUpdate?: boolean };
  /** Renderer program list; each entry answers `isReady()` once the driver finishes its link. */
  readonly info?: { readonly programs?: readonly unknown[] | null };
  /** The render target currently bound, if any; three builds different programs for a target. */
  getRenderTarget?(): unknown;
  /** Bind a render target, or `null` for the canvas. */
  setRenderTarget?(target: unknown | null): void;
  /** The GL context, for the fence that tells when the GPU has run a batch's compiles. */
  getContext?(): unknown;
  /**
   * Draws a scene: the warmup draws each linked program once while covered, because some drivers
   * (ANGLE on Direct3D) finish a program only at its first draw, for that draw's vertex layout.
   */
  render?(scene: Object3D, camera: Camera): unknown;
}

/** A renderer program's completion check, which three keeps off its public type. */
interface ReadyProgram {
  isReady?(): boolean;
}

function programReady(program: unknown): boolean {
  try {
    return (program as ReadyProgram).isReady?.() !== false;
  } catch {
    return true;
  }
}

/**
 * Ask a linked program for its uniforms and attributes now. three does it at the program's first
 * draw with queries that wait for the GPU to work through everything queued before them, which
 * mid-load is texture uploads and other links; asked right after a fence, the queue is empty.
 */
function firstUse(program: unknown): void {
  try {
    const known = program as { getUniforms?(): unknown; getAttributes?(): unknown };
    known.getUniforms?.();
    known.getAttributes?.();
  } catch {
    /* a lost context answers nothing; the draw reports it */
  }
}

/** A scene node that can be drawn: the renderer reads a material and geometry off it. */
type Drawable = Object3D & {
  material?: unknown;
  geometry?: BufferGeometry;
};

function isDrawable(object: Object3D): object is Drawable {
  const candidate = object as { material?: unknown; isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isMesh?: boolean };
  if (candidate.material === undefined) return false;
  return candidate.isMesh === true || candidate.isPoints === true || candidate.isLine === true || candidate.isSprite === true;
}

/** Knobs for {@link planFirstFrame}; the defaults are what a normal load wants. @internal */
export interface FirstFramePlanOptions {
  /** Bounding-sphere growth for the view test, so a prop just offscreen stays in the plan. */
  viewMargin?: number;
}

/** Which drawables the first frame can reach, so the cover waits for those and no others. @internal */
export interface FirstFramePlan {
  /** Drawables compiled before the first frame is shown. */
  objects: ReadonlySet<Object3D>;
  /** How many drawables the plan covers. */
  reachable: number;
  /** Drawables outside the first frame's reach, for the background compile. */
  deferred: number;
}

const DEFAULT_VIEW_MARGIN = 1.4;

/**
 * The drawables the first frame can reach: shown, on a layer the camera renders, and either
 * inside the view or a shadow caster, which the shadow pass draws without the camera seeing it.
 *
 * An object just outside the frame still counts, because a turned camera makes it visible before
 * any background compile finishes; the view is grown by {@link FirstFramePlanOptions.viewMargin}.
 * @internal
 */
export function planFirstFrame(scene: Object3D, camera: Camera, options: FirstFramePlanOptions = {}): FirstFramePlan {
  const margin = options.viewMargin ?? DEFAULT_VIEW_MARGIN;
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  const frustum = new Frustum();
  frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

  const objects = new Set<Object3D>();
  let deferred = 0;
  const visit = (object: Object3D, shownByParent: boolean): void => {
    const shown = shownByParent && object.visible;
    if (isDrawable(object)) {
      if (shown && inReach(object, camera, frustum, margin)) objects.add(object);
      else deferred += 1;
    }
    for (const child of object.children) visit(child, shown);
  };
  visit(scene, true);
  return { objects, reachable: objects.size, deferred };
}

function inReach(object: Drawable, camera: Camera, frustum: Frustum, margin: number): boolean {
  if (!object.layers.test(camera.layers)) return false;
  if (object.frustumCulled === false) return true;
  const geometry = object.geometry;
  if (geometry !== undefined && geometry.boundingSphere === null) geometry.computeBoundingSphere();
  const sphere = geometry?.boundingSphere ?? null;
  if (sphere === null) return true;
  // A caster outside the view is still drawn by the shadow pass, so its program is needed too.
  if (object.castShadow === true) return true;
  const position = object.getWorldPosition(new Vector3());
  const grown = new Sphere().copy(sphere).translate(position);
  grown.radius = sphere.radius * margin;
  return frustum.intersectsSphere(grown);
}

/**
 * Links the programs of the drawables the predicate keeps, and nothing else: three has no
 * per-object compile, so the rest is lifted out of the graph for the length of the synchronous
 * call and put back exactly where it was. Same objects, so the programs are the ones a draw
 * would build, which a cloned stand-in scene cannot promise.
 * @internal
 */
export function compileSubset(renderer: ShaderWarmupRenderer, scene: Object3D, camera: Camera, keep: (object: Object3D) => boolean): void {
  const lifted: { parent: Object3D; index: number; object: Object3D }[] = [];
  const walk = (object: Object3D): void => {
    for (const child of [...object.children]) {
      if (isDrawable(child) && !keep(child)) {
        lifted.push({ parent: object, index: object.children.indexOf(child), object: child });
        object.children.splice(object.children.indexOf(child), 1);
        child.parent = null;
        continue;
      }
      walk(child);
    }
  };
  walk(scene);
  try {
    renderer.compile(scene, camera);
  } finally {
    for (const { parent, index, object } of lifted.sort((a, b) => a.index - b.index)) {
      parent.children.splice(Math.min(index, parent.children.length), 0, object);
      object.parent = parent;
    }
  }
}

/**
 * Draws the drawables the predicate keeps, once, with everything else lifted out the same way as
 * {@link compileSubset}. Kept objects draw even outside the view, and the shadow pass is skipped
 * so the scene's shadow maps keep what the real frames drew. For drivers that finish a program
 * at its first draw: the draw happens here, a few programs at a time, instead of on a shown frame.
 * @internal
 */
export function drawSubset(renderer: ShaderWarmupRenderer, scene: Object3D, camera: Camera, keep: (object: Object3D) => boolean): void {
  if (renderer.render === undefined) return;
  const lifted: { parent: Object3D; index: number; object: Object3D }[] = [];
  const culled: Object3D[] = [];
  const walk = (object: Object3D): void => {
    for (const child of [...object.children]) {
      if (isDrawable(child) && !keep(child)) {
        lifted.push({ parent: object, index: object.children.indexOf(child), object: child });
        object.children.splice(object.children.indexOf(child), 1);
        child.parent = null;
        continue;
      }
      if (isDrawable(child) && child.frustumCulled) {
        child.frustumCulled = false;
        culled.push(child);
      }
      walk(child);
    }
  };
  walk(scene);
  const shadows = renderer.shadowMap;
  const autoUpdate = shadows?.autoUpdate;
  const needsUpdate = shadows?.needsUpdate;
  if (shadows !== undefined) {
    shadows.autoUpdate = false;
    shadows.needsUpdate = false;
  }
  try {
    renderer.render(scene, camera);
  } finally {
    if (shadows !== undefined) {
      shadows.autoUpdate = autoUpdate;
      shadows.needsUpdate = needsUpdate;
    }
    for (const object of culled) object.frustumCulled = true;
    for (const { parent, index, object } of lifted.sort((a, b) => a.index - b.index)) {
      parent.children.splice(Math.min(index, parent.children.length), 0, object);
      object.parent = parent;
    }
  }
}

/** The vertex layout a draw feeds a program: some drivers build a program per layout at its first draw. */
function layoutKey(object: Drawable): string {
  const geometry = object.geometry;
  if (geometry === undefined) return "";
  const parts: string[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const typed = attribute as { itemSize?: number; normalized?: boolean; array?: { constructor: { name: string } }; data?: { array?: { constructor: { name: string } } } };
    const array = typed.array ?? typed.data?.array;
    parts.push(`${name}:${typed.itemSize}:${typed.normalized === true ? "n" : ""}:${array?.constructor.name ?? ""}`);
  }
  return parts.sort().join(",");
}

/** What decides a drawable's program besides its material, so one of each is enough for a batch. */
function programKey(object: Drawable): string {
  const material = object.material as { uuid?: string } | { uuid?: string }[] | undefined;
  const materials = Array.isArray(material) ? material.map((entry) => entry?.uuid).join(",") : material?.uuid;
  const flags = object as { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isBatchedMesh?: boolean };
  const attributes = object.geometry?.attributes ?? {};
  const morph = object.geometry?.morphAttributes ?? {};
  return [
    materials,
    flags.isInstancedMesh === true ? "i" : "",
    flags.isSkinnedMesh === true ? "s" : "",
    flags.isBatchedMesh === true ? "b" : "",
    flags.isPoints === true ? "p" : flags.isLine === true ? "l" : flags.isSprite === true ? "r" : "m",
    object.receiveShadow ? "rs" : "",
    "color" in attributes ? "c" : "",
    "tangent" in attributes ? "t" : "",
    "uv1" in attributes ? "u1" : "",
    Object.keys(morph).join("+"),
  ].join("|");
}

/**
 * Splits drawables into batches of at most `perBatch` distinct programs, so each GPU flush links a
 * few programs instead of the whole scene. One flush is one uninterruptible GPU task, and the
 * page's own drawing (the menu over the cover) shares that thread and waits for all of it.
 * Duplicates of a key ride in the batch of the first one, so every drawable is in exactly one.
 * @internal
 */
export function batchByProgram(objects: Iterable<Object3D>, perBatch: number): Set<Object3D>[] {
  const batchOf = new Map<string, Set<Object3D>>();
  const batches: Set<Object3D>[] = [];
  let open: Set<Object3D> | null = null;
  let keysInOpen = 0;
  for (const object of objects) {
    if (!isDrawable(object)) continue;
    const key = programKey(object);
    const existing = batchOf.get(key);
    if (existing !== undefined) {
      existing.add(object);
      continue;
    }
    if (open === null || keysInOpen >= perBatch) {
      open = new Set();
      batches.push(open);
      keysInOpen = 0;
    }
    open.add(object);
    batchOf.set(key, open);
    keysInOpen += 1;
  }
  return batches;
}

interface FenceGl {
  SYNC_GPU_COMMANDS_COMPLETE: number;
  ALREADY_SIGNALED: number;
  CONDITION_SATISFIED: number;
  WAIT_FAILED: number;
  fenceSync(condition: number, flags: number): unknown;
  clientWaitSync(sync: unknown, flags: number, timeout: number): number;
  deleteSync(sync: unknown): void;
  flush(): void;
}

function isFenceGl(gl: unknown): gl is FenceGl {
  return typeof gl === "object" && gl !== null && typeof (gl as FenceGl).fenceSync === "function" && typeof (gl as FenceGl).clientWaitSync === "function";
}

const FENCE_POLL_MS = 8;

/**
 * Resolves once the GPU has run every command queued before the call, without a blocking query.
 *
 * A program-status query is a synchronous round trip: while the GPU process is busy compiling it
 * stalls the page's main thread for the whole compile, and the menu stops answering clicks. A
 * fence polled with a zero timeout never waits; the browser refreshes its status between tasks.
 * Without WebGL2 it resolves after one sleep. `stop` ends the wait early.
 * @internal
 */
export async function gpuFence(gl: unknown, sleep: (ms: number) => Promise<void>, stop: () => boolean): Promise<void> {
  if (!isFenceGl(gl)) {
    await sleep(0);
    return;
  }
  let sync: unknown = null;
  try {
    sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    for (;;) {
      await sleep(FENCE_POLL_MS);
      if (sync === null || stop()) return;
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.WAIT_FAILED) return;
    }
  } catch {
    /* a lost context answers nothing; the caller's stop still bounds the wait */
  } finally {
    if (sync !== null) {
      try {
        gl.deleteSync(sync);
      } catch {
        /* already gone with the context */
      }
    }
  }
}

/** A draw the hold swallowed: what it would have drawn, from where, into what, with what override. */
export interface HeldDraw {
  object: Object3D;
  camera: Camera;
  /** The render target bound at the call; `null` is the canvas. */
  target: unknown;
  /** The scene's `overrideMaterial` at the call, which a pass such as an AO normal pass sets. */
  override: unknown;
  /** The object's own material at the call; a full-screen quad swaps materials between passes. */
  material: unknown;
}

/** Options for {@link holdDraws}. */
export interface HoldDrawsOptions {
  /** Whether a call right now is held; default always. The gate holds only the frame loop's draws. */
  holding?: () => boolean;
  /** Told about every held draw, so the warmup can link what the frame would have drawn. */
  onHeld?: (draw: HeldDraw) => void;
}

type RenderMethod = (scene: never, camera: never) => unknown;

const heldRenderers = new WeakMap<object, () => boolean>();

/**
 * Whether a draw on `renderer` right now would be swallowed by a {@link holdDraws}, so work that
 * draws for its own sake (a reflection capture) waits instead of capturing nothing. @internal
 */
export function drawsHeld(renderer: object): boolean {
  return heldRenderers.get(renderer)?.() ?? false;
}

const targetDrawers = new WeakMap<Object3D, number>();

/**
 * Declare that something draws `scene` into a render target (a reflection probe's cube faces), so
 * the warmup links the target's programs too when the frame itself draws to the canvas: three
 * builds the two apart. Returns the undo. @internal
 */
export function warmupDrawsToTarget(scene: Object3D): () => void {
  targetDrawers.set(scene, (targetDrawers.get(scene) ?? 0) + 1);
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    const left = (targetDrawers.get(scene) ?? 1) - 1;
    if (left <= 0) targetDrawers.delete(scene);
    else targetDrawers.set(scene, left);
  };
}

/**
 * Stops a renderer drawing until the returned release runs: `render` becomes a no-op while
 * `holding` says so, so a frame loop that keeps ticking (camera rigs, game systems, the post
 * chain) cannot link a program on the main thread mid-frame while the warmup still has it in
 * flight. Draws outside the hold (an environment bake, an impostor bake) go through. Release puts
 * the renderer's own method back; when something wrapped `render` on top, the hold just passes
 * through from then on.
 * @internal
 */
export function holdDraws(renderer: { render: RenderMethod; getRenderTarget?(): unknown }, options: HoldDrawsOptions = {}): () => void {
  const owned = Object.prototype.hasOwnProperty.call(renderer, "render");
  const previous = renderer.render;
  let released = false;
  const holding = options.holding ?? (() => true);
  heldRenderers.set(renderer, holding);
  const held = function (this: unknown, scene: never, camera: never): unknown {
    if (!released && (options.holding?.() ?? true)) {
      const object = scene as Object3D & { overrideMaterial?: unknown; material?: unknown };
      options.onHeld?.({
        object,
        camera: camera as Camera,
        target: renderer.getRenderTarget?.() ?? null,
        override: object.overrideMaterial ?? null,
        material: object.material ?? null,
      });
      return undefined;
    }
    return previous.call(renderer, scene, camera);
  } as RenderMethod;
  renderer.render = held;
  return () => {
    if (released) return;
    released = true;
    if (heldRenderers.get(renderer) === holding) heldRenderers.delete(renderer);
    if (renderer.render !== held) return;
    if (owned) renderer.render = previous;
    else delete (renderer as { render?: unknown }).render;
  };
}

/**
 * A stand-in for a real drawable with another material: it reads everything else (instancing,
 * skinning, morphs, geometry) off the real object through the prototype, so three builds the
 * program a draw of that object with that material would build. Its own children list is empty,
 * so a compile of it never reaches the real object's subtree.
 */
function standIn(object: Object3D, material: unknown): Object3D {
  const proxy = Object.create(object) as Object3D & { material: unknown };
  proxy.material = material;
  proxy.children = [];
  proxy.parent = null;
  return proxy;
}

/** A group of stand-ins that a compile can walk; built by hand so no `added` event reaches the real objects. */
function standInGroup(proxies: readonly Object3D[]): Object3D {
  const group = new Group();
  group.children = [...proxies];
  return group;
}

type ShadowSource = Material & {
  alphaMap?: unknown;
  map?: unknown;
  displacementMap?: unknown;
  displacementScale?: number;
  shadowSide?: number | null;
  alphaToCoverage?: boolean;
};

const SHADOW_SIDE: Record<number, number> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

/**
 * The depth material the shadow pass will draw `material` with, mirroring three's own choice: the
 * object's custom depth material, else its shared depth material carrying this material's maps,
 * alpha test, displacement and side, which all change the program. Stand-ins are cached by
 * exactly those, so one is linked per program.
 */
function shadowMaterialFor(object: Object3D, material: ShadowSource, point: boolean, cache: Map<string, Material>): Material {
  const custom = (point ? (object as { customDistanceMaterial?: Material }).customDistanceMaterial : (object as { customDepthMaterial?: Material }).customDepthMaterial);
  if (custom !== undefined) return custom;
  const alphaTest = material.alphaToCoverage === true ? 0.5 : material.alphaTest;
  const side = material.shadowSide ?? SHADOW_SIDE[material.side] ?? material.side;
  const channel = (texture: unknown): string => (texture == null ? "-" : String((texture as { channel?: number }).channel ?? 0));
  const displaced = material.displacementMap != null && material.displacementScale !== 0;
  const key = [point ? "d" : "z", channel(material.map), channel(material.alphaMap), alphaTest > 0 ? "a" : "", displaced ? channel(material.displacementMap) : "-", side].join("|");
  let made = cache.get(key);
  if (made === undefined) {
    const depth = point ? new MeshDistanceMaterial() : new MeshDepthMaterial();
    depth.side = side as Material["side"];
    depth.alphaTest = alphaTest;
    depth.map = (material.map ?? null) as Texture | null;
    depth.alphaMap = (material.alphaMap ?? null) as Texture | null;
    if (displaced) {
      depth.displacementMap = material.displacementMap as Texture;
      depth.displacementScale = material.displacementScale ?? 1;
    }
    made = depth;
    cache.set(key, made);
  }
  return made;
}

const warmupPreparers = new WeakMap<Object3D, Set<() => void>>();

/**
 * Run `prepare` before each warmup round of the scene, for code that settles materials lazily at
 * draw time (a material patched on its first draw): the warmup then links the program that draw
 * will use, not the one it would replace. Returns the unregister. @internal
 */
export function prepareBeforeWarmup(scene: Object3D, prepare: () => void): () => void {
  let preparers = warmupPreparers.get(scene);
  if (preparers === undefined) {
    preparers = new Set();
    warmupPreparers.set(scene, preparers);
  }
  preparers.add(prepare);
  return () => preparers.delete(prepare);
}

function runPreparers(scene: Object3D): void {
  for (const prepare of warmupPreparers.get(scene) ?? []) {
    try {
      prepare();
    } catch {
      /* a preparer that throws leaves its materials to their first draw */
    }
  }
}

const warmupHolds = new WeakMap<Object3D, Set<Promise<unknown>>>();

/**
 * Hold the scene's covered warmup until `work` settles. For work that changes every program the
 * scene links, such as the environment map (its presence is part of every lit material's
 * program): a warmup that ran first would link programs the first frame never draws. @internal
 */
export function warmupWaitsFor(scene: Object3D, work: Promise<unknown>): void {
  let holds = warmupHolds.get(scene);
  if (holds === undefined) {
    holds = new Set();
    warmupHolds.set(scene, holds);
  }
  const tracked = work.then(
    () => undefined,
    () => undefined,
  );
  holds.add(tracked);
  void tracked.then(() => holds.delete(tracked));
}

/**
 * Resolves once the programs `compile` queued have run on the GPU, without a blocking query, so
 * the draw that follows finds them linked. For one-off draws outside the scene warmup, such as the
 * environment bake. @internal
 */
export async function linkAhead(renderer: ShaderWarmupRenderer, compile: () => void, stop: () => boolean = () => false): Promise<void> {
  const before = renderer.info?.programs?.length ?? 0;
  compile();
  const created = renderer.info?.programs?.slice(before) ?? [];
  if (created.length === 0) return;
  try {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  // The fence covers a driver that links on the GPU thread; a driver with link workers finishes
  // later, so the completion check follows. Once the fence has passed, that check is a cheap read.
  await gpuFence(renderer.getContext?.(), sleep, stop);
  const giveUpAt = performance.now() + SHADER_WARMUP_DEFAULTS.stallMs;
  while (!stop() && performance.now() < giveUpAt && !created.every(programReady)) await sleep(LINK_POLL_MS);
  } finally {
    for (const program of created) if (programReady(program)) firstUse(program);
  }
}

const LINK_POLL_MS = 16;

function markTimeline(name: string, detail: unknown): void {
  try {
    performance.mark(name, { detail });
  } catch {
    /* no user timing here (tests, old runtimes) */
  }
}

/** Defaults sized to cover one load: the covered wait is the driver's link time, not a guess. */
export const SHADER_WARMUP_DEFAULTS = {
  /** Loader and program quiet time before the first frame is shown. */
  quietMs: 250,
  /**
   * Wall-clock cap on the covered wait. The reveal happens at it either way, and whatever is still
   * unlinked then links on the first shown frame, freezing it; the menu stays live while covered,
   * so the cap is only a guard against a driver that never finishes.
   */
  planBudgetMs: 120_000,
  /**
   * A covered wait in which no program finishes for this long is a stuck driver: reveal anyway.
   * Long, because one large program (a textured terrain on a cold Direct3D cache) can take 20 s.
   */
  stallMs: 30_000,
  /** Floor for one wait, so a driver that never reports completion cannot stall load. */
  planFloorMs: 1_500,
  /** How often the covered loop looks for content that streamed in while it waited. */
  pollMs: 100,
  /** How long the background compile keeps looking for content that landed after the reveal. */
  backgroundMs: 2_000,
  /** Gap between background rounds. A round only queues links; it does not wait on the driver. */
  backgroundEveryMs: 250,
  /**
   * Distinct programs linked per GPU flush. A driver with link workers runs a flush's links in
   * parallel, so a dozen finish far sooner than three at a time; the fence after each flush keeps
   * the next from piling on.
   */
  programsPerBatch: 12,
} as const;

/** Options for {@link createShaderWarmup}; the clock, sleep and loader signal are injectable for tests. */
export interface ShaderWarmupOptions {
  renderer: ShaderWarmupRenderer;
  scene: Scene;
  camera: Camera;
  quietMs?: number;
  planBudgetMs?: number;
  pollMs?: number;
  backgroundMs?: number;
  backgroundEveryMs?: number;
  /** Distinct programs per GPU flush; see {@link SHADER_WARMUP_DEFAULTS}. */
  programsPerBatch?: number;
  /** Called on every state change, so the loading screen can show the phase. */
  onState?: (state: ShaderWarmupState) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Whether the shared model loader has been quiet long enough. */
  loaderQuiet?: (quietMs: number) => boolean;
  /** Changes whenever the shared loader starts a new burst of model loads. */
  loaderStarts?: () => number;
  /**
   * Whether the frame that follows the cover draws the scene into a render target instead of the
   * canvas, asked again on every round. three builds different programs for the two: a target
   * renders linear with no tone map, the canvas renders in the output colour space with one. The
   * warmup compiles against the one the frame will draw with, so it no longer links a set that
   * nothing draws.
   */
  sceneDrawsToTarget?: () => boolean;
  /**
   * Draws the frame loop tried while held, handed over and forgotten on each call. Passes that
   * draw outside the scene (post-processing quads, override-material passes) link their programs
   * from these, so the first shown frame has nothing left to link.
   */
  takeHeldDraws?: () => readonly HeldDraw[];
}

/** A warmup in flight: its promise, its latest state, and a way to stop it. */
export interface ShaderWarmup {
  /** Resolves when warm, capped or failed; never rejects. */
  done: Promise<ShaderWarmupState>;
  state(): ShaderWarmupState;
  /** Stop after the round in flight and stop waiting; used when the view unmounts. */
  cancel(): void;
}

/**
 * Compile what the first frame can reach, show it, then finish the rest in the background.
 *
 * The canvas does not draw while this runs (the loading cover holds it), so the driver links the
 * first frame's programs in parallel with the scene still mounting, and nothing waits on a link
 * from inside a frame. The covered wait ends when a round finds no new program and the model
 * loader has gone quiet, so a scene that streams for seconds no longer holds the cover for all of
 * it. Everything the first frame cannot reach is compiled in background rounds afterwards: those
 * objects are not on screen, so their links never land on a drawing frame.
 *
 * Everything is bounded: the reveal is raced against the plan budget, so a driver that never
 * reports a finished program cannot hold the loading screen.
 * @internal
 */
export function createShaderWarmup(options: ShaderWarmupOptions): ShaderWarmup {
  const quietMs = options.quietMs ?? SHADER_WARMUP_DEFAULTS.quietMs;
  const planBudgetMs = options.planBudgetMs ?? SHADER_WARMUP_DEFAULTS.planBudgetMs;
  const pollMs = options.pollMs ?? SHADER_WARMUP_DEFAULTS.pollMs;
  const backgroundMs = options.backgroundMs ?? SHADER_WARMUP_DEFAULTS.backgroundMs;
  const backgroundEveryMs = options.backgroundEveryMs ?? SHADER_WARMUP_DEFAULTS.backgroundEveryMs;
  const programsPerBatch = Math.max(1, options.programsPerBatch ?? SHADER_WARMUP_DEFAULTS.programsPerBatch);
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const loaderQuiet = options.loaderQuiet ?? ((quiet: number) => modelLoadIdleMs() >= quiet);
  const loaderStarts = options.loaderStarts ?? modelLoadStarts;
  const startedAt = now();
  let state: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, planned: 0, deferred: 0, progress: 0, elapsedMs: 0 };
  let cancelled = false;

  const programs = (): number => options.renderer.info?.programs?.length ?? 0;

  // Any target builds the same programs: three reads "rendering to a target" for the colour space
  // and the tone map, not the target's size or format.
  let scratchTarget: WebGLRenderTarget | null = null;
  const scratch = (): WebGLRenderTarget => {
    scratchTarget ??= new WebGLRenderTarget(1, 1);
    return scratchTarget;
  };
  const frameTarget = (): WebGLRenderTarget | null => (options.sceneDrawsToTarget?.() === true ? scratch() : null);
  const releaseScratch = (): void => {
    scratchTarget?.dispose();
    scratchTarget = null;
  };

  /** Compile with the frame's target bound, so the links are the programs that frame draws. */
  const withFrameTarget = (compile: () => void): void => withTarget(frameTarget(), compile);

  /** Compile with `target` bound (`null` is the canvas), then put back what was bound. */
  const withTarget = (target: unknown, compile: () => void): void => {
    const renderer = options.renderer;
    const previous = renderer.getRenderTarget?.() ?? null;
    if (renderer.setRenderTarget === undefined || previous === target) {
      compile();
      return;
    }
    renderer.setRenderTarget(target);
    try {
      compile();
    } finally {
      renderer.setRenderTarget(previous);
    }
  };

  const publish = (next: Partial<ShaderWarmupState>): void => {
    const phase = state.phase;
    state = { ...state, ...next, elapsedMs: Math.round(now() - startedAt) };
    // Phase changes land on the performance timeline, so a load trace shows when the cover lifted.
    if (state.phase !== phase) markTimeline(`jg:warmup:${state.phase}`, state);
    options.onState?.(state);
  };

  /** Wait for the programs a round created, polling readiness so the thread stays free to mount. */
  const settle = async (before: ReadonlySet<unknown>, deadline: number): Promise<boolean> => {
    let polls = 0;
    let ready = -1;
    let movedAt = now();
    for (;;) {
      if (cancelled) return false;
      const created = (options.renderer.info?.programs ?? []).filter((program) => !before.has(program));
      let readyNow = 0;
      for (const program of created) {
        if (!programReady(program)) continue;
        readyNow += 1;
        if (firstUsed.has(program as object)) continue;
        firstUsed.add(program as object);
        firstUse(program);
      }
      if (readyNow === created.length) return true;
      if (readyNow !== ready) {
        ready = readyNow;
        movedAt = now();
      }
      if (now() >= deadline || now() - movedAt >= SHADER_WARMUP_DEFAULTS.stallMs) return false;
      if (polls++ % 20 === 0) publish({ programs: programs() });
      await sleep(10);
    }
  };

  /** Programs whose uniforms were fetched ahead of their first draw. */
  const firstUsed = new WeakSet<object>();
  const programSet = (): Set<unknown> => new Set(options.renderer.info?.programs ?? []);

  /**
   * What a drawable's program was linked against, per drawable: its materials' versions (a define
   * added after mount bumps one) and the scene state every program reads (lights, environment,
   * fog). A drawable is linked again when that changes, since its old program no longer fits.
   */
  const warmed = new WeakMap<Object3D, string>();
  /** The same for the render-target programs a probe's draws need while the frame draws to the canvas. */
  const warmedForTarget = new WeakMap<Object3D, string>();
  /** The same, per kind of shadow (depth, distance), for the casters' depth programs. */
  const shadowWarmed = { z: new WeakMap<Object3D, string>(), d: new WeakMap<Object3D, string>() };
  const shadowMaterials = new Map<string, Material>();
  /** Held draws already linked, by what decides their programs. */
  const drawsWarmed = new Set<string>();
  /** Held draws linked but not yet drawn once. */
  let heldToDraw: HeldDraw[] = [];
  /** Program and vertex layout pairs already drawn once, so a driver that builds per layout has built them. */
  const drawnLayouts = new Set<string>();
  /** Drawables whose program and layout were drawn, against the context they were drawn in. */
  const drawn = new WeakMap<Object3D, string>();
  /** Links queued and run while covered, for the bar. */
  let queued = 0;
  let linked = 0;

  /** The scene state every lit program is built for; read once per round. */
  interface SceneContext {
    key: string;
    /** The lights the frame's camera sees, which the shadow pass links its programs against. */
    lights: Object3D[];
    shadowKinds: Set<"z" | "d">;
  }
  const readContext = (): SceneContext => {
    const lights: Object3D[] = [];
    const shadowKinds = new Set<"z" | "d">();
    const counts = new Map<string, number>();
    options.scene.traverseVisible((object) => {
      const light = object as Object3D & { isLight?: boolean; castShadow?: boolean; isPointLight?: boolean; type: string };
      if (light.isLight !== true || !light.layers.test(options.camera.layers)) return;
      lights.push(light);
      const kind = `${light.type}${light.castShadow === true ? "+s" : ""}`;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      if (light.castShadow === true) shadowKinds.add(light.isPointLight === true ? "d" : "z");
    });
    const scene = options.scene as Scene;
    const key = [
      [...counts].sort().join(","),
      scene.environment?.uuid ?? "",
      scene.fog === null || scene.fog === undefined ? "" : (scene.fog as { isFogExp2?: boolean }).isFogExp2 === true ? "exp2" : "fog",
      options.renderer.shadowMap?.enabled === true ? "shadows" : "",
    ].join("|");
    return { key, lights, shadowKinds };
  };

  const materialVersions = (material: unknown): string =>
    (Array.isArray(material) ? material : [material]).map((entry: { uuid?: string; version?: number } | undefined) => `${entry?.uuid}:${entry?.version}`).join(",");

  /** One GPU flush: a compile that may queue a few program links. */
  type LinkJob = () => void | Promise<void>;

  /**
   * Run link jobs one flush at a time. Each flush that queued links is followed by a fence, so
   * the next waits for the GPU without a blocking query and the main thread is free in between.
   * Returns false when a compile threw.
   */
  const runJobs = async (jobs: readonly LinkJob[], stop: () => boolean, fenceEvery = false): Promise<boolean> => {
    queued += jobs.length;
    for (const job of jobs) {
      if (cancelled) return true;
      const before = programs();
      try {
        await job();
      } catch {
        return false;
      }
      if (fenceEvery || programs() > before) await gpuFence(options.renderer.getContext?.(), sleep, stop);
      linked += 1;
      if (state.phase === "compiling") publish({ progress: linked / queued, programs: programs() });
    }
    return true;
  };

  /**
   * The targets the scene's programs are linked for: the frame's own, and a render target as well
   * when something else draws the scene into one while the frame draws to the canvas.
   */
  const variants = (): { target: WebGLRenderTarget | null; linked: WeakMap<Object3D, string> }[] => {
    const frame = frameTarget();
    const own = { target: frame, linked: warmed };
    return frame === null && (targetDrawers.get(options.scene) ?? 0) > 0 ? [own, { target: scratch(), linked: warmedForTarget }] : [own];
  };

  /** A job per batch of the given drawables' own programs, per target the scene is drawn into. */
  const sceneJobs = (objects: Iterable<Object3D>, context: SceneContext): LinkJob[] => {
    const jobs: LinkJob[] = [];
    const list = [...objects];
    const stamp = (object: Object3D): string => `${materialVersions((object as Drawable).material)}|${context.key}`;
    for (const { target, linked } of variants()) {
      const due = list.filter((object) => isDrawable(object) && linked.get(object) !== stamp(object));
      for (const batch of batchByProgram(due, programsPerBatch)) {
        jobs.push(() => {
          withTarget(target, () => compileSubset(options.renderer, options.scene, options.camera, (object) => batch.has(object)));
          for (const object of batch) linked.set(object, stamp(object));
        });
      }
    }
    return jobs;
  };

  /**
   * Jobs for the depth programs the shadow pass draws the casters among `objects` with. The pass
   * draws with the frame's lights but no fog or environment, so the stand-ins are linked in a bare
   * scene that holds only those lights.
   */
  const shadowJobs = (objects: Iterable<Object3D>, context: SceneContext): LinkJob[] => {
    if (options.renderer.shadowMap?.enabled !== true || context.shadowKinds.size === 0) return [];
    const jobs: LinkJob[] = [];
    const casters = [...objects].filter((object) => object.castShadow && isDrawable(object));
    for (const kind of context.shadowKinds) {
      const proxies: Object3D[] = [];
      for (const object of casters) {
        const key = `${materialVersions((object as Drawable).material)}|${context.key}`;
        if (shadowWarmed[kind].get(object) === key) continue;
        shadowWarmed[kind].set(object, key);
        const material = (object as Drawable).material as ShadowSource | ShadowSource[];
        const depth = Array.isArray(material)
          ? material.map((entry) => shadowMaterialFor(object, entry, kind === "d", shadowMaterials))
          : shadowMaterialFor(object, material, kind === "d", shadowMaterials);
        proxies.push(standIn(object, depth));
      }
      for (const batch of batchByProgram(proxies, programsPerBatch)) {
        jobs.push(() =>
          withTarget(scratch(), () => {
            const bare = new Scene();
            options.renderer.compile(standInGroup([...batch, ...context.lights]), options.camera, bare);
          }),
        );
      }
    }
    return jobs;
  };

  /**
   * Jobs that draw each linked program once per vertex layout, one program per draw so the main
   * thread never waits on one first draw while the GPU builds another. Run after the links have
   * finished, so the draw's own link check returns at once.
   */
  const drawJobs = (objects: readonly Object3D[], context: SceneContext): LinkJob[] => {
    if (options.renderer.render === undefined) return [];
    const due: Object3D[] = [];
    for (const object of objects) {
      if (!isDrawable(object)) continue;
      const stamp = `${materialVersions(object.material)}|${context.key}`;
      if (drawn.get(object) === stamp) continue;
      drawn.set(object, stamp);
      const pair = `${programKey(object)}#${layoutKey(object)}`;
      if (drawnLayouts.has(pair)) continue;
      drawnLayouts.add(pair);
      due.push(object);
    }
    const jobs: LinkJob[] = [];
    // Programs are linked by now, so a draw's link check returns at once; a batch per job keeps the
    // count of fences down, and a driver that still builds at first draw builds a batch at a time.
    for (const batch of batchByProgram(due, programsPerBatch)) {
      const keep = (object: Object3D): boolean => batch.has(object);
      jobs.push(async () => {
        // A material can settle on another program after its link (a texture landed, a define was
        // added), so link the batch again first: a cached program costs nothing, a new one is
        // linked and waited for off the frame instead of inside the draw.
        runPreparers(options.scene);
        const known = programSet();
        withFrameTarget(() => compileSubset(options.renderer, options.scene, options.camera, keep));
        if ((options.renderer.info?.programs?.length ?? 0) > known.size) {
          await gpuFence(options.renderer.getContext?.(), sleep, () => cancelled);
          // A program still building is left to its first real draw: drawing it here would hold
          // the thread on the driver, which is the stall the warmup exists to keep off the menu.
          if (!(await settle(known, now() + SHADER_WARMUP_DEFAULTS.stallMs))) return;
        }
        if (cancelled) return;
        withFrameTarget(() => drawSubset(options.renderer, options.scene, options.camera, keep));
      });
    }
    for (const draw of heldToDraw) {
      const override = draw.override as Material | null;
      if (override !== null && draw.object === options.scene) {
        const scene = options.scene as Scene;
        const keep = new Set(objects);
        jobs.push(() =>
          withTarget(draw.target, () => {
            const previous = scene.overrideMaterial;
            scene.overrideMaterial = override;
            try {
              drawSubset(options.renderer, scene, draw.camera, (object) => keep.has(object));
            } finally {
              scene.overrideMaterial = previous;
            }
          }),
        );
      } else if (isDrawable(draw.object) && draw.material !== null) {
        const quad = standIn(draw.object, draw.material);
        quad.onBeforeRender = () => {};
        quad.onAfterRender = () => {};
        jobs.push(() => withTarget(draw.target, () => options.renderer.render?.(quad, draw.camera)));
      }
    }
    heldToDraw = [];
    return jobs;
  };

  /** Jobs for what the held frame drew outside the scene's own materials: post passes, overrides. */
  const heldJobs = (objects: readonly Object3D[]): LinkJob[] => {
    const jobs: LinkJob[] = [];
    for (const draw of options.takeHeldDraws?.() ?? []) {
      if (draw.object === options.scene && draw.override === null) continue;
      const override = draw.override as { uuid?: string; version?: number } | null;
      const own = isDrawable(draw.object) ? materialVersions(draw.material) : "";
      const key = `${draw.object.uuid}|${own}|${override?.uuid ?? ""}:${override?.version ?? ""}|${draw.target === null ? "canvas" : "target"}`;
      if (drawsWarmed.has(key)) continue;
      drawsWarmed.add(key);
      heldToDraw.push(draw);
      if (override !== null && draw.object === options.scene) {
        const proxies = objects.filter(isDrawable).map((object) => standIn(object, override));
        jobs.push(() => withTarget(draw.target, () => options.renderer.compile(standInGroup(proxies), draw.camera, options.scene)));
      } else if (isDrawable(draw.object) && draw.material !== null) {
        // A quad is linked with the material it held at the call, not whatever it holds now.
        const quad = standIn(draw.object, draw.material);
        jobs.push(() => withTarget(draw.target, () => options.renderer.compile(quad, draw.camera)));
      } else {
        jobs.push(() => withTarget(draw.target, () => options.renderer.compile(draw.object, draw.camera)));
      }
    }
    return jobs;
  };

  /**
   * One covered round: link what the first frame reaches, then what the frame loop drew outside
   * the scene, then everything else mounted, a batch per flush, and wait for the links off the
   * frame. The rest is covered too: a menu camera that pans, or a pooled effect that turns on,
   * would otherwise link it mid-frame with the menu up.
   */
  const round = async (deadline: number): Promise<"ok" | "error"> => {
    runPreparers(options.scene);
    const plan = planFirstFrame(options.scene, options.camera);
    publish({ planned: plan.reachable, deferred: plan.deferred, programs: programs() });
    const before = programs();
    const known = programSet();
    const context = readContext();
    const objects = [...plan.objects];
    const rest: Object3D[] = [];
    options.scene.traverse((object) => {
      if (isDrawable(object) && !plan.objects.has(object)) rest.push(object);
    });
    const firstFrame = [...sceneJobs(objects, context), ...shadowJobs(objects, context), ...heldJobs(objects)];
    const later = [...sceneJobs(rest, context), ...shadowJobs(rest, context)];
    const jobs = [...firstFrame, ...later];
    markTimeline("jg:warmup:round", { firstFrame: firstFrame.length, later: later.length, programs: before });
    // A round with nothing new still compiles once, so a renderer that refuses fails the warmup.
    if (jobs.length === 0) jobs.push(() => withFrameTarget(() => compileSubset(options.renderer, options.scene, options.camera, () => false)));
    if (!(await runJobs(jobs, () => cancelled || now() >= deadline))) return "error";
    const floor = now() + SHADER_WARMUP_DEFAULTS.planFloorMs;
    const settled = await settle(known, Math.max(deadline, floor));
    // Linked is not finished everywhere: draw each program once while still covered. Not while a
    // program is still building, though: its draw would hold the thread until the driver is done.
    const draws = settled ? drawJobs([...objects, ...rest], context) : [];
    markTimeline("jg:warmup:draws", { draws: draws.length });
    if (!(await runJobs(draws, () => cancelled || now() >= deadline, true))) return "error";
    publish({ rounds: state.rounds + 1, programs: programs() });
    return "ok";
  };

  /** Link content that has no program yet, a batch per flush, without waiting on the links. */
  const queueBackground = async (): Promise<void> => {
    const drawables: Object3D[] = [];
    options.scene.traverse((object) => {
      if (isDrawable(object)) drawables.push(object);
    });
    runPreparers(options.scene);
    const context = readContext();
    await runJobs([...sceneJobs(drawables, context), ...shadowJobs(drawables, context)], () => cancelled);
  };

  /** Compile later content in rounds that never block the cover or the frame in flight. */
  const background = async (): Promise<void> => {
    const until = now() + backgroundMs;
    let quietRounds = 0;
    while (!cancelled && now() < until) {
      await sleep(backgroundEveryMs);
      if (cancelled) break;
      const starts = loaderStarts();
      const before = programs();
      await queueBackground();
      const grew = programs() > before || loaderStarts() !== starts;
      quietRounds = grew ? 0 : quietRounds + 1;
      publish({ programs: programs() });
      if (quietRounds >= 2) break;
    }
  };

  /** Wait out work registered with {@link warmupWaitsFor}, bounded by the deadline. */
  const awaitHolds = async (deadline: number): Promise<void> => {
    // One microtask first: the same commit's later effects run before it, so their work is seen.
    await Promise.resolve();
    for (;;) {
      const holds = warmupHolds.get(options.scene);
      if (cancelled || holds === undefined || holds.size === 0 || now() >= deadline) return;
      await Promise.race([Promise.all([...holds]), sleep(Math.max(0, deadline - now()))]);
    }
  };

  const covered = async (): Promise<boolean> => {
    publish({ phase: "compiling" });
    const deadline = startedAt + planBudgetMs;
    await awaitHolds(deadline);
    let quietSince = now();
    let previous = programs();
    while (!cancelled) {
      if ((await round(deadline)) === "error") {
        publish({ phase: "failed" });
        return false;
      }
      const settled = programs();
      const grew = settled > previous;
      previous = settled;
      quietSince = grew ? now() : quietSince;
      if (now() >= deadline) break;
      if (!grew && now() - quietSince >= quietMs && loaderQuiet(quietMs)) break;
      await sleep(pollMs);
      if (cancelled) break;
    }
    // The reveal is the last draw boundary: everything the first frame shows has been settled
    // above, so lifting the cover draws a scene with no program left to link mid-frame.
    publish({ programs: programs(), progress: 1, phase: "ready" });
    return true;
  };

  const done = (async (): Promise<ShaderWarmupState> => {
    if (!(await covered())) {
      releaseScratch();
      return state;
    }
    void background().finally(releaseScratch);
    return state;
  })();

  return {
    done,
    state: () => state,
    cancel: () => {
      cancelled = true;
      releaseScratch();
    },
  };
}
