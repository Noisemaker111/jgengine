import { useMemo } from "react";

import { resolveGeneratorAsset } from "@jgengine/core/scene/assetGenerator";
import { STUDIO_STAGE_POST } from "@jgengine/core/render/postProcessing";
import { flat } from "@jgengine/core/world/features";
import { GeneratedAssetInstance } from "@jgengine/shell/scene/GeneratedAssetRenderer";
import { StudioStage } from "@jgengine/shell/scene/StudioStage";
import { defineGame } from "@jgengine/shell/defineGame";

import { registerBookcaseStudio } from "@jgengine-examples/studios";

// The bookcase generator adopter registers itself — one call, no engine edits (the #809/#812 seam).
registerBookcaseStudio();

const BOOKCASE_META = { assetId: "bookcase", width: 1.7, height: 2.25, depth: 0.34, shelves: 5, boardThickness: 0.045, bookDensity: 0.92, lean: 0.16, tint: "#6f4a2c", seed: "stage-7" };

function BookcaseStage() {
  const asset = useMemo(() => resolveGeneratorAsset(BOOKCASE_META), []);
  return (
    <StudioStage mood="studio" backdrop="#0d0f14" turntable={0} faceCamera forward={asset?.forward}>
      <GeneratedAssetInstance meta={BOOKCASE_META} position={[0, 0, 0]} />
    </StudioStage>
  );
}

/**
 * A cinematic product shot for the bookcase generator studio — the direct analog of the reference
 * "Bookcase Studio": one parametric asset on a lit backdrop with the film grade and DoF. Built as a
 * BARE game (no entities/items/time/inventories) so there is zero gameplay HUD — proof that engine
 * chrome is data-driven and composable, not imposed. The camera orbits (`camera.turntable`) while
 * `StudioStage`'s `faceCamera` yaws the bookcase toward it every frame — the generator's declared
 * `forward` (#816) keeps the open shelf face on camera with zero hand-tuned `rotationY`.
 */
export const bookcaseStageGame = defineGame({
  name: "bookcase-stage",
  world: flat(),
  multiplayer: null,
  environment: () => <BookcaseStage />,
  postProcessing: { ...STUDIO_STAGE_POST, dof: { focus: 5, aperture: 0.00035, maxBlur: 0.009 } },
  camera: {
    turntable: { target: { x: 0, y: 1.1, z: 0 }, distance: 4.4, height: 1.5, lookHeight: 1.1, orbitSpeed: 0.25, startAngle: 0.42, fov: 38 },
  },
});
