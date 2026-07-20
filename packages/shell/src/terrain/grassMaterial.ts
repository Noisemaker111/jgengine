import * as THREE from "three";

export interface GrassWindOptions {
  direction?: readonly [x: number, z: number];
  strength?: number;
  speed?: number;
  gustScale?: number;
  flutter?: number;
  /**
   * Layered rolling gust field: three phase-offset directional waves (one carrying a cross-wind
   * component) instead of a single sine, so visible wave fronts sweep the meadow. Default true.
   * `false` restores the single-sine gust. Compile-time variation — folded into the program cache key.
   */
  layered?: boolean;
}

/** Camera-distance fade band: tufts thin out between `start` and `end` meters, so the instance budget spends where the camera lives. */
export interface GrassDistanceFadeOptions {
  start?: number;
  end?: number;
}

export interface GrassMaterialOptions {
  colorBase?: THREE.ColorRepresentation;
  colorTip?: THREE.ColorRepresentation;
  /** Ground color the blade roots blend into (pass the terrain color under the patch so blades grow *out of* the ground instead of floating on it). Defaults to a darkened `colorBase`. */
  colorGround?: THREE.ColorRepresentation;
  colorVariation?: number;
  wind?: GrassWindOptions | false;
  /** Distance thinning; `false` disables. Default fades between 55 m and 150 m so meadows read expansive. */
  distanceFade?: GrassDistanceFadeOptions | false;
  /** 0..1 blend of blade normals toward straight-up — lit like a soft carpet instead of dark individual planes. Default 0.6. */
  normalLift?: number;
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
  uColorGround: THREE.IUniform<THREE.Color>;
  uColorVariation: THREE.IUniform<number>;
  uDistanceFade: THREE.IUniform<THREE.Vector2>;
  uNormalLift: THREE.IUniform<number>;
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
  layered: true,
};

/** Default camera-distance fade band: tufts start thinning at 55 m and are gone by 150 m so the meadow reads deep. */
export const DEFAULT_GRASS_DISTANCE_FADE: Required<GrassDistanceFadeOptions> = {
  start: 55,
  end: 150,
};

function normalizeWindDirection(direction: readonly [number, number]): THREE.Vector2 {
  const vector = new THREE.Vector2(direction[0], direction[1]);
  return vector.lengthSq() === 0 ? new THREE.Vector2(1, 0) : vector.normalize();
}

/** @internal */
export function resolveGrassWind(wind: GrassWindOptions | false | undefined): Required<GrassWindOptions> {
  if (wind === false) return { ...DEFAULT_GRASS_WIND, strength: 0, flutter: 0 };
  return {
    direction: wind?.direction ?? DEFAULT_GRASS_WIND.direction,
    strength: wind?.strength ?? DEFAULT_GRASS_WIND.strength,
    speed: wind?.speed ?? DEFAULT_GRASS_WIND.speed,
    gustScale: wind?.gustScale ?? DEFAULT_GRASS_WIND.gustScale,
    flutter: wind?.flutter ?? DEFAULT_GRASS_WIND.flutter,
    layered: wind?.layered ?? DEFAULT_GRASS_WIND.layered,
  };
}

/** @internal */
export function resolveGrassDistanceFade(fade: GrassDistanceFadeOptions | false | undefined): Required<GrassDistanceFadeOptions> {
  // start >= end disables the fade in the shader, so "off" is just an empty band.
  if (fade === false) return { start: 0, end: 0 };
  return {
    start: fade?.start ?? DEFAULT_GRASS_DISTANCE_FADE.start,
    end: fade?.end ?? DEFAULT_GRASS_DISTANCE_FADE.end,
  };
}

/** @internal */
export function createGrassMaterial(options: GrassMaterialOptions = {}): GrassMaterialHandle {
  const wind = resolveGrassWind(options.wind);
  const fade = resolveGrassDistanceFade(options.distanceFade);
  const colorBase = new THREE.Color(options.colorBase ?? "#2d431f");
  const colorGround =
    options.colorGround === undefined
      ? colorBase.clone().multiplyScalar(0.82)
      : new THREE.Color(options.colorGround);
  const uniforms: GrassShaderUniforms = {
    uTime: { value: 0 },
    uWindDirection: { value: normalizeWindDirection(wind.direction) },
    uWindStrength: { value: wind.strength },
    uWindSpeed: { value: wind.speed },
    uWindGustScale: { value: wind.gustScale },
    uWindFlutter: { value: wind.flutter },
    uColorBase: { value: colorBase },
    uColorTip: { value: new THREE.Color(options.colorTip ?? "#a6cc58") },
    uColorGround: { value: colorGround },
    uColorVariation: { value: options.colorVariation ?? 0.28 },
    uDistanceFade: { value: new THREE.Vector2(fade.start, fade.end) },
    uNormalLift: { value: THREE.MathUtils.clamp(options.normalLift ?? 0.6, 0, 1) },
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
attribute vec2 bladeOffset;
attribute vec4 bladeVary;
attribute float bladeBendScale;
uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindGustScale;
uniform float uWindFlutter;
uniform vec2 uDistanceFade;
uniform float uNormalLift;
varying float vGrassBladeT;
varying float vGrassColorMix;
varying float vGrassFade;
vec3 jgGrassPosition;
vec3 jgGrassNormal;
void jgComputeGrassBlade() {
  float t = position.y;
  float side = position.x;
  // Camera-distance thinning: each tuft draws a random threshold, so the field dissolves
  // progressively across the fade band instead of ending at a hard curtain.
  float camDist = distance((modelMatrix * vec4(instanceOffset, 1.0)).xyz, cameraPosition);
  float fadeT = uDistanceFade.y > uDistanceFade.x
    ? smoothstep(uDistanceFade.x, uDistanceFade.y, camDist)
    : 0.0;
  float threshold = fract(instanceColorMix * 61.7) * 0.85;
  float keep = 1.0 - smoothstep(threshold, threshold + 0.15, fadeT);
  float heightScale = instanceHeight * bladeVary.y * keep;
  // Paddle taper: hold width through the mid-blade and only pinch near the tip — thin
  // triangle blades leave the ground visible between tufts and read as stubble.
  float taper = (1.0 - 0.3 * t) * (1.0 - smoothstep(0.5, 1.0, t) * 0.95);
  // Surviving distant tufts widen to hold silhouette coverage as neighbors thin out.
  float width = instanceWidth * bladeVary.z * taper * (1.0 + fadeT * 1.4);
  float arc = instanceBend * bladeBendScale * t * t;
  vec3 localPosition = vec3(side * width, heightScale * t - arc * heightScale * 0.18, arc * heightScale);
  vec3 localNormal = normalize(vec3(0.0, -instanceBend * bladeBendScale * t, 1.0));
  float bladeYaw = instanceYaw + bladeVary.x;
  float cy = cos(bladeYaw);
  float sy = sin(bladeYaw);
  vec3 yawedPosition = vec3(localPosition.x * cy + localPosition.z * sy, localPosition.y, -localPosition.x * sy + localPosition.z * cy);
  vec3 yawedNormal = normalize(vec3(localNormal.x * cy + localNormal.z * sy, localNormal.y, -localNormal.x * sy + localNormal.z * cy));
  float ct = cos(instanceYaw);
  float st = sin(instanceYaw);
  vec3 tuftOffset = vec3(bladeOffset.x * ct + bladeOffset.y * st, 0.0, -bladeOffset.x * st + bladeOffset.y * ct);
  float gustPhase = dot(instanceOffset.xz, uWindDirection) * uWindGustScale + uTime * uWindSpeed + instancePhase;
${
  wind.layered
    ? `  // Layered rolling gust field: three phase-offset directional waves, one carrying a cross-wind
  // term, so coherent wave fronts sweep across the meadow instead of every tuft waving in place.
  vec2 windPerp = vec2(-uWindDirection.y, uWindDirection.x);
  float crossPhase = dot(instanceOffset.xz, windPerp) * uWindGustScale * 0.6;
  float gust = sin(gustPhase) * 0.55
    + sin(gustPhase * 0.53 + crossPhase + 2.1) * 0.32
    + sin(gustPhase * 1.7 + crossPhase * 0.4 + 4.3) * 0.13;`
    : `  float gust = sin(gustPhase) * 0.7 + sin(gustPhase * 0.43 + 2.4) * 0.3;`
}
  float flutter = sin(uTime * 7.5 + instancePhase * 2.7 + bladeVary.w * 6.2832) * uWindFlutter;
  vec2 windOffset = uWindDirection * (gust * uWindStrength + flutter) * t * t * (0.4 + 0.6 * bladeVary.y);
  jgGrassPosition = instanceOffset + tuftOffset + yawedPosition + vec3(windOffset.x, 0.0, windOffset.y);
  // Lifting normals toward straight-up lights the field like a continuous meadow surface —
  // side-lit individual blade planes read as dark stubble, not turf.
  jgGrassNormal = normalize(mix(yawedNormal, vec3(0.0, 1.0, 0.0), uNormalLift));
  vGrassBladeT = t;
  vGrassColorMix = instanceColorMix;
  vGrassFade = fadeT;
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
uniform vec3 uColorGround;
uniform float uColorVariation;
varying float vGrassBladeT;
varying float vGrassColorMix;
varying float vGrassFade;
`,
      )
      .replace(
        "#include <color_fragment>",
        `
#include <color_fragment>
vec3 grassColor = mix(uColorBase, uColorTip, smoothstep(0.0, 1.0, vGrassBladeT));
grassColor *= mix(1.0 - uColorVariation, 1.0 + uColorVariation, vGrassColorMix);
// Roots take the ground color so blades grow out of the terrain instead of floating on it,
// and distant blades converge back toward it so the fade band blends into the mottled ground.
grassColor = mix(uColorGround, grassColor, smoothstep(0.0, 0.55, vGrassBladeT));
grassColor = mix(grassColor, uColorGround * 1.04, vGrassFade * 0.6);
diffuseColor.rgb = grassColor;
`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `
#include <lights_fragment_end>
// Warm tip sheen / backscatter: blade tips lift toward a warm glow, scaled by how strongly the
// fragment is directly lit — a cheap stand-in for sun shining through the canopy, no extra lights.
float jgTipMask = smoothstep(0.55, 1.0, vGrassBladeT);
float jgLit = clamp(dot(reflectedLight.directDiffuse, vec3(0.3333)) * 1.6, 0.0, 1.0);
reflectedLight.directDiffuse += vec3(0.34, 0.28, 0.12) * jgTipMask * jgLit * (1.0 - vGrassFade * 0.7);
`,
      );
  };

  // Only the layered-gust branch changes the compiled shader source, so it is the sole compile-time key.
  material.customProgramCacheKey = () => `jgengine-grass-${wind.layered ? "layered" : "single"}`;
  return { material, uniforms };
}
