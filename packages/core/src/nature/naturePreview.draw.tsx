import { useEffect, useMemo } from "react";

import { runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { isNatureMesh, type NatureMesh } from "./natureMesh";
import { natureGeometry, natureMaterial } from "./natureMesh.draw";
import { NATURE_OUTPUT } from "./natureGenerators";

function variantMesh({ definition, variant }: GeneratorPreviewProps): NatureMesh | null {
  const output = runGenerator(definition, variant.meta);
  return isNatureMesh(output) ? output : null;
}

function NaturePreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const mesh = useMemo(() => variantMesh({ definition, variant }), [definition, variant]);
  const geometry = useMemo(() => (mesh === null ? null : natureGeometry(mesh)), [mesh]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (geometry === null) return null;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[Math.max(1, (geometry.boundingSphere?.radius ?? 1) * 1.4), 24]} />
        <meshStandardMaterial color="#5a4b38" roughness={1} />
      </mesh>
      <mesh geometry={geometry} material={natureMaterial(mesh?.surface)} castShadow receiveShadow />
    </>
  );
}

/** Registers the nature variant-tile preview and its instanced mesh builder. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerNatureDraw(): void {
  registerGeneratorMesh(NATURE_OUTPUT, (output) => (isNatureMesh(output) ? [{ geometry: natureGeometry(output), material: natureMaterial(output.surface) }] : null));
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
