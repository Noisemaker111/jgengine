import * as THREE from "three";

/**
 * Instanced facade material for city massing walls: a `MeshStandardMaterial` whose fragment stage
 * paints procedural window strips on the side faces of every instanced unit box — floor bands from
 * the district's real `floorHeight`, window columns on a fixed pitch, and a per-cell hash that
 * dims/lights individual windows so no two facades read identical. Ground floors (plus any buried
 * foundation, via the `instanceGroundOffset` attribute) stay solid wall so street level reads as
 * storefront/lobby rather than floating glass. Same `onBeforeCompile` idiom as the grass/terrain
 * materials; instance colors keep tinting the wall exactly like the plain massing material.
 * @internal — created by `CityRenderer` for the banded-piece InstancedMesh.
 */
export function createCityWindowMaterial(options: {
  floorHeight: number;
  windowColor: string;
  roughness?: number;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: options.roughness ?? 0.82,
    metalness: 0.04,
  });
  const uniforms = {
    uFloorHeight: { value: Math.max(2, options.floorHeight) },
    uWindowColor: { value: new THREE.Color(options.windowColor) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
#include <common>
attribute float instanceGroundOffset;
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityNormal;
varying float vCityGround;
`,
      )
      .replace(
        "#include <begin_vertex>",
        `
#include <begin_vertex>
vCityLocal = position;
vCityScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vCityNormal = normal;
vCityGround = instanceGroundOffset;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
#include <common>
uniform float uFloorHeight;
uniform vec3 uWindowColor;
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityNormal;
varying float vCityGround;
float cityHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
`,
      )
      .replace(
        "#include <color_fragment>",
        `
#include <color_fragment>
{
  // Side faces only — roofs and undersides stay plain wall.
  if (abs(vCityNormal.y) < 0.5) {
    float along = abs(vCityNormal.x) > 0.5 ? (vCityLocal.z + 0.5) * vCityScale.z : (vCityLocal.x + 0.5) * vCityScale.x;
    float faceWidth = abs(vCityNormal.x) > 0.5 ? vCityScale.z : vCityScale.x;
    float up = (vCityLocal.y + 0.5) * vCityScale.y - vCityGround;
    float pitch = 2.4;
    float floorT = fract(up / uFloorHeight);
    float colT = fract(along / pitch);
    float floorIndex = floor(up / uFloorHeight);
    float colIndex = floor(along / pitch);
    bool window = up > uFloorHeight * 1.05 && floorT > 0.32 && floorT < 0.78 && colT > 0.2 && colT < 0.8
      && along > 0.7 && along < faceWidth - 0.7;
    if (window) {
      float cell = cityHash(vec2(floorIndex, colIndex) + vec2(vCityScale.x, vCityScale.z));
      vec3 pane = uWindowColor * mix(0.55, 1.25, cell);
      diffuseColor.rgb = mix(diffuseColor.rgb, pane, 0.88);
    }
    // A thin darker plinth line right above grade grounds the facade.
    if (up > 0.0 && up < 0.35) diffuseColor.rgb *= 0.8;
  }
}
`,
      );
  };
  material.customProgramCacheKey = () => `jgengine-city-windows`;
  return material;
}
