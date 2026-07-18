export const oceanVertexShader = `
uniform float uTime;
uniform vec2 uWaveDirections[6];
uniform vec4 uWaveParams[6];
uniform float uChoppiness;
uniform float uFoamThreshold;
uniform float uFoamSoftness;
uniform float uFoamCoverage;

attribute float aDepth;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveHeight;
varying float vDepth;
varying vec2 vOceanUv;

void main() {
  vOceanUv = uv;
  vec3 displaced = position;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 bitangent = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  // Waves flatten as the bed shoals so swells die at the shoreline instead of clipping it.
  float depthDamp = smoothstep(0.05, 1.4, aDepth);

  for (int i = 0; i < 6; i++) {
    vec2 direction = normalize(uWaveDirections[i]);
    vec4 wave = uWaveParams[i];
    float k = wave.x;
    float amplitude = wave.y * depthDamp;
    float steepness = wave.z;
    float omega = wave.w;
    float phase = k * dot(direction, position.xz) - omega * uTime;
    float sine = sin(phase);
    float cosine = cos(phase);
    float horizontal = steepness * amplitude * uChoppiness;
    displaced.x += horizontal * direction.x * cosine;
    displaced.z += horizontal * direction.y * cosine;
    displaced.y += amplitude * sine;
    float slopeTerm = horizontal * k * sine;
    tangent += vec3(-slopeTerm * direction.x * direction.x, amplitude * k * direction.x * cosine, -slopeTerm * direction.x * direction.y);
    bitangent += vec3(-slopeTerm * direction.x * direction.y, amplitude * k * direction.y * cosine, -slopeTerm * direction.y * direction.y);
    crest = max(crest, smoothstep(uFoamThreshold, uFoamThreshold + uFoamSoftness, sine * steepness + uFoamCoverage * 0.35));
  }

  vNormal = normalize(cross(bitangent, tangent));
  vCrest = crest;
  vWaveHeight = displaced.y;
  vDepth = aDepth;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const oceanFragmentShader = `
uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uCrestColor;
uniform vec3 uFoamColor;
uniform float uOpacity;
uniform float uFresnelStrength;
uniform float uHorizonBlend;
uniform float uFoamIntensity;
uniform float uDepthRange;
uniform float uShoreFoamWidth;
uniform float uSparkle;
uniform vec3 uSunDirection;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveHeight;
varying float vDepth;
varying vec2 vOceanUv;

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

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

  // Fine scrolling normal perturbation: two counter-drifting noise layers ripple the surface
  // between the big Gerstner swells.
  vec2 wp = vWorldPosition.xz;
  float ripple1 = jgWaterNoise(wp * 1.7 + vec2(uTime * 0.22, uTime * 0.15));
  float ripple2 = jgWaterNoise(wp * 3.1 - vec2(uTime * 0.17, uTime * 0.26));
  vec3 normal = normalize(normalize(vNormal) + vec3(ripple1 - 0.5, 0.0, ripple2 - 0.5) * 0.14);

  // Depth-based body color: warm shallows at the shore ramp falling to the deep tone.
  float depthMix = smoothstep(0.0, max(uDepthRange, 0.001), vDepth);
  vec3 waterColor = mix(uShallowColor, uDeepColor, depthMix);
  waterColor = mix(waterColor, uCrestColor, smoothstep(0.15, 1.2, vWaveHeight) * 0.22);

  // Restrained fresnel: a soft sky tint at grazing angles, never a white-out.
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);
  waterColor = mix(waterColor, vec3(0.62, 0.78, 0.85), min(fresnel * uFresnelStrength, 0.45));
  float horizon = smoothstep(0.0, 1.0, 1.0 - abs(normal.y));
  waterColor = mix(waterColor, uShallowColor, horizon * uHorizonBlend * 0.6);

  // Sun glints: sparkle where the perturbed normal mirrors the sun, gated by noise so it
  // twinkles in cells instead of sheening uniformly.
  vec3 halfway = normalize(viewDirection + normalize(uSunDirection));
  float glint = pow(max(dot(normal, halfway), 0.0), 150.0);
  float glintMask = smoothstep(0.68, 0.92, jgWaterNoise(wp * 2.3 + vec2(uTime * 0.4, -uTime * 0.31)));
  waterColor += vec3(1.0, 0.98, 0.9) * glint * glintMask * uSparkle;

  // Foam: a noise-eaten shoreline lick plus crest foam. A second, larger noise gates whole
  // stretches of shoreline so foam laps in patches instead of outlining the bank uniformly.
  float foamNoise = jgWaterNoise(wp * 2.6 + vec2(uTime * 0.28, uTime * 0.2));
  float foamStretch = smoothstep(0.3, 0.8, jgWaterNoise(wp * 0.33 + vec2(3.7, 9.2) + vec2(uTime * 0.05, 0.0)));
  float shoreFoam = (1.0 - smoothstep(0.0, max(uShoreFoamWidth, 0.001), vDepth - foamNoise * uShoreFoamWidth * 0.9))
    * smoothstep(0.25, 0.75, foamNoise) * (0.2 + 0.6 * foamStretch);
  float crestFoam = clamp(vCrest * uFoamIntensity, 0.0, 1.0) * smoothstep(0.35, 0.75, foamNoise);
  float foam = clamp(shoreFoam + crestFoam, 0.0, 1.0);
  vec3 color = mix(waterColor, uFoamColor, foam);

  // Soft shore: the sheet turns glass-clear over the last stretch of shoaling bed, so the
  // waterline is a blend into the terrain, not a hard tarp edge.
  float shoreAlpha = smoothstep(0.0, 0.55, vDepth);
  float alpha = uOpacity * mix(0.35, 1.0, shoreAlpha) + foam * 0.3;
  // The sheet's own border always dissolves — a bounded water plane must never end in a
  // visible straight cut, whatever the bed underneath is doing.
  float borderDist = min(min(vOceanUv.x, 1.0 - vOceanUv.x), min(vOceanUv.y, 1.0 - vOceanUv.y));
  alpha *= smoothstep(0.0, 0.045, borderDist);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;
