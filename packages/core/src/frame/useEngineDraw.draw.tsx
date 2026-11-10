import { createContext, useContext, useEffect, useMemo, useRef, type DependencyList, type ReactNode } from "react";
import * as THREE from "three";

import { childFrameState, type EngineDraw, type EngineFrameState } from "./engineLoop.draw";
import { useEngineHost } from "./engineHost.draw";
import { joinFrameTask, withFrameOwner } from "./frameBoard.draw";

/** A draw mounted by {@link mountChildDraw}: its scoped state, and the leave/dispose pair. @internal */
export interface MountedChildDraw {
  draw: EngineDraw;
  state: EngineFrameState;
  leave: () => void;
}

/**
 * Mount `draw` as a child of `parent` under the root frame state — the imperative form of
 * {@link EngineDrawMount} for draws that compose children (a marker swapping its model for a
 * sprite). The child's `state.scene` is `parent`, so its objects and frame tasks inherit the
 * parent's transform exactly like JSX nesting did.
 * @internal
 */
export function mountChildDraw(draw: EngineDraw, parent: THREE.Object3D, root: EngineFrameState): MountedChildDraw {
  const state = childFrameState(root, parent);
  const owner = root.frameOwner;
  withFrameOwner(owner, () => draw.mount?.(state));
  const leave = draw.frame === undefined
    ? () => {}
    : joinFrameTask(draw.priority ?? 0, (frameState, delta) => draw.frame?.(childFrameState(frameState, parent), delta), owner);
  return { draw, state, leave };
}

/** Reverse {@link mountChildDraw}: leave the frame board, then dispose with the scoped state. @internal */
export function unmountChildDraw(mounted: MountedChildDraw): void {
  mounted.leave();
  mounted.draw.dispose?.(mounted.state);
}

/** Rebuilds inside {@link CHURN_WINDOW_MS} that mean a draw's `deps` change identity every render. */
const CHURN_REBUILDS = 30;
const CHURN_WINDOW_MS = 1000;

/** One mount's rebuild history for {@link noteDrawRebuild}. @internal */
export interface DrawChurn {
  windowStart: number;
  rebuilds: number;
  warned: boolean;
}

/** @internal */
export function createDrawChurn(): DrawChurn {
  return { windowStart: 0, rebuilds: -1, warned: false };
}

/**
 * Count one build of a mounted draw and warn, once per mount, when it is being rebuilt on every
 * render: a `deps` entry made fresh each render (an inline array or object) disposes and remounts
 * the draw, so a model it loads never finishes arriving. Returns true when it warned.
 * @internal
 */
export function noteDrawRebuild(churn: DrawChurn, create: () => EngineDraw, now: number): boolean {
  if (now - churn.windowStart > CHURN_WINDOW_MS) {
    churn.windowStart = now;
    // The first build of a mount is not a rebuild.
    churn.rebuilds = churn.rebuilds < 0 ? 0 : 1;
    return false;
  }
  churn.rebuilds += 1;
  if (churn.warned || churn.rebuilds < CHURN_REBUILDS) return false;
  churn.warned = true;
  console.warn(`[jgengine:draw] a draw was rebuilt ${churn.rebuilds} times in a second: one of its deps is a new array or object every render, so it never settles. Pass stable values. ${create.toString().replace(/\s+/g, " ").slice(0, 160)}`);
  return true;
}

/**
 * The nearest scene parent for draws mounted through React: `null` means the
 * host scene root. Components that own a {@link THREE.Group} for custom
 * children provide it so nested {@link EngineDrawMount}s inherit the transform,
 * like JSX nesting did.
 * @internal
 */
export const EngineSceneContext = createContext<THREE.Object3D | null>(null);

/** Provide `parent` as the scene parent for descendant draw mounts. @internal */
export function EngineSceneProvider({ parent, children }: { parent: THREE.Object3D; children?: ReactNode }) {
  return <EngineSceneContext.Provider value={parent}>{children}</EngineSceneContext.Provider>;
}

/**
 * Parents `children`'s draw mounts under `object` through {@link EngineSceneContext} —
 * how a draw that owns a {@link THREE.Group} gives React-rendered custom content
 * that group's transform.
 * @internal
 */
export function SceneObjectPortal({ object, children }: { object: THREE.Object3D; children?: ReactNode }) {
  return <EngineSceneContext.Provider value={object}>{children}</EngineSceneContext.Provider>;
}

/** Attach `object` to the scene under the engine loop; kept for callers that bracket mounts with it. @internal */
export function sceneObjectAttachDraw(object: THREE.Object3D, attach: boolean): EngineDraw {
  return {
    mount(state: EngineFrameState) {
      if (attach) state.scene.add(object);
    },
    dispose(state: EngineFrameState) {
      if (attach) state.scene.remove(object);
    },
  };
}

/**
 * Mount a caller-owned {@link THREE.Object3D} under the nearest
 * {@link EngineSceneContext} (or the scene root). The object keeps whatever
 * transform the caller writes onto it.
 * @internal
 */
export function SceneObjectAttach({ object }: { object: THREE.Object3D }) {
  const sceneParent = useContext(EngineSceneContext);
  useEngineDraw(
    () => ({
      mount(state: EngineFrameState) {
        (sceneParent ?? state.scene).add(object);
      },
      dispose(state: EngineFrameState) {
        (sceneParent ?? state.scene).remove(object);
      },
    }),
    [object, sceneParent],
  );
  return null;
}

/**
 * Attach caller-owned {@link THREE.Object3D}s under the nearest
 * {@link EngineSceneContext} (or the scene root) — one attach draw for a whole
 * list. For merged-geometry sets a draw already built, like a district's
 * massing/furniture/race mesh lists.
 * @internal
 */
export function SceneObjectList({ objects }: { objects: readonly THREE.Object3D[] }) {
  const sceneParent = useContext(EngineSceneContext);
  useEngineDraw(
    () => ({
      mount(state: EngineFrameState) {
        for (const object of objects) (sceneParent ?? state.scene).add(object);
      },
      dispose(state: EngineFrameState) {
        for (const object of objects) (sceneParent ?? state.scene).remove(object);
      },
    }),
    [objects, sceneParent],
  );
  return null;
}

/**
 * Attach a caller-owned {@link THREE.Object3D} under the nearest
 * {@link EngineSceneContext} parent (or the scene root) — for objects a
 * component moves per-frame and cannot hand to {@link EngineDrawMount}.
 * @internal
 */
export function useSceneObjectAttach(object: THREE.Object3D): void {
  const sceneParent = useContext(EngineSceneContext);
  useEngineDraw(() => ({
    mount(state: EngineFrameState) {
      (sceneParent ?? state.scene).add(object);
    },
    dispose(state: EngineFrameState) {
      (sceneParent ?? state.scene).remove(object);
    },
  }), [object, sceneParent]);
}

/**
 * A positioned {@link THREE.Group} parenting `children`'s draw mounts — the
 * draw-side form of `<group position={...}>`: a scene attachment plus an
 * {@link EngineSceneContext} for descendants.
 * @internal
 */
export function SceneObjectGroup({
  position,
  rotation,
  rotationY,
  scale,
  visible,
  userData,
  children,
}: {
  position?: readonly [number, number, number] | undefined;
  /** Euler XYZ rotation in radians (the r3f `rotation={[x,y,z]}` form). */
  rotation?: readonly [number, number, number] | undefined;
  /** Y-rotation in radians — the common `<group rotation-y>` case. */
  rotationY?: number | undefined;
  scale?: readonly [number, number, number] | undefined;
  visible?: boolean | undefined;
  /** Tags the group for scene scans (postfx overlay exclusion, camera collision). */
  userData?: Record<string, unknown> | undefined;
  children?: ReactNode;
}) {
  // One group for the component's life: callers pass `userData` and the transform tuples inline, so
  // a group keyed on them would be rebuilt every render and remount every draw beneath it.
  const group = useMemo(() => new THREE.Group(), []);
  group.userData = userData === undefined ? {} : { ...userData };
  useEffect(() => {
    if (position !== undefined) group.position.set(position[0], position[1], position[2]);
    if (rotation !== undefined) group.rotation.set(rotation[0], rotation[1], rotation[2]);
    else if (rotationY !== undefined) group.rotation.y = rotationY;
    if (scale !== undefined) group.scale.set(scale[0], scale[1], scale[2]);
    if (visible !== undefined) group.visible = visible;
  }, [group, position, rotation, rotationY, scale, visible]);
  useEngineDraw(() => sceneObjectAttachDraw(group, true), [group]);
  return <SceneObjectPortal object={group}>{children}</SceneObjectPortal>;
}

/**
 * Mount an {@link EngineDraw} as a child of an identity {@link THREE.Group}.
 * The group attaches to the nearest {@link EngineSceneContext} parent (or the
 * scene root), so descendant mounts inherit transforms like JSX nesting did.
 * `create` runs once per `deps` change; `dispose` runs on unmount or before a
 * recreate.
 * @internal
 */
export function EngineDrawMount({ create, deps }: { create: () => EngineDraw; deps: DependencyList }) {
  const host = useEngineHost();
  const sceneParent = useContext(EngineSceneContext);
  // A plain group, not a JSX intrinsic: the draw only needs a stable parent transform.
  const parent = useMemo(() => new THREE.Group(), []);
  const mounted = useRef<MountedChildDraw | null>(null);
  const churn = useRef<DrawChurn | null>(null);
  useEffect(() => {
    noteDrawRebuild((churn.current ??= createDrawChurn()), create, performance.now());
    const attachTo = sceneParent ?? host.frame.scene;
    attachTo.add(parent);
    const next = mountChildDraw(create(), parent, host.frame);
    mounted.current = next;
    return () => {
      unmountChildDraw(next);
      mounted.current = null;
      attachTo.remove(parent);
    };
    // `create` and `sceneParent` are intentionally excluded beyond `deps`:
    // callers pass fresh closures through `deps`, and a scene-parent change
    // remounts through the deps the caller owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, ...deps]);
  useEffect(() => {
    mounted.current?.draw.update?.(mounted.current.state);
  });
  return null;
}

/** Mount `draw` on the host's frame state itself — the scene-root form of {@link mountChildDraw}. @internal */
function mountRootDraw(draw: EngineDraw, frame: EngineFrameState): MountedChildDraw {
  const owner = frame.frameOwner;
  withFrameOwner(owner, () => draw.mount?.(frame));
  const leave = draw.frame === undefined
    ? () => {}
    : joinFrameTask(draw.priority ?? 0, (frameState, delta) => draw.frame?.(frameState, delta), owner);
  return { draw, state: frame, leave };
}

/**
 * Mount an {@link EngineDraw} at the nearest {@link EngineSceneContext} parent — the scene root
 * when no provider is above. `create` runs once per `deps` change, `mount` gets a frame state
 * scoped to that parent (so `state.scene` is the parent, like JSX nesting), `frame` joins the
 * shared board at the draw's priority, and `dispose` runs on unmount or before a recreate. For
 * draws whose objects position themselves in world space under their provider's transform.
 * @internal
 */
export function useEngineDraw(create: () => EngineDraw, deps: DependencyList): void {
  const frame = useEngineHost().frame;
  const sceneParent = useContext(EngineSceneContext);
  const mounted = useRef<MountedChildDraw | null>(null);
  const churn = useRef<DrawChurn | null>(null);
  useEffect(() => {
    noteDrawRebuild((churn.current ??= createDrawChurn()), create, performance.now());
    const draw = create();
    const next = sceneParent === null ? mountRootDraw(draw, frame) : mountChildDraw(draw, sceneParent, frame);
    mounted.current = next;
    return () => {
      unmountChildDraw(next);
      mounted.current = null;
    };
    // `create`, `frame` and `sceneParent` are intentionally excluded: callers pass fresh
    // closures through `deps`, the host frame reference is stable, and a scene-parent change
    // remounts through the deps the caller owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    mounted.current?.draw.update?.(mounted.current.state);
  });
}

/**
 * Transform fields shared by {@link meshDraw} and the `SceneObjectGroup` props:
 * position, XYZ euler rotation, scale and visibility, matching what r3f JSX
 * props used to set on `<group>`/`<mesh>`.
 */
export interface DrawTransform {
  position?: readonly [number, number, number] | undefined;
  /** Euler XYZ rotation in radians (the r3f `rotation={[x,y,z]}` form). */
  rotation?: readonly [number, number, number] | undefined;
  scale?: readonly [number, number, number] | undefined;
  visible?: boolean | undefined;
}

/**
 * Object3D transform and common mesh flags shared by draw component prop types â€” the engine-side
 * form of the r3f `<group>`/`<mesh>` intrinsic props these components used to extend. Vector/Euler
 * instances are accepted wherever the r3f prop did.
 * @internal
 */
export interface DrawAttachProps {
  position?: readonly [number, number, number] | THREE.Vector3 | undefined;
  /** Euler XYZ rotation in radians (the r3f `rotation={[x,y,z]}` form). */
  rotation?: readonly [number, number, number] | THREE.Euler | undefined;
  /** XYZW quaternion â€” array form only, matching the apply helpers. */
  quaternion?: readonly [number, number, number, number] | undefined;
  scale?: readonly [number, number, number] | THREE.Vector3 | undefined;
  visible?: boolean | undefined;
  castShadow?: boolean | undefined;
  receiveShadow?: boolean | undefined;
  frustumCulled?: boolean | undefined;
  renderOrder?: number | undefined;
}

/**
 * A static mesh as an {@link EngineDraw}: one `THREE.Mesh` with the given
 * geometry and material, transform applied once at creation, attached under
 * `state.scene` (so it inherits whatever parent mounted it). Geometry and
 * material are caller-owned — the draw disposes both on `dispose`.
 * @internal
 */
export function meshDraw(options: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow?: boolean | undefined;
  receiveShadow?: boolean | undefined;
  renderOrder?: number | undefined;
} & DrawTransform): EngineDraw {
  const mesh = new THREE.Mesh(options.geometry, options.material);
  if (options.position !== undefined) mesh.position.set(options.position[0], options.position[1], options.position[2]);
  if (options.rotation !== undefined) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  if (options.scale !== undefined) mesh.scale.set(options.scale[0], options.scale[1], options.scale[2]);
  if (options.visible !== undefined) mesh.visible = options.visible;
  if (options.castShadow !== undefined) mesh.castShadow = options.castShadow;
  if (options.receiveShadow !== undefined) mesh.receiveShadow = options.receiveShadow;
  if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(mesh);
      options.geometry.dispose();
      const materials = Array.isArray(options.material) ? options.material : [options.material];
      for (const material of materials) material.dispose();
    },
  };
}

/** Dispose every geometry and material under `root` â€” for demo/preview object trees built outside draws. */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  });
}
