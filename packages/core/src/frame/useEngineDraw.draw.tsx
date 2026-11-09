import { createContext, useContext, useEffect, useMemo, useRef, type DependencyList, type ReactNode } from "react";
import * as THREE from "three";
import type {} from "@react-three/fiber";

import { childFrameState, type EngineDraw, type EngineFrameState } from "./engineLoop.draw";
import { useEngineHost } from "./engineHost.draw";
import { joinFrameTask } from "./frameBoard.draw";

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
  draw.mount?.(state);
  const leave = draw.frame === undefined
    ? () => {}
    : joinFrameTask(draw.priority ?? 0, (frameState, delta) => draw.frame?.(childFrameState(frameState, parent), delta));
  return { draw, state, leave };
}

/** Reverse {@link mountChildDraw}: leave the frame board, then dispose with the scoped state. @internal */
export function unmountChildDraw(mounted: MountedChildDraw): void {
  mounted.leave();
  mounted.draw.dispose?.(mounted.state);
}

/**
 * The nearest scene parent for draws mounted through React under the engine
 * loop (no r3f reconciler). `null` means the host scene root. Components that
 * own a {@link THREE.Group} for custom children provide it so nested
 * {@link EngineDrawMount}s inherit the transform, like JSX nesting did.
 * @internal
 */
export const EngineSceneContext = createContext<THREE.Object3D | null>(null);

/** Provide `parent` as the scene parent for descendant draw mounts. @internal */
export function EngineSceneProvider({ parent, children }: { parent: THREE.Object3D; children?: ReactNode }) {
  return <EngineSceneContext.Provider value={parent}>{children}</EngineSceneContext.Provider>;
}

/**
 * Parents `children`'s scene objects under `object` on either host: under r3f a
 * `<primitive>` (so raw intrinsics and draw mounts alike inherit the transform through the
 * reconciler); under the engine loop an {@link EngineSceneContext} provider (so descendant
 * draw mounts attach to `object` themselves). This is how a draw that owns a {@link THREE.Group}
 * gives React-rendered custom content that group's transform.
 * @internal
 */
export function SceneObjectPortal({ object, children }: { object: THREE.Object3D; children?: ReactNode }) {
  const host = useEngineHost();
  if (host.r3f) return <primitive object={object}>{children}</primitive>;
  return <EngineSceneContext.Provider value={object}>{children}</EngineSceneContext.Provider>;
}

/** Attach `object` to the host scene under the engine loop; a no-op under r3f, where the portal's primitive parents it. @internal */
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
 * Mount a caller-owned {@link THREE.Object3D} on either host: under r3f a
 * `<primitive>` so the reconciler parents it; under the engine loop an attach
 * draw adding it to the nearest {@link EngineSceneContext} (or scene root).
 * The object keeps whatever transform the caller writes onto it.
 * @internal
 */
export function SceneObjectAttach({ object }: { object: THREE.Object3D }) {
  const host = useEngineHost();
  const sceneParent = useContext(EngineSceneContext);
  useEngineDraw(
    () => ({
      mount(state: EngineFrameState) {
        if (!host.r3f) (sceneParent ?? state.scene).add(object);
      },
      dispose(state: EngineFrameState) {
        if (!host.r3f) (sceneParent ?? state.scene).remove(object);
      },
    }),
    [object, host.r3f, sceneParent],
  );
  if (host.r3f) return <primitive object={object} />;
  return null;
}

/**
 * Attach a caller-owned {@link THREE.Object3D} under the nearest
 * {@link EngineSceneContext} parent (or the scene root) on the engine loop —
 * the context-aware form of {@link sceneObjectAttachDraw} for objects a
 * component moves per-frame and cannot hand to {@link EngineDrawMount}.
 * Under r3f this is a no-op: the matching {@link SceneObjectPortal} primitive
 * parents the object through the reconciler instead. @internal
 */
export function useSceneObjectAttach(object: THREE.Object3D): void {
  const host = useEngineHost();
  const sceneParent = useContext(EngineSceneContext);
  useEngineDraw(() => ({
    mount(state: EngineFrameState) {
      if (!host.r3f) (sceneParent ?? state.scene).add(object);
    },
    dispose(state: EngineFrameState) {
      if (!host.r3f) (sceneParent ?? state.scene).remove(object);
    },
  }), [object, host.r3f, sceneParent]);
}

/**
 * A positioned {@link THREE.Group} parenting `children`'s scene objects on either host — the
 * draw-side form of `<group position={...}>`: under r3f a primitive at the JSX position, under
 * the engine loop a scene attachment plus an {@link EngineSceneContext} for descendants.
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
  const host = useEngineHost();
  const group = useMemo(() => {
    const next = new THREE.Group();
    if (userData !== undefined) next.userData = { ...next.userData, ...userData };
    return next;
  }, [userData]);
  useEffect(() => {
    if (position !== undefined) group.position.set(position[0], position[1], position[2]);
    if (rotation !== undefined) group.rotation.set(rotation[0], rotation[1], rotation[2]);
    else if (rotationY !== undefined) group.rotation.y = rotationY;
    if (scale !== undefined) group.scale.set(scale[0], scale[1], scale[2]);
    if (visible !== undefined) group.visible = visible;
  }, [group, position, rotation, rotationY, scale, visible]);
  useEngineDraw(() => sceneObjectAttachDraw(group, !host.r3f), [group, host.r3f]);
  return <SceneObjectPortal object={group}>{children}</SceneObjectPortal>;
}

/**
 * Mount an {@link EngineDraw} as a child of an identity {@link THREE.Group}.
 * Under r3f the group is a `<primitive>` and inherits the JSX parent's
 * transform; under the engine loop it attaches to the nearest
 * {@link EngineSceneContext} parent (or the scene root) itself. `create` runs
 * once per `deps` change; `dispose` runs on unmount or before a recreate.
 * @internal
 */
export function EngineDrawMount({ create, deps }: { create: () => EngineDraw; deps: DependencyList }) {
  const host = useEngineHost();
  const sceneParent = useContext(EngineSceneContext);
  // A primitive object, not a `<group>` intrinsic: bare test roots have no THREE
  // catalogue extension, and the draw only needs a stable parent transform.
  const parent = useMemo(() => new THREE.Group(), []);
  const mounted = useRef<MountedChildDraw | null>(null);
  useEffect(() => {
    if (!host.r3f) {
      const attachTo = sceneParent ?? host.frame.scene;
      attachTo.add(parent);
    }
    const next = mountChildDraw(create(), parent, host.frame);
    mounted.current = next;
    return () => {
      unmountChildDraw(next);
      mounted.current = null;
      if (!host.r3f) {
        const attachTo = sceneParent ?? host.frame.scene;
        attachTo.remove(parent);
      }
    };
    // `create` and `host`/`sceneParent` are intentionally excluded beyond `deps`:
    // callers pass fresh closures through `deps`, the host is stable per tree,
    // and a scene-parent change remounts through the deps the caller owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, ...deps]);
  useEffect(() => {
    mounted.current?.draw.update?.(mounted.current.state);
  });
  if (host.r3f) return <primitive object={parent} />;
  return null;
}

/**
 * Mount an {@link EngineDraw} at the scene root: `create` runs once per `deps`
 * change, `mount` gets the host's frame facade, `frame` joins the shared board
 * at the draw's priority, and `dispose` runs on unmount or before a recreate.
 * For draws whose objects position themselves in world space; draws that must
 * inherit a parent transform use {@link EngineDrawMount} instead.
 * @internal
 */
export function useEngineDraw(create: () => EngineDraw, deps: DependencyList): void {
  const frame = useEngineHost().frame;
  const mounted = useRef<MountedChildDraw | null>(null);
  useEffect(() => {
    const draw = create();
    const state = frame;
    draw.mount?.(state);
    const leave = draw.frame === undefined
      ? () => {}
      : joinFrameTask(draw.priority ?? 0, (frameState, delta) => draw.frame?.(frameState, delta));
    const next = { draw, state, leave };
    mounted.current = next;
    return () => {
      unmountChildDraw(next);
      mounted.current = null;
    };
    // `create` and `frame` are intentionally excluded: callers pass fresh
    // closures through `deps`, and the host frame reference is stable.
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
