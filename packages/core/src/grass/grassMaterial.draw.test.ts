import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { readGrassLook } from "@jgengine/core/grass/grassKind";
import { createGrassMaterial, grassStyleLighting } from "@jgengine/core/grass/grassMaterial.draw";

/** The shader three would compile for a material: its program key plus the patched sources. */
function compiled(material: THREE.Material): { key: string; vertex: string; fragment: string } {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  // type-escape: onBeforeCompile reads only the three fields set above.
  material.onBeforeCompile(shader as never, undefined as never);
  return { key: material.customProgramCacheKey(), vertex: shader.vertexShader, fragment: shader.fragmentShader };
}

describe("grass style shading", () => {
  test("every style compiles to the same shader, so moving a slider after warmup compiles nothing", () => {
    const styles = [
      undefined,
      { realism: 0 },
      { realism: 1 },
      { shading: 0, colourSteps: 1, saturation: 1, contrast: 0, outline: 1 },
      { shading: 1, colourSteps: 0, saturation: 0, contrast: 1, outline: 0 },
    ];
    const shaders = styles.map((style) => compiled(createGrassMaterial(readGrassLook({ species: "meadow", ...(style === undefined ? {} : { style }) })).material));
    for (const shader of shaders) expect(shader).toEqual(shaders[0]!);
    // The style reaches the shader through uniforms the patched fragment reads.
    expect(shaders[0]!.fragment).toContain("uniform vec4 uStyleLook;");
    expect(shaders[0]!.fragment).toContain("uniform vec2 uStyleColour;");
  });

  test("the cartoon end bands the light, steps the colour, brightens it and inks the edges; the photoreal end glosses it", () => {
    const cartoon = grassStyleLighting(readGrassLook({ species: "meadow" }, { realism: 0 }));
    expect(cartoon.look.x).toBe(1);
    expect(cartoon.look.y).toBe(0);
    expect(cartoon.look.z).toBe(1);
    expect(cartoon.look.w).toBeCloseTo(0.6, 10);
    expect(cartoon.colour.x).toBeGreaterThan(1);
    expect(cartoon.colour.y).toBeGreaterThan(1);
    const real = grassStyleLighting(readGrassLook({ species: "meadow" }, { realism: 1 }));
    expect(real.look.toArray()).toEqual([0, 1, 0, 0]);
    // Real grass keeps its saturation; only the gradient softens.
    expect(real.colour.x).toBe(1);
    expect(real.colour.y).toBeLessThan(1);
  });

  test("a slider set by hand reaches its uniform", () => {
    const material = createGrassMaterial(readGrassLook({ species: "meadow", style: { outline: 0.4, saturation: 1 } }));
    expect(material.uniforms.uStyleLook.value.w).toBeCloseTo(0.4, 10);
    expect(material.uniforms.uStyleColour.value.x).toBeCloseTo(1.6, 10);
  });
});
