import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";

import { useDeferredSwap } from "@jgengine/core/ui/sceneSwap.view";

import { prepareSceneView } from "./shaderWarmup.draw";

/**
 * Change place (a dive, a lift, a district, a level) without a frozen frame. Returns the place to
 * draw, which trails `wanted` while the UI builds the new place in the background a few milliseconds
 * at a time, instead of mounting it in one long blocking pass; once it is in, the shader warmup
 * compiles what it gained and waits for its models, so its first frame on screen links nothing. The
 * frame loop keeps running throughout (models load and upload on it) and the old place still draws
 * from wherever the camera now is: paint an opaque card over the canvas while `useSceneSwapping()`
 * (`@jgengine/core/ui/sceneSwap.view`) is true.
 *
 * The heavy parts take the returned place as a prop and are `memo`ized (or select their own state),
 * so the urgent pass that raises the card does not rebuild the old place.
 *
 * ```tsx
 * const place = useSceneSwap(useStore(viewStore, placeOf));
 * return <Floor place={place} />;
 * ```
 *
 * @capability scene-swap change place without a frozen frame: build and compile the new place in the background behind a travel card
 */
export function useSceneSwap<T>(wanted: T): T {
  const host = useEngineHost();
  return useDeferredSwap(wanted, () => prepareSceneView(host.frame.scene));
}
