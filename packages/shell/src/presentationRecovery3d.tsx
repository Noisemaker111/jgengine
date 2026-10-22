import { addAfterEffect, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";

import { usePresentationRetryScope } from "./presentationRecovery";

/** Registers exact loader inputs and their cache clear before a load can suspend. @internal */
export function useRecoverableTexture<T extends string[] | string | Record<string, string>>(input: T) {
  const scope = usePresentationRetryScope();
  const inputs = typeof input === "string" ? [input] : Array.isArray(input) ? input : Object.values(input);
  const loaded = scope?.registry.register(inputs, useTexture.clear);
  const textures = useTexture(input);
  loaded?.();
  // drei returns a fresh keyed object each render; materials built from it rebuilt and recompiled every frame.
  const stable = useRef(textures);
  if (!sameTextures(stable.current, textures)) stable.current = textures;
  return stable.current;
}

function sameTextures(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
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
