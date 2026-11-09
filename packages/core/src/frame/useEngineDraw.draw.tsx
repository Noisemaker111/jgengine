import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type DependencyList } from "react";
import * as THREE from "three";

import { childFrameState, type EngineDraw, type EngineFrameState } from "./engineLoop.draw";
import { frameStateFromR3F } from "./r3fFrameState.draw";
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
    : joinFrameTask(draw.priority ?? 0, (frameState) => draw.frame?.(childFrameState(frameState, parent)));
  return { draw, state, leave };
}

function unmountDraw(mounted: MountedDraw): void {
  mounted.leave();
  mounted.draw.dispose?.(mounted.state);
}

/**
 * Mount an {@link EngineDraw} as a child of an identity {@link THREE.Group} rendered
 * in place, so the draw inherits the JSX parent's transform exactly like the
 * primitives it replaces. `create` runs once per `deps` change; `dispose` runs on
 * unmount or before a recreate. This is the call-site bridge that lets draw files
 * become plain factories with no React; parents keep their JSX until they convert.
 * @internal
 */
export function EngineDrawMount({ create, deps }: { create: () => EngineDraw; deps: DependencyList }) {
  const root = useThree();
  // A primitive object, not a `<group>` intrinsic: bare test roots have no THREE
  // catalogue extension, and the draw only needs a stable parent transform.
  const parent = useMemo(() => new THREE.Group(), []);
  const mounted = useRef<MountedDraw | null>(null);
  useEffect(() => {
    const next = mountDraw(create(), parent, frameStateFromR3F(root, 0));
    mounted.current = next;
    return () => {
      unmountDraw(next);
      mounted.current = null;
    };
    // `create` and `root` are intentionally excluded: callers pass fresh
    // closures through `deps`, and the RootState reference is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, ...deps]);
  useEffect(() => {
    mounted.current?.draw.update?.(mounted.current.state);
  });
  return <primitive object={parent} />;
}

/**
 * Mount an {@link EngineDraw} at the scene root while r3f still owns rendering:
 * `create` runs once per `deps` change, `mount` gets a facade over the live
 * RootState, `frame` joins the shared board at the draw's priority, and
 * `dispose` runs on unmount or before a recreate. For draws whose objects
 * position themselves in world space; draws that must inherit a JSX parent's
 * transform use {@link EngineDrawMount} instead.
 * @internal
 */
export function useEngineDraw(create: () => EngineDraw, deps: DependencyList): void {
  const root = useThree();
  const mounted = useRef<MountedDraw | null>(null);
  useEffect(() => {
    const draw = create();
    const state = frameStateFromR3F(root, 0);
    draw.mount?.(state);
    const leave = draw.frame === undefined
      ? () => {}
      : joinFrameTask(draw.priority ?? 0, (frameState) => draw.frame?.(frameState));
    const next = { draw, state, leave };
    mounted.current = next;
    return () => {
      unmountDraw(next);
      mounted.current = null;
    };
    // `create` and `root` are intentionally excluded: callers pass fresh
    // closures through `deps`, and the RootState reference is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    mounted.current?.draw.update?.(mounted.current.state);
  });
}
