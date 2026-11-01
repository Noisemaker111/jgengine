/** Wave sum and bed lookup shared by the ocean's vertex and fragment shaders. */
const oceanCommon = `
uniform float uTime;
uniform vec2 uWaveDirections[6];
uniform vec4 uWaveParams[6];
uniform float uWavePhases[6];
uniform float uChoppiness;
uniform sampler2D uBedMap;
uniform vec4 uBedRect;
uniform float uSurfaceY;

// Water depth under a point in ocean-local XZ: the surface height minus the baked bed height.
// Outside the baked rect the bed is far below, so open sea stays deep.
float jgOceanDepth(vec2 local) {
  vec2 uv = (local - uBedRect.xy) / uBedRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1000.0;
  return uSurfaceY - texture2D(uBedMap, uv).r;
}
`;

/** GLSL vertex shader that displaces the ocean sheet by the summed Gerstner waves, in world space. */
export const oceanVertexShader = `
${oceanCommon}
uniform float uWaveCount;
uniform float uFoamThreshold;
uniform float uFoamSoftness;
uniform float uFoamCoverage;
uniform vec2 uFollow;
uniform vec2 uOrigin;

varying vec3 vWorldPosition;
varying vec2 vLocal;
varying float vCrest;
varying float vWaveHeight;
varying vec2 vOceanUv;

#include <fog_pars_vertex>

void main() {
  vOceanUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.xz += uFollow;
  vec2 local = world.xz - uOrigin;
  vLocal = local;
  float depth = jgOceanDepth(local);
  // Waves flatten as the bed shoals so swells die at the shoreline instead of clipping it.
  float depthDamp = smoothstep(0.05, 1.4, depth);
  vec3 offset = vec3(0.0);
  float crest = 0.0;
  for (int i = 0; i < 6; i++) {
    vec2 direction = normalize(uWaveDirections[i]);
    vec4 wave = uWaveParams[i];
    float k = wave.x;
    float amplitude = wave.y * depthDamp;
    float phase = k * dot(direction, local) - wave.w * uTime + uWavePhases[i];
    float sine = sin(phase);
    float horizontal = wave.z * amplitude * uChoppiness;
    offset.xz += horizontal * direction * cos(phase);
    offset.y += amplitude * sine;
    // Crest sharpness is Q·k·A·N (1 = the looping limit), not the per-wave Q, which saturates on gentle swells.
    float sharpness = clamp(wave.z * k * wave.y * uWaveCount, 0.0, 1.0);
    crest = max(crest, smoothstep(uFoamThreshold, uFoamThreshold + uFoamSoftness, sine * sharpness + uFoamCoverage * 0.35));
  }
  world.xyz += offset;
  vCrest = crest * depthDamp;
  vWaveHeight = offset.y;
  vWorldPosition = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/** GLSL fragment shader: depth colour and clarity, sky reflection, sun and moon light, crest and shore foam. */
export const oceanFragmentShader = `
${oceanCommon}
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uCrestColor;
uniform vec3 uFoamColor;
uniform float uOpacity;
uniform float uFresnelStrength;
uniform float uHorizonBlend;
uniform float uFoamIntensity;
uniform float uDepthRange;
uniform float uClarity;
uniform float uShoreFoamWidth;
uniform float uShoreWaves;
uniform float uSparkle;
uniform float uBorderFade;
uniform vec3 uSunDirection;
uniform vec3 uSun;
uniform vec3 uMoonDirection;
uniform vec3 uMoon;
uniform vec3 uAmbient;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uCover;

varying vec3 vWorldPosition;
varying vec2 vLocal;
varying float vCrest;
varying float vWaveHeight;
varying vec2 vOceanUv;

#include <fog_pars_fragment>

float jgWaterHash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)));
  uint x = q.x * 1664525u + q.y * 1013904223u;
  x = (x ^ (x >> 16u)) * 2246822519u;
  x = (x ^ (x >> 13u)) * 3266489917u;
  return float(x ^ (x >> 16u)) * (1.0 / 4294967296.0);
}

float jgWaterNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jgWaterHash(i);
  float b = jgWaterHash(i + vec2(1.0, 0.0));
  float c = jgWaterHash(i + vec2(0.0, 1.0));
  float d = jgWaterHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// The wave normal per pixel, not per vertex, so it stays sharp however coarse the far grid is.
vec3 jgWaveNormal(vec2 local, float damp) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 6; i++) {
    vec2 direction = normalize(uWaveDirections[i]);
    vec4 wave = uWaveParams[i];
    float k = wave.x;
    float amplitude = wave.y * damp;
    float phase = k * dot(direction, local) - wave.w * uTime + uWavePhases[i];
    float slope = amplitude * k * cos(phase);
    n.xz -= direction * slope;
    n.y -= wave.z * amplitude * uChoppiness * k * sin(phase);
  }
  return normalize(n);
}

void main() {
  vec3 toCamera = cameraPosition - vWorldPosition;
  float distance = length(toCamera);
  vec3 viewDirection = toCamera / max(distance, 1e-4);
  vec2 wp = vWorldPosition.xz;
  float depth = jgOceanDepth(vLocal);
  float damp = smoothstep(0.05, 1.4, depth);

  // Fine detail fades with distance so the far sea does not shimmer.
  float near = 1.0 - smoothstep(60.0, 900.0, distance);
  vec3 normal = jgWaveNormal(vLocal, damp);
  float ripple1 = jgWaterNoise(wp * 1.7 + vec2(uTime * 0.22, uTime * 0.15));
  float ripple2 = jgWaterNoise(wp * 3.1 - vec2(uTime * 0.17, uTime * 0.26));
  normal = normalize(normal + vec3(ripple1 - 0.5, 0.0, ripple2 - 0.5) * 0.14 * near);
  normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), (1.0 - near) * 0.6));
  if (!gl_FrontFacing) normal = -normal;

  // Light on and in the water, from the sky that owns the scene.
  vec3 sunDir = normalize(uSunDirection);
  vec3 moonDir = normalize(uMoonDirection);
  vec3 light = uAmbient + uSun * max(sunDir.y, 0.0) + uMoon * max(moonDir.y, 0.0);
  light *= 0.3183;

  // Body colour: shallow tone over the shelf, deep tone further out.
  float depthMix = smoothstep(0.0, max(uDepthRange, 0.001), depth);
  vec3 waterColor = mix(uShallowColor, uDeepColor, depthMix);
  waterColor = mix(waterColor, uCrestColor, smoothstep(0.15, 1.2, vWaveHeight) * 0.22);
  vec3 body = waterColor * light;

  // Reflection: the sky's own colours, by how far up the reflected ray points.
  float facing = max(dot(normal, viewDirection), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  fresnel = min(fresnel * uFresnelStrength / 0.7, 1.0);
  vec3 reflected = reflect(-viewDirection, normal);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(reflected.y, 0.0, 1.0), 0.6));
  vec3 color = mix(body, sky, fresnel);
  float horizon = smoothstep(0.0, 1.0, 1.0 - abs(normal.y));
  color = mix(color, uHorizon, horizon * uHorizonBlend * 0.3);

  // The sun's (and the moon's) reflection: a hot core plus a broad sheen, cut by cloud.
  float clear = 1.0 - uCover * 0.85;
  float sunSpec = pow(max(dot(reflected, sunDir), 0.0), 900.0) * 30.0 + pow(max(dot(reflected, sunDir), 0.0), 60.0) * 0.25;
  float glintMask = mix(1.0, smoothstep(0.55, 0.9, jgWaterNoise(wp * 2.3 + vec2(uTime * 0.4, -uTime * 0.31))), near);
  color += uSun * sunSpec * glintMask * uSparkle * clear * step(0.0, sunDir.y);
  float moonSpec = pow(max(dot(reflected, moonDir), 0.0), 400.0) * 12.0;
  color += uMoon * moonSpec * clear * step(0.0, moonDir.y);

  // Foam: crest foam out at sea, a thin lick at the waterline, a swash line that runs up the beach and
  // back, and lines that roll in over the shallows. All of it is measured in depth, so on a gentle
  // shelf it stays a line instead of covering the whole shallows.
  float foamNoise = jgWaterNoise(wp * 2.6 + vec2(uTime * 0.28, uTime * 0.2));
  float lace = smoothstep(0.3, 0.75, jgWaterNoise(wp * 0.9 + vec2(-uTime * 0.12, uTime * 0.09))) * smoothstep(0.2, 0.6, foamNoise);
  float shoreWidth = max(uShoreFoamWidth, 0.001);
  float swash = (0.5 + 0.5 * sin(uTime * 0.7 + jgWaterNoise(wp * 0.15) * 6.0)) * shoreWidth;
  float lick = 1.0 - smoothstep(0.0, shoreWidth * 0.3, depth);
  float front = 1.0 - smoothstep(0.0, shoreWidth * 0.12, abs(depth - swash));
  float shoreFoam = max(lick, front * 0.85) * lace;
  float shelf = 1.0 - smoothstep(0.2, 2.2, depth);
  float roll = sin(depth * 4.5 + uTime * 1.6 + jgWaterNoise(wp * 0.21) * 6.0);
  float rollFoam = smoothstep(0.82, 0.97, roll) * shelf * smoothstep(0.3, 0.75, foamNoise) * uShoreWaves * step(0.03, depth);
  float crestFoam = clamp(vCrest * uFoamIntensity, 0.0, 1.0) * smoothstep(0.35, 0.75, foamNoise);
  float foam = clamp(shoreFoam + rollFoam + crestFoam, 0.0, 1.0);
  color = mix(color, uFoamColor * light * 1.15, foam);

  // Clarity: thin water shows the bed, deeper water takes its colour; reflection and foam stay opaque.
  float seen = 1.0 - exp(-max(depth, 0.0) / max(uClarity, 0.05));
  float alpha = uOpacity * max(seen, fresnel) + foam * 0.6;
  alpha *= smoothstep(-0.02, 0.18, depth);
  // A bounded sheet's border always dissolves, so the water never ends in a straight cut.
  float borderDist = min(min(vOceanUv.x, 1.0 - vOceanUv.x), min(vOceanUv.y, 1.0 - vOceanUv.y));
  alpha *= mix(1.0, smoothstep(0.0, 0.045, borderDist), uBorderFade);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
