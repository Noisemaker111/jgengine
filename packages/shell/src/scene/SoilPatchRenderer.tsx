import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { resolveSoilObject } from "@jgengine/core/world/soilKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { createSoilPatchMaterial } from "../terrain/soilPatchMaterial";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/** Height offset above the sampled terrain so the draped patch never z-fights the ground. */
const SOIL_LIFT = 0.04;
/** Amplitude of the seeded micro-relief layered onto the drape, meters. */
const SOIL_RELIEF = 0.13;

/** Cheap deterministic 2D value noise (two octaves) for the patch's baked micro-relief. */
function reliefNoise(x: number, z: number): number {
  const n = (px: number, pz: number) => {
    const s = Math.sin(px * 12.9898 + pz * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const octave = (px: number, pz: number) => {
    const ix = Math.floor(px);
    const iz = Math.floor(pz);
    const fx = px - ix;
    const fz = pz - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = n(ix, iz);
    const b = n(ix + 1, iz);
    const c = n(ix, iz + 1);
    const d = n(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  return octave(x * 0.7, z * 0.7) * 0.65 + octave(x * 2.3, z * 2.3) * 0.35;
}

/**
 * One authored soil volume → a subdivided plane draped over the live terrain (each vertex sampled
 * from the height field) with the crack/moss shader and a noise-eroded edge fade, so the patch hugs
 * relief and dissolves into the surrounding ground instead of reading as a hovering brown box.
 */
function OneSoil({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveSoilObject(object), [object]);
  const groundColorAt = context.groundColorAt;
  const material = useMemo(
    () =>
      resolved === null
        ? null
        : createSoilPatchMaterial(resolved.rules, {
            center: [resolved.center[0], resolved.center[2]],
            halfSize: [resolved.size[0] / 2, resolved.size[1] / 2],
            ...(groundColorAt === undefined
              ? {}
              : { groundColor: groundColorAt(resolved.center[0], resolved.center[2]) }),
          }),
    [resolved, groundColorAt],
  );
  const geometry = useMemo(() => {
    if (resolved === null) return null;
    const [w, d] = resolved.size;
    const segX = Math.min(96, Math.max(12, Math.round(w / 0.4)));
    const segZ = Math.min(96, Math.max(12, Math.round(d / 0.4)));
    const plane = new THREE.PlaneGeometry(w, d, segX, segZ);
    plane.rotateX(-Math.PI / 2);
    const positions = plane.getAttribute("position");
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const wx = resolved.center[0] + x;
      const wz = resolved.center[2] + z;
      // Seeded micro-relief so the cracked dirt catches light like packed earth, not a flat decal;
      // the amplitude eases out toward the border so the fading edge still meets the ground flush.
      const edgeX = 1 - Math.min(1, Math.abs(x) / (w / 2));
      const edgeZ = 1 - Math.min(1, Math.abs(z) / (d / 2));
      const edgeEase = Math.min(1, Math.min(edgeX, edgeZ) * 3);
      const relief = (reliefNoise(wx, wz) - 0.5) * 2 * SOIL_RELIEF * edgeEase;
      positions.setY(i, context.field.sampleHeight(wx, wz) + SOIL_LIFT + relief);
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
