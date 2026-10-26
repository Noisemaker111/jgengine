import { useStore, type RenderCallback } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";

/**
 * `useFrame` that joins the frame loop only while `active`. For per-model work that most models
 * never have (a rig to pose, clips to play, paint to sync): every subscriber costs a call each
 * frame, and R3F re-sorts its whole subscriber list on each one that joins, so a scene of thousands
 * of static props subscribing four no-op hooks each spent seconds mounting and kept paying per frame.
 * @internal
 */
export function useFrameWhile(active: boolean, callback: RenderCallback, priority = 0): void {
  const store = useStore();
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  useLayoutEffect(() => (active ? store.getState().internal.subscribe(ref, priority, store) : undefined), [active, priority, store]);
}
