import { useMemo, useRef } from "react";
import * as THREE from "three";

import { runGenerator, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

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
export function generatorMeshInstanceDraw({ definition, meta, fallbackSeed, position = [0, 0, 0], rotationY = 0 }: GeneratorMeshInstanceProps): EngineDraw {
  const sources = getGeneratorMesh(definition.output)?.(runGenerator(definition, meta, { fallbackSeed })) ?? [];
  let group: THREE.Group | null = null;
  return {
    mount(state: EngineFrameState) {
      if (sources.length === 0) return;
      group = new THREE.Group();
      group.position.set(position[0], position[1], position[2]);
      group.rotation.y = rotationY;
      for (const source of sources) {
        const mesh = new THREE.Mesh(source.geometry, source.material);
        mesh.castShadow = source.castShadow ?? true;
        mesh.receiveShadow = source.receiveShadow ?? true;
        group.add(mesh);
      }
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      if (group !== null) state.scene.remove(group);
      for (const source of sources) source.geometry.dispose();
      group = null;
    },
  };
}

export function GeneratorMeshInstance(props: GeneratorMeshInstanceProps) {
  const { definition, meta, fallbackSeed, position, rotationY } = props;
  const key = useMemo(() => JSON.stringify([definition, meta, fallbackSeed, position, rotationY]), [definition, meta, fallbackSeed, position, rotationY]);
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => generatorMeshInstanceDraw(latest.current), [key]);
  return null;
}
