import { useMemo } from "react";

import type { DocumentColorGrade } from "@jgengine/core/editor/environment";
import { resolveGameLook, type GameLookInput, type ResolvedGameLook } from "@jgengine/core/render/lookPreset";
import { sky as resolveSkyDescriptor, type SkyEnvironmentDescriptor } from "@jgengine/core/world/features";

import { withAuthoredGrade } from "./authoredGrade";

/** The look the shell renders, resolved once per authored value. @internal */
export interface PresentationLook {
  look: ResolvedGameLook;
  backdropSky: SkyEnvironmentDescriptor | undefined;
}

/**
 * Resolve a game's look preset and backdrop sky, keeping one identity until an authored value
 * changes. The post chain, sky dome and lighting rebuild on identity, so a fresh object per
 * render recompiled every pass each frame.
 * @internal
 */
export function usePresentationLook(input: GameLookInput, authoredGrade: DocumentColorGrade | undefined): PresentationLook {
  const { look, mood, lighting, backdrop, postProcessing, hasWorldSky, worldSky } = input;
  return useMemo(() => {
    const resolved = withAuthoredGrade(resolveGameLook({ look, mood, lighting, backdrop, postProcessing, hasWorldSky, worldSky }), authoredGrade);
    const sky = resolved.backdrop?.sky;
    return { look: resolved, backdropSky: sky === undefined ? undefined : resolveSkyDescriptor(sky) };
  }, [look, mood, lighting, backdrop, postProcessing, hasWorldSky, worldSky, authoredGrade]);
}
