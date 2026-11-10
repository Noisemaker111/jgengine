import { useRef } from "react";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { isSurfaceMaterialMaps, SURFACE_MATERIAL_OUTPUT } from "./surfaceMaterialGenerator";
import { surfaceMaterialStandardMaps } from "./surfaceMaterialTextures.draw";

/** Tiles the preview patch repeats across, so a seam would show inside the tile. */
const PREVIEW_REPEAT = 2;

export function surfaceMaterialPreviewDraw({ definition, variant }: GeneratorPreviewProps): EngineDraw {
  const output = runGenerator(definition, variant.meta);
  const maps = isSurfaceMaterialMaps(output) ? surfaceMaterialStandardMaps(output) : null;
  let material: THREE.MeshStandardMaterial | null = null;
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.PlaneGeometry | null = null;
  if (maps !== null) {
    for (const texture of [maps.map, maps.normalMap, maps.ormMap]) texture.repeat.set(PREVIEW_REPEAT, PREVIEW_REPEAT);
    material = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.ormMap,
      aoMap: maps.ormMap,
      roughness: 1,
      metalness: 0,
    });
    geometry = new THREE.PlaneGeometry(2, 2);
    mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
  }
  return {
    mount(state: EngineFrameState) {
      if (mesh !== null) state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      maps?.dispose();
    },
  };
}

function SurfaceMaterialPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => surfaceMaterialPreviewDraw(latest.current), [definition, variant]);
  return null;
}

/** Registers the surface material variant-tile preview: a lit 2x2-tile patch of the baked maps. @internal */
export function registerSurfaceMaterialDraw(): void {
  registerGeneratorPreview(SURFACE_MATERIAL_OUTPUT, {
    Component: SurfaceMaterialPreview,
    frame: () => ({ target: [0, 0, 0], distance: 2.3 }),
  });
}
