// @skill jgengine-world
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type MutableRefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameContext } from "@jgengine/react/provider";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import { buildCullingDriver } from "./cullingDriver";
import { createVisibilityChanges, type VisibilityChanges } from "./visibilityChanges";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";

type VisiblePredicate = (id: string) => boolean;

const ALWAYS_VISIBLE: VisiblePredicate = () => true;
const alwaysVisibleRef: MutableRefObject<VisiblePredicate> = { current: ALWAYS_VISIBLE };

const CullingContext = createContext<MutableRefObject<VisiblePredicate> | null>(null);

/**
 * Read the current render-visibility predicate. Backward compatible: with no CullingProvider
 * mounted (or culling disabled) it returns an always-visible ref, so a marker that consults it
 * behaves exactly as before this feature existed. The ref holds a new predicate only on a frame the
 * visible set changed, so work that depends on nothing but the set can skip while it is the same one.
 */
export function useRenderVisibility(): MutableRefObject<VisiblePredicate> {
  return useContext(CullingContext) ?? alwaysVisibleRef;
}

/** With no provider nothing is ever culled, so nothing ever changes. */
const unchanging = createVisibilityChanges();
const ChangesContext = createContext<VisibilityChanges>(unchanging);

/**
 * Call `mark` whenever one of `ids` enters or leaves the render-visible set (or the whole predicate is
 * replaced), so work that reads the predicate for those ids alone redoes it only then. `ids` should keep
 * its identity while its contents do. @internal
 */
export function useVisibilityChanges(ids: readonly string[], mark: () => void): void {
  const changes = useContext(ChangesContext);
  useEffect(() => changes.watch(ids, mark), [changes, ids, mark]);
}

const tmpDir = new THREE.Vector3();

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type PerspectiveView = Mutable<Extract<CameraView, { kind: "perspective" }>>;
type OrthographicView = Mutable<Extract<CameraView, { kind: "orthographic" }>>;

/** One provider's camera views, rewritten in place each frame: the culling core copies what it keeps. */
function createViewScratch(): { perspective: PerspectiveView; orthographic: OrthographicView } {
  return {
    perspective: { kind: "perspective", position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fovDeg: 0, aspect: 1, near: 0, far: 0 },
    orthographic: { kind: "orthographic", position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], halfWidth: 0, halfHeight: 0, near: 0, far: 0 },
  };
}

function writeAxes(view: PerspectiveView | OrthographicView, camera: THREE.Camera): void {
  camera.getWorldDirection(tmpDir);
  const p = camera.position;
  const position = view.position as [number, number, number];
  const target = view.target as [number, number, number];
  const up = view.up as [number, number, number];
  position[0] = p.x; position[1] = p.y; position[2] = p.z;
  target[0] = p.x + tmpDir.x; target[1] = p.y + tmpDir.y; target[2] = p.z + tmpDir.z;
  up[0] = camera.up.x; up[1] = camera.up.y; up[2] = camera.up.z;
}

function viewFromCamera(camera: THREE.Camera, scratch: ReturnType<typeof createViewScratch>): CameraView | null {
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const c = camera as THREE.PerspectiveCamera;
    const view = scratch.perspective;
    writeAxes(view, c);
    view.fovDeg = c.fov;
    view.aspect = c.aspect;
    view.near = c.near;
    view.far = c.far;
    return view;
  }
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const c = camera as THREE.OrthographicCamera;
    const zoom = c.zoom || 1;
    const view = scratch.orthographic;
    writeAxes(view, c);
    view.halfWidth = Math.abs((c.right - c.left) / 2 / zoom);
    view.halfHeight = Math.abs((c.top - c.bottom) / 2 / zoom);
    view.near = c.near;
    view.far = c.far;
    return view;
  }
  return null;
}

/**
 * Drives automatic frustum + distance culling for every entity and placed object. It reads the
 * live render camera each frame, updates the engine VisibilitySystem, and exposes a predicate the
 * entity/object markers consult to toggle `group.visible` — objects fully outside the view (plus a
 * conservative preload margin) are never submitted to the renderer, without unmounting them or
 * touching gameplay. UI, sky, terrain, and environment live outside this subtree and are unaffected.
 */
export function CullingProvider({ config, drawDistance, children }: { config: VisibilityConfig | undefined; drawDistance?: number; children: ReactNode }): ReactNode {
  const ctx = useGameContext();
  const enabled = config?.enabled !== false;
  const predicateRef = useRef<VisiblePredicate>(ALWAYS_VISIBLE);
  const camera = useThree((state) => state.camera);
  const resolvedConfig = useMemo(() => {
    if (drawDistance === undefined) return config;
    return { ...config, culling: { ...config?.culling, defaultMaxRenderDistance: config?.culling?.defaultMaxRenderDistance ?? drawDistance } };
  }, [config, drawDistance]);
  const driver = useMemo(() => (enabled ? buildCullingDriver(ctx, resolvedConfig) : null), [ctx, resolvedConfig, enabled]);
  useEffect(() => () => driver?.dispose(), [driver]);
  const published = useRef(-1);
  const publishedBy = useRef<object | null>(null);
  const viewScratch = useMemo(createViewScratch, []);
  const changes = useMemo(createVisibilityChanges, []);

  useFrame(() => {
    const view = driver === null ? null : viewFromCamera(camera, viewScratch);
    if (driver === null || view === null) {
      if (predicateRef.current !== ALWAYS_VISIBLE) {
        predicateRef.current = ALWAYS_VISIBLE;
        changes.notifyAll();
      }
      published.current = -1;
      publishedBy.current = null;
      return;
    }
    driver.setView(view);
    const system = driver.system;
    const result = system.update();
    if (result.generation === published.current && publishedBy.current === system) return;
    const sameSystem = publishedBy.current === system;
    published.current = result.generation;
    publishedBy.current = system;
    // Reads the system's current set, so the same predicate stays right while the set does not change.
    predicateRef.current = (id) => system.isVisible(id);
    // Against the same system only the changed ids need telling; a new system (or the always-visible
    // fallback before it) may answer differently for any id.
    if (sameSystem) changes.notify(result.changed);
    else changes.notifyAll();
  }, CAMERA_POST_FRAME_PRIORITY);

  return (
    <CullingContext.Provider value={predicateRef}>
      <ChangesContext.Provider value={changes}>{children}</ChangesContext.Provider>
    </CullingContext.Provider>
  );
}
