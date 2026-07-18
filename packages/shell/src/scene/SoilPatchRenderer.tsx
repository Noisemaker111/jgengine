import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { resolveSoilObject } from "@jgengine/core/world/soilKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { createSoilPatchMaterial } from "../terrain/soilPatchMaterial";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/** Height offset above the sampled terrain so the draped patch never z-fights the ground. */
const SOIL_LIFT = 0.05;

/**
 * One authored soil volume → a subdivided plane draped over the live terrain (each vertex sampled
 * from the height field) with the crack/moss shader and a noise-eroded edge fade, so the patch hugs
 * relief and dissolves into the surrounding ground instead of reading as a hovering brown box.
 */
function OneSoil({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveSoilObject(object), [object]);
  const material = useMemo(
    () =>
      resolved === null
        ? null
        : createSoilPatchMaterial(resolved.rules, {
            center: [resolved.center[0], resolved.center[2]],
            halfSize: [resolved.size[0] / 2, resolved.size[1] / 2],
          }),
    [resolved],
  );
  const geometry = useMemo(() => {
    if (resolved === null) return null;
    const [w, d] = resolved.size;
    const segX = Math.min(64, Math.max(8, Math.round(w / 0.75)));
    const segZ = Math.min(64, Math.max(8, Math.round(d / 0.75)));
    const plane = new THREE.PlaneGeometry(w, d, segX, segZ);
    plane.rotateX(-Math.PI / 2);
    const positions = plane.getAttribute("position");
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, context.field.sampleHeight(resolved.center[0] + x, resolved.center[2] + z) + SOIL_LIFT);
    }
    positions.needsUpdate = true;
    plane.computeVertexNormals();
    return plane;
  }, [resolved, context.field]);
  useEffect(() => () => material?.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (resolved === null || material === null || geometry === null) return null;
  return <mesh position={[resolved.center[0], 0, resolved.center[2]]} geometry={geometry} material={material} receiveShadow />;
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
