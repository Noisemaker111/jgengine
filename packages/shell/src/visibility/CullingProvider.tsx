import { createContext, useContext, useMemo, useRef, type ReactNode, type MutableRefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVisibilitySystem, type Renderable, type VisibilitySystem } from "@jgengine/core/visibility/visibilitySystem";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import type { BoundsSpec, Vec3 } from "@jgengine/core/visibility/bounds";
import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";

type VisiblePredicate = (id: string) => boolean;

const ALWAYS_VISIBLE: VisiblePredicate = () => true;
const alwaysVisibleRef: MutableRefObject<VisiblePredicate> = { current: ALWAYS_VISIBLE };

const CullingContext = createContext<MutableRefObject<VisiblePredicate> | null>(null);

/**
 * Read the current render-visibility predicate. Backward compatible: with no CullingProvider
 * mounted (or culling disabled) it returns an always-visible ref, so a marker that consults it
 * behaves exactly as before this feature existed.
 */
export function useRenderVisibility(): MutableRefObject<VisiblePredicate> {
  return useContext(CullingContext) ?? alwaysVisibleRef;
}

interface MutableRenderable {
  id: string;
  position: Vec3;
  version: number;
  bounds?: BoundsSpec;
  overrides?: Renderable["overrides"];
  layer?: string;
}

interface VersionEntry {
  x: number;
  y: number;
  z: number;
  rot: number;
  version: number;
}

const ENTITY_BOUNDS: BoundsSpec = { kind: "sphere", radius: 2, offset: [0, 1, 0] };

function objectRadius(scale: number | readonly [number, number, number] | undefined): number {
  if (scale === undefined) return 1;
  const s = typeof scale === "number" ? scale : Math.max(scale[0], scale[1], scale[2]);
  return Math.max(0.75, s);
}

function buildSystem(ctx: GameContext, config: VisibilityConfig | undefined): { system: VisibilitySystem; setView: (view: CameraView | null) => void } {
  const versions = new Map<string, VersionEntry>();
  let currentView: CameraView | null = null;
  const scratch: MutableRenderable = { id: "", position: [0, 0, 0], version: 0 };
  const objectSpec: { kind: "sphere"; radius: number; offset?: Vec3 } = { kind: "sphere", radius: 1, offset: [0, 0.5, 0] };

  function bump(id: string, position: Vec3, rot: number): number {
    const prev = versions.get(id);
    if (prev !== undefined && prev.x === position[0] && prev.y === position[1] && prev.z === position[2] && prev.rot === rot) {
      return prev.version;
    }
    const version = (prev?.version ?? 0) + 1;
    versions.set(id, { x: position[0], y: position[1], z: position[2], rot, version });
    return version;
  }

  function* renderables(): Iterable<Renderable> {
    const entityOverrides = config?.entities;
    for (const entity of ctx.scene.entity.list()) {
      scratch.id = entity.id;
      scratch.position = entity.position;
      scratch.version = bump(entity.id, entity.position, entity.rotationY);
      scratch.bounds = ENTITY_BOUNDS;
      scratch.overrides = entityOverrides?.[entity.name];
      scratch.layer = "entity";
      yield scratch as Renderable;
    }
    const objectOverrides = config?.objects;
    for (const object of ctx.scene.object.list()) {
      scratch.id = object.instanceId;
      scratch.position = object.position;
      scratch.version = bump(object.instanceId, object.position, object.rotationY);
      objectSpec.radius = objectRadius(object.visual?.scale);
      scratch.bounds = objectSpec;
      scratch.overrides = objectOverrides?.[object.catalogId];
      scratch.layer = "object";
      yield scratch as Renderable;
    }
  }

  const cameras = (): readonly CameraVisibilityContext[] => (currentView === null ? EMPTY_CAMERAS : [{ id: "main", view: currentView }]);
  const options = {
    renderables,
    cameras,
    ...(config?.culling !== undefined ? { settings: config.culling } : {}),
    ...(config?.scene !== undefined ? { sceneOverrides: config.scene } : {}),
  };
  const system = createVisibilitySystem(options);
  return {
    system,
    setView(view) {
      currentView = view;
    },
  };
}

const EMPTY_CAMERAS: readonly CameraVisibilityContext[] = [];
const tmpDir = new THREE.Vector3();

function viewFromCamera(camera: THREE.Camera): CameraView | null {
  camera.getWorldDirection(tmpDir);
  const p = camera.position;
  const position: Vec3 = [p.x, p.y, p.z];
  const target: Vec3 = [p.x + tmpDir.x, p.y + tmpDir.y, p.z + tmpDir.z];
  const up: Vec3 = [camera.up.x, camera.up.y, camera.up.z];
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const c = camera as THREE.PerspectiveCamera;
    return { kind: "perspective", position, target, up, fovDeg: c.fov, aspect: c.aspect, near: c.near, far: c.far };
  }
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const c = camera as THREE.OrthographicCamera;
    const zoom = c.zoom || 1;
    return {
      kind: "orthographic",
      position,
      target,
      up,
      halfWidth: Math.abs((c.right - c.left) / 2 / zoom),
      halfHeight: Math.abs((c.top - c.bottom) / 2 / zoom),
      near: c.near,
      far: c.far,
    };
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
export function CullingProvider({ config, children }: { config: VisibilityConfig | undefined; children: ReactNode }): ReactNode {
  const ctx = useGameContext();
  const enabled = config?.enabled !== false;
  const predicateRef = useRef<VisiblePredicate>(ALWAYS_VISIBLE);
  const camera = useThree((state) => state.camera);
  const driver = useMemo(() => (enabled ? buildSystem(ctx, config) : null), [ctx, config, enabled]);

  useFrame(() => {
    if (driver === null) {
      predicateRef.current = ALWAYS_VISIBLE;
      return;
    }
    const view = viewFromCamera(camera);
    if (view === null) {
      predicateRef.current = ALWAYS_VISIBLE;
      return;
    }
    driver.setView(view);
    const visible = driver.system.update().visible;
    predicateRef.current = (id) => visible.has(id);
  }, CAMERA_POST_FRAME_PRIORITY);

  return <CullingContext.Provider value={predicateRef}>{children}</CullingContext.Provider>;
}
