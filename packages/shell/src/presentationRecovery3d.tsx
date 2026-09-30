import { addAfterEffect, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";

import { usePresentationRetryScope } from "./presentationRecovery";

/** Registers exact loader inputs and their cache clear before a load can suspend. @internal */
export function useRecoverableTexture<T extends string[] | string | Record<string, string>>(input: T) {
  const scope = usePresentationRetryScope();
  const inputs = typeof input === "string" ? [input] : Array.isArray(input) ? input : Object.values(input);
  const loaded = scope?.registry.register(inputs, useTexture.clear);
  const textures = useTexture(input);
  loaded?.();
  return textures;
}

/** Observes the owning renderer after the restored material subtree commits and draws. @internal */
export function PresentationRecoveredDraw() {
  const gl = useThree((state) => state.gl);
  const scope = usePresentationRetryScope();
  useLayoutEffect(() => {
    if (scope === null) return;
    const baseline = gl.info.render.frame;
    let stop = () => {};
    stop = addAfterEffect(() => {
      if (gl.info.render.frame <= baseline || gl.info.render.calls <= 0 || !gl.domElement.isConnected || gl.getContext().isContextLost()) return;
      stop(); scope.recoveredDraw();
    });
    return () => stop();
  }, [gl, scope]);
  return null;
}
