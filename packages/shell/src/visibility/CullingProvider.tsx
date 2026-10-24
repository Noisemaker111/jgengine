import { createContext, useContext, useMemo, useRef, type ReactNode, type MutableRefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameContext } from "@jgengine/react/provider";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import type { Vec3 } from "@jgengine/core/visibility/bounds";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { resolveInstanceCullPolicy, type InstanceCullPolicy } from "@jgengine/core/render/cullPolicy";
import { buildCullingDriver } from "./cullingDriver";
import { CAMERA_POST_FRAME_PRIORITY } from "../camera/cameraRigs";
import { useTerrainQuality } from "../terrain/terrainQuality";

type VisiblePredicate = (id: string) => boolean;

const ALWAYS_VISIBLE: VisiblePredicate = () => true;
const alwaysVisibleRef: MutableRefObject<VisiblePredicate> = { current: ALWAYS_VISIBLE };

const CullingContext = createContext<MutableRefObject<VisiblePredicate> | null>(null);
/** The tier's instance cull distance, for batched instanced draws that manage their own count. */
export const CullPolicyContext = createContext<InstanceCullPolicy>({ maxDistance: Number.POSITIVE_INFINITY, minDistance: 0, hysteresis: 0 });

/** Read the tier's instance cull distance. Unbounded outside a culling provider. */
export function useInstanceCullPolicy(): InstanceCullPolicy {
  return useContext(CullPolicyContext);
}

/**
 * Read the current render-visibility predicate. Backward compatible: with no CullingProvider
 * mounted (or culling disabled) it returns an always-visible ref, so a marker that consults it
 * behaves exactly as before this feature existed.
 */
export function useRenderVisibility(): MutableRefObject<VisiblePredicate> {
  return useContext(CullingContext) ?? alwaysVisibleRef;
}

/** Resolve the tier's instance cull distance, honouring a game's scene-wide distance override. @internal */
export function resolveProviderCullPolicy(
  tier: GraphicsQuality,
  drawDistance: number | undefined,
  config: VisibilityConfig | undefined,
): InstanceCullPolicy {
  const override = config?.culling?.defaultMaxRenderDistance;
  return resolveInstanceCullPolicy({
    tier,
    drawDistance: drawDistance ?? Number.POSITIVE_INFINITY,
    ...(override !== undefined ? { override: { maxDistance: override } } : {}),
  });
}
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
export function CullingProvider({ config, drawDistance, children }: { config: VisibilityConfig | undefined; drawDistance?: number; children: ReactNode }): ReactNode {
  const ctx = useGameContext();
  const enabled = config?.enabled !== false;
  const predicateRef = useRef<VisiblePredicate>(ALWAYS_VISIBLE);
  const camera = useThree((state) => state.camera);
  const tier = useTerrainQuality();
  const resolvedConfig = useMemo(() => {
    if (drawDistance === undefined) return config;
    return { ...config, culling: { ...config?.culling, defaultMaxRenderDistance: config?.culling?.defaultMaxRenderDistance ?? drawDistance } };
  }, [config, drawDistance]);
  const policy = useMemo(() => resolveProviderCullPolicy(tier, drawDistance, config), [tier, drawDistance, config]);
  const driver = useMemo(() => (enabled ? buildCullingDriver(ctx, resolvedConfig) : null), [ctx, resolvedConfig, enabled]);

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

  return <CullPolicyContext.Provider value={policy}><CullingContext.Provider value={predicateRef}>{children}</CullingContext.Provider></CullPolicyContext.Provider>;
}


