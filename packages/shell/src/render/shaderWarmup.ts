import { Frustum, Matrix4, Sphere, Vector3, type BufferGeometry, type Camera, type Object3D } from "three";

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
  elapsedMs: number;
}

/** The renderer surface the warmup needs; a real `WebGLRenderer` satisfies it. */
export interface ShaderWarmupRenderer {
  /** Links every mounted material's program; returns the materials it prepared. */
  compile(scene: Object3D, camera: Camera): unknown;
  /** Renderer program list; each entry answers `isReady()` once the driver finishes its link. */
  readonly info?: { readonly programs?: readonly unknown[] | null };
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

/** Knobs for {@link planFirstFrame}; the defaults are what a normal load wants. */
export interface FirstFramePlanOptions {
  /** Bounding-sphere growth for the view test, so a prop just offscreen stays in the plan. */
  viewMargin?: number;
}

/** Which drawables the first frame can reach, so the cover waits for those and no others. */
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

/** Defaults sized to cover one load: the covered wait is the driver's link time, not a guess. */
export const SHADER_WARMUP_DEFAULTS = {
  /** Loader and program quiet time before the first frame is shown. */
  quietMs: 250,
  /** Wall-clock cap on the covered wait. The reveal happens at it either way. */
  planBudgetMs: 12_000,
  /** Floor for one wait, so a driver that never reports completion cannot stall load. */
  planFloorMs: 1_500,
  /** How often the covered loop looks for content that streamed in while it waited. */
  pollMs: 100,
  /** How long the background compile keeps looking for content that landed after the reveal. */
  backgroundMs: 2_000,
  /** Gap between background rounds. A round only queues links; it does not wait on the driver. */
  backgroundEveryMs: 250,
} as const;

/** Options for {@link createShaderWarmup}; the clock, sleep and loader signal are injectable for tests. */
export interface ShaderWarmupOptions {
  renderer: ShaderWarmupRenderer;
  scene: Object3D;
  camera: Camera;
  quietMs?: number;
  planBudgetMs?: number;
  pollMs?: number;
  backgroundMs?: number;
  backgroundEveryMs?: number;
  /** Called on every state change, so the loading screen can show the phase. */
  onState?: (state: ShaderWarmupState) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Whether the shared model loader has been quiet long enough. */
  loaderQuiet?: (quietMs: number) => boolean;
  /** Changes whenever the shared loader starts a new burst of model loads. */
  loaderStarts?: () => number;
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
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const loaderQuiet = options.loaderQuiet ?? ((quiet: number) => modelLoadIdleMs() >= quiet);
  const loaderStarts = options.loaderStarts ?? modelLoadStarts;
  const startedAt = now();
  let state: ShaderWarmupState = { phase: "waiting", rounds: 0, programs: 0, planned: 0, deferred: 0, elapsedMs: 0 };
  let cancelled = false;

  const programs = (): number => options.renderer.info?.programs?.length ?? 0;

  const publish = (next: Partial<ShaderWarmupState>): void => {
    state = { ...state, ...next, elapsedMs: Math.round(now() - startedAt) };
    options.onState?.(state);
  };

  /** Wait for the programs a round created, polling readiness so the thread stays free to mount. */
  const settle = async (from: number, deadline: number): Promise<boolean> => {
    let polls = 0;
    for (;;) {
      if (cancelled) return false;
      const created = options.renderer.info?.programs?.slice(from) ?? [];
      if (created.every(programReady)) return true;
      if (now() >= deadline) return false;
      if (polls++ % 20 === 0) publish({ programs: programs() });
      await sleep(10);
    }
  };

  /** One covered round: plan the reachable set, queue its links, wait for them off the frame. */
  const round = async (deadline: number): Promise<"ok" | "error"> => {
    const plan = planFirstFrame(options.scene, options.camera);
    publish({ planned: plan.reachable, deferred: plan.deferred, programs: programs() });
    const before = programs();
    try {
      compileSubset(options.renderer, options.scene, options.camera, (object) => plan.objects.has(object));
    } catch {
      return "error";
    }
    publish({ rounds: state.rounds + 1, programs: programs() });
    const floor = now() + SHADER_WARMUP_DEFAULTS.planFloorMs;
    await settle(before, Math.max(deadline, floor));
    return "ok";
  };

  /** Queue links for content that has no program yet, without waiting on the driver. */
  const queueBackground = (): void => {
    try {
      options.renderer.compile(options.scene, options.camera);
    } catch {
      /* a background round is an optimisation; the first frame is already showing */
    }
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
      queueBackground();
      const grew = programs() > before || loaderStarts() !== starts;
      quietRounds = grew ? 0 : quietRounds + 1;
      publish({ programs: programs() });
      if (quietRounds >= 2) break;
    }
  };

  const covered = async (): Promise<boolean> => {
    publish({ phase: "compiling" });
    const deadline = startedAt + planBudgetMs;
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
    publish({ programs: programs(), phase: "ready" });
    return true;
  };

  const done = (async (): Promise<ShaderWarmupState> => {
    if (!(await covered())) return state;
    void background();
    return state;
  })();

  return {
    done,
    state: () => state,
    cancel: () => {
      cancelled = true;
    },
  };
}
