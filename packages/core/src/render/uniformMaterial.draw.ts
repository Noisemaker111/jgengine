import * as THREE from "three";

/**
 * A ShaderMaterial whose `uniforms` keep their declared names and value types, so a per-frame update
 * reads `material.uniforms.uTime.value` instead of an unchecked `uniforms["uTime"]` lookup.
 * @internal
 */
export class UniformMaterial<U extends Record<string, THREE.IUniform>> extends THREE.ShaderMaterial {
  declare uniforms: U;

  constructor(parameters: THREE.ShaderMaterialParameters & { uniforms: U }) {
    super(parameters);
  }
}

/** @internal */
export function requireUniform(uniforms: Record<string, THREE.IUniform>, name: string): THREE.IUniform {
  const uniform = uniforms[name];
  if (uniform === undefined) throw new Error(`shader has no uniform "${name}"`);
  return uniform;
}
