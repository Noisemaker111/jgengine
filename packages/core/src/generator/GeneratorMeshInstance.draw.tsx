import { useEffect, useMemo } from "react";

import { runGenerator, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";

/** Props for {@link GeneratorMeshInstance}. */
export interface GeneratorMeshInstanceProps {
  definition: GeneratorDefinition;
  /** The placed object's `meta`: params and seed. */
  meta: Record<string, unknown> | undefined;
  /** Seed used when `meta` carries none, e.g. the object id. */
  fallbackSeed: string;
  position?: readonly [number, number, number];
  rotationY?: number;
}

/**
 * One placed generator instance drawn through the mesh builder registered for its output family
 * (`registerGeneratorMesh`), regrown from its params and seed. Null when the family has no builder.
 */
export function GeneratorMeshInstance({ definition, meta, fallbackSeed, position = [0, 0, 0], rotationY = 0 }: GeneratorMeshInstanceProps) {
  const sources = useMemo(() => getGeneratorMesh(definition.output)?.(runGenerator(definition, meta, { fallbackSeed })) ?? [], [definition, meta, fallbackSeed]);
  useEffect(() => () => sources.forEach((source) => source.geometry.dispose()), [sources]);
  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]}>
      {sources.map((source, index) => (
        <mesh key={index} geometry={source.geometry} material={source.material} castShadow={source.castShadow ?? true} receiveShadow={source.receiveShadow ?? true} />
      ))}
    </group>
  );
}
