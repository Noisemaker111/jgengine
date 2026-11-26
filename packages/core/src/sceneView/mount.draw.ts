// @skill jgengine-world
import {
  buildBoxMesh,
  buildCylinderMesh,
  buildOctahedronMesh,
  buildSphereMesh,
  buildViewProjMatrix,
  computeFlatNormals,
  computeMeshEdges,
  diffSceneView,
  frameSceneView,
  MARKER_SIZE,
  orbitSceneView,
  panSceneView,
  parseHexLinear,
  parseHexSrgb,
  sceneViewBounds,
  sceneViewEye,
  sceneViewKinds,
  sceneViewObjects,
  zoomSceneView,
  type SceneViewCamera,
  type SceneViewDocument,
  type SceneViewLinePart,
  type SceneViewMeshPart,
  type SceneViewNode,
  type SceneViewObject,
  type SceneViewPart,
  type SceneViewVec3,
} from "./sceneView";

/** Helpers a kind's draw function uses to build lit meshes and unlit lines without three.js. */
export interface SceneViewKindContext {
  /** Builds a lit triangle mesh from flat xyz vertex positions; flat face normals are computed when omitted. */
  mesh(
    positions: ArrayLike<number>,
    color: string,
    options?: {
      normals?: ArrayLike<number>;
      indices?: Uint16Array | Uint32Array;
      position?: SceneViewVec3;
      rotationY?: number;
    },
  ): SceneViewMeshPart;
  /** Builds sharp crease and boundary line segments from flat xyz triangle positions. */
  edges(positions: ArrayLike<number>, color: string, thresholdDegrees?: number): SceneViewLinePart;
  /** Builds an unlit polyline through `points`. */
  line(points: readonly SceneViewVec3[], color: string): SceneViewLinePart;
  /** Builds a lit box centered at the origin. */
  box(width: number, height: number, depth: number, color: string): SceneViewMeshPart;
}

/** How one kind draws: the node of mesh and line parts for one document object of that kind. */
export interface SceneViewKind {
  draw(object: SceneViewObject, context: SceneViewKindContext): SceneViewNode;
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

/** Minimal WebGL2 renderer handle exposed by {@link SceneView} for instrumentation and context access. */
export interface SceneViewRenderer {
  render(): void;
  getContext(): WebGL2RenderingContext;
}

/** A mounted viewer. It draws only when something changes, and never between changes. */
export interface SceneView {
  /** Shows `document`: objects whose value is a new reference are redrawn, the rest stay as they are. Resolves after the frame that shows it. */
  update(document: SceneViewDocument): Promise<void>;
  /** The camera now. */
  camera(): SceneViewCamera;
  /** Moves the camera and draws one frame. */
  setCamera(camera: SceneViewCamera): void;
  /** The drawn node for a document object id, for picking and inspection. */
  objectOf(id: string): SceneViewNode | undefined;
  /** Asks for one frame. Several asks before it runs still draw once. */
  invalidate(): void;
  /** Frames drawn since mount; a still scene adds none. */
  readonly frames: number;
  /** Resolves after the first frame that shows the mounted document. */
  readonly ready: Promise<void>;
  readonly renderer: SceneViewRenderer;
  /** Stops input, frees every GPU buffer, program and the GL context. */
  dispose(): void;
}

const DEFAULT_COLOR = "#b9b4aa";

function colorOf(object: SceneViewObject): string {
  const meta = object.value.meta?.["color"];
  return object.value.color ?? (typeof meta === "string" ? meta : DEFAULT_COLOR);
}

const CONTEXT: SceneViewKindContext = {
  mesh(positions, color, options) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const normals = options?.normals === undefined
      ? computeFlatNormals(pos)
      : options.normals instanceof Float32Array ? options.normals : new Float32Array(options.normals);
    return {
      type: "mesh",
      positions: pos,
      normals,
      ...(options?.indices === undefined ? {} : { indices: options.indices }),
      color,
      ...(options?.position === undefined ? {} : { position: options.position }),
      ...(options?.rotationY === undefined ? {} : { rotationY: options.rotationY }),
    };
  },
  edges(positions, color, thresholdDegrees = 1) {
    return { type: "lines", positions: computeMeshEdges(positions, thresholdDegrees), color };
  },
  line(points, color) {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }
    return { type: "line-strip", positions, color };
  },
  box: buildBoxMesh,
};

/** Draws a document object by its shape: a volume's box, sphere or cylinder, a path's line, a marker's small diamond. */
function drawByShape(object: SceneViewObject, context: SceneViewKindContext): SceneViewNode {
  const color = colorOf(object);
  if (object.type === "path") {
    return { parts: [context.line(object.value.points, color)] };
  }
  if (object.type === "marker") {
    const size = object.value.meta?.["size"];
    return {
      position: object.value.position,
      ...(object.value.rotationY === undefined ? {} : { rotationY: object.value.rotationY }),
      parts: [buildOctahedronMesh(typeof size === "number" ? size : MARKER_SIZE, color)],
    };
  }
  const volume = object.value;
  const radius = volume.radius ?? 0.5;
  const part =
    volume.shape === "sphere" ? buildSphereMesh(radius, color, 24, 16)
    : volume.shape === "cylinder" ? buildCylinderMesh(radius, volume.height ?? radius * 2, color, 24)
    : buildBoxMesh((volume.halfExtents?.x ?? 0.5) * 2, (volume.halfExtents?.y ?? 0.5) * 2, (volume.halfExtents?.z ?? 0.5) * 2, color);
  return { position: volume.center, parts: [part] };
}

const SHAPE_KIND: SceneViewKind = { draw: drawByShape };

// Matches three.js MeshStandardMaterial(roughness: 0.85) + HemisphereLight(#fff, #8d8778, 1.6) + DirectionalLight(#fff, 1.8).
const MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform vec2 uRotY;
out vec3 vNorm;
out vec3 vWorld;
void main() {
  vec3 p = vec3(aPos.x * uRotY.x + aPos.z * uRotY.y, aPos.y, -aPos.x * uRotY.y + aPos.z * uRotY.x) + uOffset;
  vWorld = p;
  vNorm = vec3(aNorm.x * uRotY.x + aNorm.z * uRotY.y, aNorm.y, -aNorm.x * uRotY.y + aNorm.z * uRotY.x);
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vNorm;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uEye;
out vec4 fragColor;
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uEye - vWorld);
  vec3 L = normalize(vec3(0.6, 1.0, 0.35));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  vec3 sky = vec3(1.0);
  vec3 ground = vec3(0.266, 0.242, 0.188);
  vec3 hemi = mix(ground, sky, clamp(0.5 * N.y + 0.5, 0.0, 1.0)) * (1.6 / 3.14159265);
  vec3 diff = uColor * (hemi + vec3(1.8 / 3.14159265) * ndl);
  // Subtle GGX-like dielectric highlight matching roughness 0.85, F0 = 0.04.
  float a2 = 0.52200625;
  float denom = ndh * ndh * (a2 - 1.0) + 1.0;
  float spec = (a2 / (3.14159265 * denom * denom)) * 0.04 * 1.8 * ndl;
  fragColor = vec4(linearToSrgb(min(diff + vec3(spec), vec3(1.0))), 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform vec2 uRotY;
void main() {
  vec3 p = vec3(aPos.x * uRotY.x + aPos.z * uRotY.y, aPos.y, -aPos.x * uRotY.y + aPos.z * uRotY.x) + uOffset;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error("sceneView: failed to allocate WebGL2 shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`sceneView: shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("sceneView: failed to allocate WebGL2 program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`sceneView: program link failed: ${info}`);
  }
  return program;
}

interface GpuPart {
  readonly kind: "mesh" | "lines" | "line-strip";
  readonly vao: WebGLVertexArrayObject;
  readonly buffers: readonly WebGLBuffer[];
  readonly count: number;
  readonly indexType: number;
  readonly color: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly rotY: readonly [number, number];
}

interface DrawnEntry {
  readonly node: SceneViewNode;
  readonly parts: readonly GpuPart[];
}

function uploadPart(gl: WebGL2RenderingContext, node: SceneViewNode, part: SceneViewPart): GpuPart {
  const vao = gl.createVertexArray();
  const posBuf = gl.createBuffer();
  if (vao === null || posBuf === null) throw new Error("sceneView: failed to allocate WebGL2 buffers");
  const buffers: WebGLBuffer[] = [posBuf];
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  let count = Math.floor(part.positions.length / 3);
  let indexType = 0;
  if (part.type === "mesh") {
    const normBuf = gl.createBuffer();
    if (normBuf === null) throw new Error("sceneView: failed to allocate normal buffer");
    buffers.push(normBuf);
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    if (part.indices !== undefined) {
      const idxBuf = gl.createBuffer();
      if (idxBuf === null) throw new Error("sceneView: failed to allocate index buffer");
      buffers.push(idxBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
      count = part.indices.length;
      indexType = part.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    }
  }
  gl.bindVertexArray(null);

  const ox = (node.position?.x ?? 0) + (part.position?.x ?? 0);
  const oy = (node.position?.y ?? 0) + (part.position?.y ?? 0);
  const oz = (node.position?.z ?? 0) + (part.position?.z ?? 0);
  const angle = (node.rotationY ?? 0) + (part.rotationY ?? 0);
  const color = part.type === "mesh" ? parseHexLinear(part.color) : parseHexSrgb(part.color);
  return {
    kind: part.type,
    vao,
    buffers,
    count,
    indexType,
    color,
    offset: [ox, oy, oz],
    rotY: [Math.cos(angle), Math.sin(angle)],
  };
}

function disposeEntry(gl: WebGL2RenderingContext, entry: DrawnEntry): void {
  for (const part of entry.parts) {
    gl.deleteVertexArray(part.vao);
    for (const buf of part.buffers) gl.deleteBuffer(buf);
  }
}

/**
 * Draws a scene document on `canvas` with a tiny WebGL2 backend and no three.js or UI framework:
 * no JSX runtime, no frame loop. It draws once when the document, the camera or the canvas size
 * changes and sits idle otherwise, so a still scene costs a phone nothing. Each kind's drawing
 * loads only when the document uses it (`options.kinds`); every other object draws by its shape.
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
  const pixelRatio = options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2);
  // A canvas no stylesheet sizes takes its layout size from its drawing buffer, so a 2x buffer
  // would double its layout, and the next resize would double it again. Pin its size in CSS once.
  if (canvas.style.width === "" && canvas.style.height === "" && canvas.clientWidth === canvas.width && canvas.clientHeight === canvas.height) {
    canvas.style.width = `${canvas.clientWidth}px`;
    canvas.style.height = `${canvas.clientHeight}px`;
  }

  const context = canvas.getContext("webgl2", { antialias: true, powerPreference: "low-power" });
  if (context === null) throw new Error("sceneView: WebGL2 context is not available");
  const gl: WebGL2RenderingContext = context;

  const meshProg = createProgram(gl, MESH_VS, MESH_FS);
  const lineProg = createProgram(gl, LINE_VS, LINE_FS);
  const meshU = {
    viewProj: gl.getUniformLocation(meshProg, "uViewProj"),
    offset: gl.getUniformLocation(meshProg, "uOffset"),
    rotY: gl.getUniformLocation(meshProg, "uRotY"),
    color: gl.getUniformLocation(meshProg, "uColor"),
    eye: gl.getUniformLocation(meshProg, "uEye"),
  };
  const lineU = {
    viewProj: gl.getUniformLocation(lineProg, "uViewProj"),
    offset: gl.getUniformLocation(lineProg, "uOffset"),
    rotY: gl.getUniformLocation(lineProg, "uRotY"),
    color: gl.getUniformLocation(lineProg, "uColor"),
  };

  const [bgR, bgG, bgB] = parseHexSrgb(options.background ?? "#f4f4f2");
  gl.clearColor(bgR, bgG, bgB, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);

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
  const drawn = new Map<string, DrawnEntry>();
  let camera: SceneViewCamera | undefined = options.camera;
  let width = 0;
  let height = 0;
  let frames = 0;
  let frameRequest = 0;
  let disposed = false;
  let version = 0;

  /** The framing camera until the first document draws; a still-empty scene never fixes it. */
  function currentCamera(): SceneViewCamera {
    if (camera !== undefined) return camera;
    const framed = frameSceneView(sceneViewBounds(objects.values()), fov, width / Math.max(1, height));
    if (objects.size > 0) camera = framed;
    return framed;
  }

  function resize(): boolean {
    const nextWidth = Math.max(1, canvas.clientWidth || canvas.width);
    const nextHeight = Math.max(1, canvas.clientHeight || canvas.height);
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    return true;
  }

  function renderNow(): void {
    const shown = currentCamera();
    const eye = sceneViewEye(shown);
    const viewProj = buildViewProjMatrix(eye, shown.target, fov, width / Math.max(1, height), 0.05, 2e5);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let meshBound = false;
    for (const entry of drawn.values()) {
      for (const part of entry.parts) {
        if (part.kind !== "mesh" || part.count === 0) continue;
        if (!meshBound) {
          gl.useProgram(meshProg);
          gl.uniformMatrix4fv(meshU.viewProj, false, viewProj);
          gl.uniform3f(meshU.eye, eye.x, eye.y, eye.z);
          meshBound = true;
        }
        gl.uniform3f(meshU.offset, part.offset[0], part.offset[1], part.offset[2]);
        gl.uniform2f(meshU.rotY, part.rotY[0], part.rotY[1]);
        gl.uniform3f(meshU.color, part.color[0], part.color[1], part.color[2]);
        gl.bindVertexArray(part.vao);
        if (part.indexType !== 0) gl.drawElements(gl.TRIANGLES, part.count, part.indexType, 0);
        else gl.drawArrays(gl.TRIANGLES, 0, part.count);
      }
    }

    let lineBound = false;
    for (const entry of drawn.values()) {
      for (const part of entry.parts) {
        if (part.kind === "mesh" || part.count === 0) continue;
        if (!lineBound) {
          gl.useProgram(lineProg);
          gl.uniformMatrix4fv(lineU.viewProj, false, viewProj);
          lineBound = true;
        }
        gl.uniform3f(lineU.offset, part.offset[0], part.offset[1], part.offset[2]);
        gl.uniform2f(lineU.rotY, part.rotY[0], part.rotY[1]);
        gl.uniform3f(lineU.color, part.color[0], part.color[1], part.color[2]);
        gl.bindVertexArray(part.vao);
        gl.drawArrays(part.kind === "line-strip" ? gl.LINE_STRIP : gl.LINES, 0, part.count);
      }
    }
    gl.bindVertexArray(null);
  }

  const renderer: SceneViewRenderer = {
    render: renderNow,
    getContext: () => gl,
  };

  function drawFrame(): void {
    frameRequest = 0;
    if (disposed) return;
    resize();
    renderer.render();
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
      const entry = drawn.get(id);
      if (entry === undefined) continue;
      disposeEntry(gl, entry);
      drawn.delete(id);
    }
    for (const object of [...diff.changed, ...diff.added]) {
      const before = drawn.get(object.value.id);
      if (before !== undefined) disposeEntry(gl, before);
      const node = (loadedKinds.get(object.value.kind) ?? SHAPE_KIND).draw(object, CONTEXT);
      const parts = node.parts.map((part) => uploadPart(gl, node, part));
      drawn.set(object.value.id, { node, parts });
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
    get: currentCamera,
    set: (next) => { camera = next; invalidate(); },
    height: () => Math.max(1, height),
    fov,
  });
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { if (resize()) invalidate(); });
  observer?.observe(canvas);

  const ready = update(document);
  return {
    update,
    camera: currentCamera,
    setCamera(next) { camera = next; invalidate(); },
    objectOf: (id) => drawn.get(id)?.node,
    invalidate,
    get frames() { return frames; },
    ready,
    renderer,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      stopControls();
      observer?.disconnect();
      for (const entry of drawn.values()) disposeEntry(gl, entry);
      drawn.clear();
      gl.deleteProgram(meshProg);
      gl.deleteProgram(lineProg);
      // Browsers cap live WebGL contexts; let this one go now rather than at garbage collection.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
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
