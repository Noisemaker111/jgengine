import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { isSurfaceMaterialMaps, SURFACE_MATERIAL_OUTPUT } from "./surfaceMaterialGenerator";
import { surfaceMaterialStandardMaps } from "./surfaceMaterialTextures.draw";

/** Tiles the preview patch repeats across, so a seam would show inside the tile. */
const PREVIEW_REPEAT = 2;

function SurfaceMaterialPreview({ definition, variant }: GeneratorPreviewProps) {
  const maps = useMemo(() => {
    const output = runGenerator(definition, variant.meta);
    return isSurfaceMaterialMaps(output) ? surfaceMaterialStandardMaps(output) : null;
  }, [definition, variant]);
  const material = useMemo(() => {
    if (maps === null) return null;
    for (const texture of [maps.map, maps.normalMap, maps.ormMap]) texture.repeat.set(PREVIEW_REPEAT, PREVIEW_REPEAT);
    return new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.ormMap,
      aoMap: maps.ormMap,
      roughness: 1,
      metalness: 0,
    });
  }, [maps]);
  useEffect(
    () => () => {
      maps?.dispose();
      material?.dispose();
    },
    [maps, material],
  );
  if (material === null) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** Registers the surface material variant-tile preview: a lit 2x2-tile patch of the baked maps. @internal */
export function registerSurfaceMaterialDraw(): void {
  registerGeneratorPreview(SURFACE_MATERIAL_OUTPUT, {
    Component: SurfaceMaterialPreview,
    frame: () => ({ target: [0, 0, 0], distance: 2.3 }),
  });
}
