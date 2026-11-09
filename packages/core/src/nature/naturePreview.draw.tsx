import { useRef } from "react";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { isNatureMesh, type NatureMesh } from "./natureMesh";
import { natureDraws } from "./natureMesh.draw";
import { NATURE_OUTPUT } from "./natureGenerators";

function variantMesh({ definition, variant }: GeneratorPreviewProps): NatureMesh | null {
  const output = runGenerator(definition, variant.meta);
  return isNatureMesh(output) ? output : null;
}

export function naturePreviewDraw({ definition, variant }: GeneratorPreviewProps): EngineDraw {
  const mesh = variantMesh({ definition, variant });
  const draws = mesh === null ? null : natureDraws(mesh);
  const group = new THREE.Group();
  let groundGeometry: THREE.BufferGeometry | null = null;
  let groundMaterial: THREE.Material | null = null;
  if (draws !== null && draws[0] !== undefined) {
    groundGeometry = new THREE.CircleGeometry(Math.max(1, (draws[0].geometry.boundingSphere?.radius ?? 1) * 1.4), 24);
    groundMaterial = new THREE.MeshStandardMaterial({ color: "#5a4b38", roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    group.add(ground);
    for (const draw of draws) {
      const item = new THREE.Mesh(draw.geometry, draw.material);
      item.castShadow = true;
      item.receiveShadow = true;
      group.add(item);
    }
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      groundGeometry?.dispose();
      groundMaterial?.dispose();
      for (const draw of draws ?? []) draw.geometry.dispose();
    },
  };
}

function NaturePreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => naturePreviewDraw(latest.current), [definition, variant]);
  return null;
}

/** Registers the nature variant-tile preview and its instanced mesh builder. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerNatureDraw(): void {
  registerGeneratorMesh(NATURE_OUTPUT, (output) => (isNatureMesh(output) ? natureDraws(output) : null));
  registerGeneratorPreview(NATURE_OUTPUT, {
    Component: NaturePreview,
    frame: (props) => {
      const mesh = variantMesh(props);
      if (mesh === null) return { target: [0, 1, 0], distance: 4 };
      const { min, max } = mesh.bounds;
      const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.2);
      return { target: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], distance: extent * 1.7 };
    },
  });
}
