import { useRef } from "react";
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
export function generatorMeshInstanceDraw(getProps: () => GeneratorMeshInstanceProps): EngineDraw {
  const props = getProps();
  const { definition, meta, fallbackSeed } = props;
  const sources = getGeneratorMesh(definition.output)?.(runGenerator(definition, meta, { fallbackSeed })) ?? [];
  let group: THREE.Group | null = null;
  return {
    mount(state: EngineFrameState) {
      if (sources.length === 0) return;
      group = new THREE.Group();
      for (const source of sources) {
        const mesh = new THREE.Mesh(source.geometry, source.material);
        mesh.castShadow = source.castShadow ?? true;
        mesh.receiveShadow = source.receiveShadow ?? true;
        group.add(mesh);
      }
      state.scene.add(group);
    },
    frame(_state: EngineFrameState) {
      if (group === null) return;
      const current = getProps();
      const [px, py, pz] = current.position ?? [0, 0, 0];
      group.position.set(px, py, pz);
      group.rotation.y = current.rotationY ?? 0;
    },
    dispose(state: EngineFrameState) {
      if (group !== null) state.scene.remove(group);
      for (const source of sources) source.geometry.dispose();
      group = null;
    },
  };
}

export function GeneratorMeshInstance(props: GeneratorMeshInstanceProps) {
  const { definition, meta, fallbackSeed } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => generatorMeshInstanceDraw(() => latest.current), [definition, meta, fallbackSeed]);
  return null;
}
