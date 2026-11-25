// @skill jgengine-world
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";

import {
  diffSceneView,
  frameSceneView,
  orbitSceneView,
  panSceneView,
  sceneViewBounds,
  sceneViewEye,
  sceneViewKinds,
  sceneViewObjects,
  zoomSceneView,
  type SceneViewCamera,
  type SceneViewDocument,
  type SceneViewObject,
} from "./sceneView";

/** What a kind's draw module gets besides the object: shared materials, so equal colors share one. */
export interface SceneViewKindContext {
  /** A lit surface material of `color`, shared by every object that asks for the same color. */
  surface(color: string): MeshStandardMaterial;
  /** A line material of `color`, shared the same way. */
  line(color: string): LineBasicMaterial;
}

/** How one kind draws: the three.js object for one document object of that kind. */
export interface SceneViewKind {
  draw(object: SceneViewObject, context: SceneViewKindContext): Object3D;
}

/**
 * Loads a kind's draw module. Write it as `() => import("./roof.draw")`, so the module is its own
 * chunk and a document that never uses the kind never downloads it.
 */
export type SceneViewKindLoader = () => Promise<SceneViewKind | { default: SceneViewKind }>;

/** Options for {@link mountSceneView}. */
export interface SceneViewOptions {
  /** Draw modules for app or engine kinds, loaded the first time a document uses the kind. Other kinds draw by shape. */
  kinds?: Readonly<Record<string, SceneViewKindLoader>>;
  /** Start here instead of framing the document. */
  camera?: SceneViewCamera;
  /** Drag to turn, pinch or wheel to zoom, two fingers or right-drag to pan. Default true. */
  controls?: boolean;
  /** Clear color. Default `#f4f4f2`. */
  background?: string;
  /** Default `min(devicePixelRatio, 2)`. */
  pixelRatio?: number;
  /** Vertical field of view in degrees. Default 45. */
  fov?: number;
  /** Called after each frame with the frames drawn so far: move labels that follow the scene here. */
  onDraw?: (frames: number) => void;
}

/** A mounted viewer. It draws only when something changes, and never between changes. */
export interface SceneView {
  /** Shows `document`: objects whose value is a new reference are redrawn, the rest stay as they are. Resolves after the frame that shows it. */
  update(document: SceneViewDocument): Promise<void>;
  /** The camera now. */
  camera(): SceneViewCamera;
  /** Moves the camera and draws one frame. */
  setCamera(camera: SceneViewCamera): void;
  /** The three.js object drawn for a document object id, for picking and highlights. */
  objectOf(id: string): Object3D | undefined;
  /** Asks for one frame. Several asks before it runs still draw once. */
  invalidate(): void;
  /** Frames drawn since mount; a still scene adds none. */
  readonly frames: number;
  /** Resolves after the first frame that shows the mounted document. */
  readonly ready: Promise<void>;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  /** Stops input, frees every geometry, material and the GL context. */
  dispose(): void;
}

const DEFAULT_COLOR = "#b9b4aa";

function colorOf(object: SceneViewObject): string {
  const meta = object.value.meta?.["color"];
  return object.value.color ?? (typeof meta === "string" ? meta : DEFAULT_COLOR);
}

/** Draws a document object by its shape: a volume's box, sphere or cylinder, a path's line, a marker's small diamond. */
function drawByShape(object: SceneViewObject, context: SceneViewKindContext): Object3D {
  const color = colorOf(object);
  if (object.type === "path") {
    const positions: number[] = [];
    for (const point of object.value.points) positions.push(point.x, point.y, point.z);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return new Line(geometry, context.line(color));
  }
  if (object.type === "marker") {
    const size = object.value.meta?.["size"];
    const mesh = new Mesh(new OctahedronGeometry(typeof size === "number" ? size : 0.15), context.surface(color));
    mesh.position.set(object.value.position.x, object.value.position.y, object.value.position.z);
    mesh.rotation.y = object.value.rotationY ?? 0;
    return mesh;
  }
  const volume = object.value;
  const radius = volume.radius ?? 0.5;
  const geometry =
    volume.shape === "sphere" ? new SphereGeometry(radius, 24, 16)
    : volume.shape === "cylinder" ? new CylinderGeometry(radius, radius, volume.height ?? radius * 2, 24)
    : new BoxGeometry((volume.halfExtents?.x ?? 0.5) * 2, (volume.halfExtents?.y ?? 0.5) * 2, (volume.halfExtents?.z ?? 0.5) * 2);
  const mesh = new Mesh(geometry, context.surface(color));
  mesh.position.set(volume.center.x, volume.center.y, volume.center.z);
  return mesh;
}

const SHAPE_KIND: SceneViewKind = { draw: drawByShape };

function disposeObject(root: Object3D, shared: ReadonlySet<Material>): void {
  root.traverse((node) => {
    const drawn = node as Partial<Mesh>;
    drawn.geometry?.dispose();
    const materials = drawn.material === undefined ? [] : Array.isArray(drawn.material) ? drawn.material : [drawn.material];
    for (const material of materials) if (!shared.has(material)) material.dispose();
  });
}

/**
 * Draws a scene document on `canvas` with plain three.js and no UI framework: no JSX runtime, no
 * frame loop. It draws once when the document, the camera or the canvas size changes and sits
 * idle otherwise, so a still scene costs a phone nothing. Each kind's drawing loads only when the
 * document uses it (`options.kinds`); every other object draws by its shape.
 *
 * ```ts
 * const view = mountSceneView(canvas, document, { kinds: { roof: () => import("./roof.draw") } });
 * view.update(nextDocument); // redraws only the objects that changed
 * view.dispose();
 * ```
 * @capability scene-view draw and update a small scene document on any canvas without a UI framework or frame loop
 */
export function mountSceneView(canvas: HTMLCanvasElement, document: SceneViewDocument, options: SceneViewOptions = {}): SceneView {
  const fov = options.fov ?? 45;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2));
  const scene = new Scene();
  scene.background = new Color(options.background ?? "#f4f4f2");
  const sky = new HemisphereLight("#ffffff", "#8d8778", 1.6);
  const sun = new DirectionalLight("#ffffff", 1.8);
  sun.position.set(0.6, 1, 0.35);
  scene.add(sky, sun);
  const view3 = new PerspectiveCamera(fov, 1, 0.05, 2e5);

  const surfaces = new Map<string, MeshStandardMaterial>();
  const lines = new Map<string, LineBasicMaterial>();
  const shared = new Set<Material>();
  const context: SceneViewKindContext = {
    surface(color) {
      let material = surfaces.get(color);
      if (material === undefined) { material = new MeshStandardMaterial({ color, roughness: 0.85 }); surfaces.set(color, material); shared.add(material); }
      return material;
    },
    line(color) {
      let material = lines.get(color);
      if (material === undefined) { material = new LineBasicMaterial({ color }); lines.set(color, material); shared.add(material); }
      return material;
    },
  };

  const kindLoads = new Map<string, Promise<SceneViewKind>>();
  const loadedKinds = new Map<string, SceneViewKind>();
  function loadKinds(kinds: Iterable<string>): Promise<unknown> {
    const pending: Promise<SceneViewKind>[] = [];
    for (const kind of kinds) {
      const loader = options.kinds?.[kind];
      if (loader === undefined || loadedKinds.has(kind)) continue;
      let load = kindLoads.get(kind);
      if (load === undefined) {
        load = loader().then((module) => {
          const drawn = "default" in module ? module.default : module;
          loadedKinds.set(kind, drawn);
          return drawn;
        });
        // A failed load is retried by the next update.
        load.catch(() => kindLoads.delete(kind));
        kindLoads.set(kind, load);
      }
      pending.push(load);
    }
    return Promise.all(pending);
  }

  let objects = new Map<string, SceneViewObject>();
  const drawn = new Map<string, Object3D>();
  let camera: SceneViewCamera | undefined = options.camera;
  let width = 0;
  let height = 0;
  let frames = 0;
  let frameRequest = 0;
  let disposed = false;
  let version = 0;

  function resize(): boolean {
    const nextWidth = Math.max(1, canvas.clientWidth || canvas.width);
    const nextHeight = Math.max(1, canvas.clientHeight || canvas.height);
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    view3.aspect = width / height;
    view3.updateProjectionMatrix();
    return true;
  }

  function drawFrame(): void {
    frameRequest = 0;
    if (disposed) return;
    resize();
    camera ??= frameSceneView(sceneViewBounds(objects.values()), fov, width / height);
    const eye = sceneViewEye(camera);
    view3.position.set(eye.x, eye.y, eye.z);
    view3.lookAt(camera.target.x, camera.target.y, camera.target.z);
    renderer.render(scene, view3);
    frames += 1;
    options.onDraw?.(frames);
  }

  function invalidate(): void {
    if (disposed || frameRequest !== 0) return;
    frameRequest = requestAnimationFrame(drawFrame);
  }

  function apply(next: Map<string, SceneViewObject>): void {
    const diff = diffSceneView(objects, next);
    for (const id of diff.removed) {
      const object = drawn.get(id);
      if (object === undefined) continue;
      scene.remove(object);
      disposeObject(object, shared);
      drawn.delete(id);
    }
    for (const object of [...diff.changed, ...diff.added]) {
      const before = drawn.get(object.value.id);
      if (before !== undefined) { scene.remove(before); disposeObject(before, shared); }
      const made = (loadedKinds.get(object.value.kind) ?? SHAPE_KIND).draw(object, context);
      made.userData["sceneViewId"] = object.value.id;
      drawn.set(object.value.id, made);
      scene.add(made);
    }
    objects = next;
  }

  async function update(nextDocument: SceneViewDocument): Promise<void> {
    const mine = ++version;
    const next = sceneViewObjects(nextDocument);
    await loadKinds(sceneViewKinds(next.values()));
    // A newer update already showed a later document.
    if (disposed || mine !== version) return;
    apply(next);
    // A document change draws now rather than on the next animation frame: the first frame is a
    // phone's slowest wait, and an edit should show in the same task that made it.
    if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
    drawFrame();
  }

  const stopControls = options.controls === false ? () => undefined : attachControls(canvas, {
    get: () => camera ?? frameSceneView(sceneViewBounds(objects.values()), fov, width / Math.max(1, height)),
    set: (next) => { camera = next; invalidate(); },
    height: () => Math.max(1, height),
    fov,
  });
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { if (resize()) invalidate(); });
  observer?.observe(canvas);

  const ready = update(document);
  return {
    update,
    camera: () => camera ?? frameSceneView(sceneViewBounds(objects.values()), fov, width / Math.max(1, height)),
    setCamera(next) { camera = next; invalidate(); },
    objectOf: (id) => drawn.get(id),
    invalidate,
    get frames() { return frames; },
    ready,
    renderer,
    scene,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      stopControls();
      observer?.disconnect();
      for (const object of drawn.values()) disposeObject(object, shared);
      drawn.clear();
      for (const material of shared) material.dispose();
      renderer.dispose();
    },
  };
}

interface ControlTarget {
  get(): SceneViewCamera;
  set(camera: SceneViewCamera): void;
  height(): number;
  fov: number;
}

/** Pointer controls: one finger or left-drag turns, two fingers pinch and pan, right-drag pans, wheel zooms. */
function attachControls(canvas: HTMLCanvasElement, target: ControlTarget): () => void {
  const pointers = new Map<number, { x: number; y: number; button: number }>();
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const point of pointers.values()) { x += point.x; y += point.y; }
    return { x: x / pointers.size, y: y / pointers.size };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };
  const down = (event: PointerEvent) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
  };
  const move = (event: PointerEvent) => {
    const point = pointers.get(event.pointerId);
    if (point === undefined) return;
    const beforeCenter = centroid();
    const beforeSpread = spread();
    point.x = event.clientX;
    point.y = event.clientY;
    const center = centroid();
    let camera = target.get();
    if (pointers.size >= 2) {
      const afterSpread = spread();
      if (beforeSpread > 0 && afterSpread > 0) camera = zoomSceneView(camera, beforeSpread / afterSpread);
      camera = panSceneView(camera, center.x - beforeCenter.x, center.y - beforeCenter.y, target.height(), target.fov);
    } else if (point.button === 2 || event.shiftKey) {
      camera = panSceneView(camera, center.x - beforeCenter.x, center.y - beforeCenter.y, target.height(), target.fov);
    } else {
      camera = orbitSceneView(camera, center.x - beforeCenter.x, center.y - beforeCenter.y, target.height());
    }
    target.set(camera);
  };
  const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    target.set(zoomSceneView(target.get(), Math.exp(event.deltaY * 0.001)));
  };
  const menu = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", menu);
  return () => {
    canvas.style.touchAction = previousTouchAction;
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("contextmenu", menu);
  };
}
