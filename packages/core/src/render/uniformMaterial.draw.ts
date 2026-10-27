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

/**
 * The uniform `name` from a shader whose uniforms are untyped (a three-stdlib pass clones them into a
 * plain record); throws when the shader does not declare it, which is a shader/code mismatch.
 * @internal
 */
export function requireUniform(uniforms: Record<string, THREE.IUniform>, name: string): THREE.IUniform {
  const uniform = uniforms[name];
  if (uniform === undefined) throw new Error(`shader has no uniform "${name}"`);
  return uniform;
}
