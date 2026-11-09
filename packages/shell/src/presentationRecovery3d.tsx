import { useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";

import { joinAfterRenderTask } from "@jgengine/core/frame/afterRenderBoard.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { usePresentationRetryScope } from "./presentationRecovery";
import { useStableTextureSet } from "@jgengine/core/material/stableTextureSet.draw";

/** Registers exact loader inputs and their cache clear before a load can suspend. @internal */
export function useRecoverableTexture<T extends string[] | string | Record<string, string>>(input: T) {
  const scope = usePresentationRetryScope();
  const inputs = typeof input === "string" ? [input] : Array.isArray(input) ? input : Object.values(input);
  const loaded = scope?.registry.register(inputs, useTexture.clear);
  const textures = useTexture(input);
  loaded?.();
  return useStableTextureSet(textures as object) as typeof textures;
}

/** Observes the owning renderer after the restored material subtree commits and draws. @internal */
export function PresentationRecoveredDraw() {
  const host = useEngineHost();
  const gl = host.frame.gl;
  const scope = usePresentationRetryScope();
  useLayoutEffect(() => {
    if (scope === null) return;
    const baseline = gl.info.render.frame;
    let stop = () => {};
    stop = joinAfterRenderTask(() => {
      if (gl.info.render.frame <= baseline || gl.info.render.calls <= 0 || !gl.domElement.isConnected || gl.getContext().isContextLost()) return;
      stop(); scope.recoveredDraw();
    });
    return () => stop();
  }, [gl, scope]);
  return null;
}
