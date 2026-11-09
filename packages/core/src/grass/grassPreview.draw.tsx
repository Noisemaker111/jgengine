import { useRef } from "react";
import * as THREE from "three";

import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import type { GeneratorVariant } from "@jgengine/core/generator/generator";
import { GRASS_FIELD_OUTPUT, readGrassLook, type GrassLook } from "@jgengine/core/grass/grassKind";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { grassPatchDraw, type GrassPatchProps } from "./GrassPatch.draw";

const SOIL = "#5d4b36";
const SAND = "#c9b48a";

/** Side of the square a grass preview grows, sized so a putting green, a lawn and tall savanna all read. */
function previewSide(look: GrassLook): number {
  return Math.max(2.5, Math.min(9, look.blade.bladeHeight * 5), Math.min(10, look.mowing.stripeWidth * 2.5));
}

function previewGround(look: GrassLook): string {
  return look.growth.groundCover < 0.4 ? SAND : SOIL;
}

interface PreviewDerived {
  look: GrassLook;
  side: number;
  area: readonly [number, number];
  ground: string;
  seed: string;
}

function derivePreview(variant: GeneratorVariant): PreviewDerived {
  const look = readGrassLook(variant.meta);
  const side = previewSide(look);
  return { look, side, area: [side, side], ground: previewGround(look), seed: variant.seed };
}

/** Soil/sand plinth plus the grass patch, as one draw under the preview tile's camera. @internal */
export function grassPreviewDraw(getVariant: () => GeneratorVariant): EngineDraw {
  const group = new THREE.Group();
  let plane: { mesh: THREE.Mesh; geometry: THREE.PlaneGeometry; material: THREE.MeshStandardMaterial } | null = null;
  let derivedFor: GeneratorVariant | null = null;
  let derived: PreviewDerived | null = null;
  let patch: EngineDraw | null = null;
  let patchState: EngineFrameState | null = null;

  const current = (): PreviewDerived => {
    const variant = getVariant();
    if (variant !== derivedFor || derived === null) {
      derivedFor = variant;
      derived = derivePreview(variant);
    }
    return derived;
  };

  const syncMesh = () => {
    const d = current();
    if (plane !== null) {
      if (plane.geometry.parameters.width !== d.side * 3) {
        const geometry = new THREE.PlaneGeometry(d.side * 3, d.side * 3);
        plane.mesh.geometry = geometry;
        plane.geometry.dispose();
        plane.geometry = geometry;
      }
      plane.material.color.set(d.ground);
      return;
    }
    const geometry = new THREE.PlaneGeometry(d.side * 3, d.side * 3);
    const material = new THREE.MeshStandardMaterial({ color: d.ground, roughness: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.01;
    group.add(mesh);
    plane = { mesh, geometry, material };
  };

  const patchProps = (): GrassPatchProps => {
    const d = current();
    return { look: d.look, area: d.area, seed: d.seed, edgeFeather: d.side * 0.08, groundColor: d.ground };
  };

  return {
    mount(state: EngineFrameState) {
      syncMesh();
      state.scene.add(group);
      patch = grassPatchDraw(patchProps);
      patchState = childFrameState(state, group);
      patch.mount?.(patchState);
    },
    frame(state: EngineFrameState) {
      syncMesh();
      if (patch !== null && patchState !== null) patch.frame?.(childFrameState(state, group));
    },
    update(state: EngineFrameState) {
      syncMesh();
      if (patch !== null && patchState !== null) patch.update?.(childFrameState(state, group));
    },
    dispose(state: EngineFrameState) {
      if (patch !== null && patchState !== null) patch.dispose?.(patchState);
      patch = null;
      patchState = null;
      if (plane !== null) {
        plane.geometry.dispose();
        plane.material.dispose();
        group.remove(plane.mesh);
        plane = null;
      }
      state.scene.remove(group);
      group.clear();
      derivedFor = null;
      derived = null;
    },
  };
}

function GrassPreview({ variant }: GeneratorPreviewProps) {
  const latest = useRef(variant);
  latest.current = variant;
  return <EngineDrawMount create={() => grassPreviewDraw(() => latest.current)} deps={[variant]} />;
}

/** Registers the variant-tile preview for grass looks. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerGrassPreview(): void {
  registerGeneratorPreview(GRASS_FIELD_OUTPUT, {
    Component: GrassPreview,
    frame: ({ variant }) => {
      const look = readGrassLook(variant.meta);
      return { target: [0, look.blade.bladeHeight * 0.3, 0], distance: previewSide(look) * 1.15 };
    },
  });
}
