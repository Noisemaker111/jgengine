import type * as THREE from "three";

export interface GeneratorMeshSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * How a generator output family turns one output into instanceable draws. Registering one lets
 * scatter regions grow that family's variants and lets a placed marker render it, with no code per
 * generator. The geometry belongs to the caller, who disposes it; the material is shared.
 */
export type GeneratorMeshBuilder = (output: unknown) => GeneratorMeshSource[] | null;

const builders = new Map<string, GeneratorMeshBuilder>();

export function registerGeneratorMesh(output: string, build: GeneratorMeshBuilder): void {
  builders.set(output, build);
}

export function getGeneratorMesh(output: string): GeneratorMeshBuilder | undefined {
  return builders.get(output);
}
