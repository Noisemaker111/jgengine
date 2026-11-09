import { createContext, useContext, useEffect, useMemo, useRef, type DependencyList, type ReactNode } from "react";
import * as THREE from "three";
import type {} from "@react-three/fiber";

import { childFrameState, type EngineDraw, type EngineFrameState } from "./engineLoop.draw";
import { useEngineHost } from "./engineHost.draw";
import { joinFrameTask } from "./frameBoard.draw";

interface MountedDraw {
  draw: EngineDraw;
  state: EngineFrameState;
  leave: () => void;
}

function mountDraw(draw: EngineDraw, parent: THREE.Object3D, root: EngineFrameState): MountedDraw {
  const state = childFrameState(root, parent);
  draw.mount?.(state);
  const leave = draw.frame === undefined
    ? () => {}
    : joinFrameTask(draw.priority ?? 0, (frameState, delta) => draw.frame?.(childFrameState(frameState, parent), delta));
  return { draw, state, leave };
}

function unmountDraw(mounted: MountedDraw): void {
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
  const mounted = useRef<MountedDraw | null>(null);
  useEffect(() => {
    if (!host.r3f) {
      const attachTo = sceneParent ?? host.frame.scene;
      attachTo.add(parent);
    }
    const next = mountDraw(create(), parent, host.frame);
    mounted.current = next;
    return () => {
      unmountDraw(next);
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
  const mounted = useRef<MountedDraw | null>(null);
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
      unmountDraw(next);
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
