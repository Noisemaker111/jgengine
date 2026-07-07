import * as THREE from "three";

export interface GrassWindOptions {
  direction?: readonly [x: number, z: number];
  strength?: number;
  speed?: number;
  gustScale?: number;
  flutter?: number;
}

export interface GrassMaterialOptions {
  colorBase?: THREE.ColorRepresentation;
  colorTip?: THREE.ColorRepresentation;
  colorVariation?: number;
  wind?: GrassWindOptions | false;
  roughness?: number;
}

export interface GrassShaderUniforms {
  uTime: THREE.IUniform<number>;
  uWindDirection: THREE.IUniform<THREE.Vector2>;
  uWindStrength: THREE.IUniform<number>;
  uWindSpeed: THREE.IUniform<number>;
  uWindGustScale: THREE.IUniform<number>;
  uWindFlutter: THREE.IUniform<number>;
  uColorBase: THREE.IUniform<THREE.Color>;
  uColorTip: THREE.IUniform<THREE.Color>;
  uColorVariation: THREE.IUniform<number>;
}

export interface GrassMaterialHandle {
  material: THREE.MeshStandardMaterial;
  uniforms: GrassShaderUniforms;
}

export const DEFAULT_GRASS_WIND: Required<GrassWindOptions> = {
  direction: [1, 0.35],
  strength: 0.22,
  speed: 1.6,
  gustScale: 0.16,
  flutter: 0.08,
};

function normalizeWindDirection(direction: readonly [number, number]): THREE.Vector2 {
  const vector = new THREE.Vector2(direction[0], direction[1]);
  return vector.lengthSq() === 0 ? new THREE.Vector2(1, 0) : vector.normalize();
}

export function resolveGrassWind(wind: GrassWindOptions | false | undefined): Required<GrassWindOptions> {
  if (wind === false) return { ...DEFAULT_GRASS_WIND, strength: 0, flutter: 0 };
  return {
    direction: wind?.direction ?? DEFAULT_GRASS_WIND.direction,
    strength: wind?.strength ?? DEFAULT_GRASS_WIND.strength,
    speed: wind?.speed ?? DEFAULT_GRASS_WIND.speed,
    gustScale: wind?.gustScale ?? DEFAULT_GRASS_WIND.gustScale,
    flutter: wind?.flutter ?? DEFAULT_GRASS_WIND.flutter,
  };
}

export function createGrassMaterial(options: GrassMaterialOptions = {}): GrassMaterialHandle {
  const wind = resolveGrassWind(options.wind);
  const uniforms: GrassShaderUniforms = {
    uTime: { value: 0 },
    uWindDirection: { value: normalizeWindDirection(wind.direction) },
    uWindStrength: { value: wind.strength },
    uWindSpeed: { value: wind.speed },
    uWindGustScale: { value: wind.gustScale },
    uWindFlutter: { value: wind.flutter },
    uColorBase: { value: new THREE.Color(options.colorBase ?? "#2d431f") },
    uColorTip: { value: new THREE.Color(options.colorTip ?? "#a6cc58") },
    uColorVariation: { value: options.colorVariation ?? 0.28 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    roughness: options.roughness ?? 0.82,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
#include <common>
attribute vec3 instanceOffset;
attribute float instanceYaw;
attribute float instanceHeight;
attribute float instanceWidth;
attribute float instanceBend;
attribute float instancePhase;
attribute float instanceColorMix;
uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindGustScale;
uniform float uWindFlutter;
varying float vGrassBladeT;
varying float vGrassColorMix;
vec3 jgGrassPosition;
vec3 jgGrassNormal;
void jgComputeGrassBlade() {
  float t = position.y;
  float side = position.x;
  float taper = (1.0 - t) * (0.72 + 0.28 * (1.0 - t));
  float width = instanceWidth * taper;
  float arc = instanceBend * t * t;
  vec3 localPosition = vec3(side * width, instanceHeight * t - arc * instanceHeight * 0.18, arc * instanceHeight);
  vec3 localNormal = normalize(vec3(0.0, -instanceBend * t, 1.0));
  float cy = cos(instanceYaw);
  float sy = sin(instanceYaw);
  vec3 yawedPosition = vec3(localPosition.x * cy + localPosition.z * sy, localPosition.y, -localPosition.x * sy + localPosition.z * cy);
  vec3 yawedNormal = normalize(vec3(localNormal.x * cy + localNormal.z * sy, localNormal.y, -localNormal.x * sy + localNormal.z * cy));
  float gustPhase = dot(instanceOffset.xz, uWindDirection) * uWindGustScale + uTime * uWindSpeed + instancePhase;
  float gust = sin(gustPhase) * 0.7 + sin(gustPhase * 0.43 + 2.4) * 0.3;
  float flutter = sin(uTime * 7.5 + instancePhase * 2.7) * uWindFlutter;
  vec2 windOffset = uWindDirection * (gust * uWindStrength + flutter) * t * t;
  jgGrassPosition = instanceOffset + yawedPosition + vec3(windOffset.x, 0.0, windOffset.y);
  jgGrassNormal = yawedNormal;
  vGrassBladeT = t;
  vGrassColorMix = instanceColorMix;
}
`,
      )
      .replace("#include <beginnormal_vertex>", "jgComputeGrassBlade();\nvec3 objectNormal = jgGrassNormal;")
      .replace("#include <begin_vertex>", "vec3 transformed = jgGrassPosition;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
#include <common>
uniform vec3 uColorBase;
uniform vec3 uColorTip;
uniform float uColorVariation;
varying float vGrassBladeT;
varying float vGrassColorMix;
`,
      )
      .replace(
        "#include <color_fragment>",
        `
#include <color_fragment>
vec3 grassColor = mix(uColorBase, uColorTip, smoothstep(0.0, 1.0, vGrassBladeT));
grassColor *= mix(1.0 - uColorVariation, 1.0 + uColorVariation, vGrassColorMix);
grassColor *= mix(0.58, 1.0, smoothstep(0.05, 0.45, vGrassBladeT));
diffuseColor.rgb = grassColor;
`,
      );
  };

  material.customProgramCacheKey = () => `jgengine-grass-${wind.strength}-${wind.flutter}`;
  return { material, uniforms };
}
