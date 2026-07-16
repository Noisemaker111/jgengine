import { useEffect, useMemo } from "react";

import { resolveSoilObject } from "@jgengine/core/world/soilKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { createSoilPatchMaterial } from "../terrain/soilPatchMaterial";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

const SOIL_PATCH_THICKNESS = 0.08;

/** One authored soil volume → a ground-hugging patch mesh with a crack/moss shader material. */
function OneSoil({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveSoilObject(object), [object]);
  const material = useMemo(() => (resolved === null ? null : createSoilPatchMaterial(resolved.rules)), [resolved]);
  useEffect(() => () => material?.dispose(), [material]);
  if (resolved === null || material === null) return null;
  const groundY = context.field.sampleHeight(resolved.center[0], resolved.center[2]);
  const y = groundY + SOIL_PATCH_THICKNESS / 2 + 0.02;
  return (
    <mesh position={[resolved.center[0], y, resolved.center[2]]} material={material} receiveShadow>
      <boxGeometry args={[resolved.size[0], SOIL_PATCH_THICKNESS, resolved.size[1]]} />
    </mesh>
  );
}

/** Registers the `soil` volume runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerSoilPatchRenderer(): void {
  registerSceneKindRenderer("soil", ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneSoil key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
