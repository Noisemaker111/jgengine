export const oceanVertexShader = `
uniform float uTime;
uniform vec2 uWaveDirections[6];
uniform vec4 uWaveParams[6];
uniform float uChoppiness;
uniform float uFoamThreshold;
uniform float uFoamSoftness;
uniform float uFoamCoverage;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveHeight;

void main() {
  vec3 displaced = position;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 bitangent = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  for (int i = 0; i < 6; i++) {
    vec2 direction = normalize(uWaveDirections[i]);
    vec4 wave = uWaveParams[i];
    float k = wave.x;
    float amplitude = wave.y;
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
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const oceanFragmentShader = `
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uCrestColor;
uniform vec3 uFoamColor;
uniform float uOpacity;
uniform float uFresnelStrength;
uniform float uHorizonBlend;
uniform float uFoamIntensity;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveHeight;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.5);
  float depthMix = smoothstep(-1.8, 1.6, vWaveHeight);
  vec3 waterColor = mix(uDeepColor, uShallowColor, depthMix);
  waterColor = mix(waterColor, uCrestColor, smoothstep(0.15, 1.2, vWaveHeight) * 0.28);
  waterColor = mix(waterColor, vec3(0.86, 0.95, 1.0), fresnel * uFresnelStrength);
  float horizon = smoothstep(0.0, 1.0, 1.0 - abs(normal.y));
  waterColor = mix(waterColor, uShallowColor, horizon * uHorizonBlend);
  float foam = clamp(vCrest * uFoamIntensity, 0.0, 1.0);
  vec3 color = mix(waterColor, uFoamColor, foam);
  gl_FragColor = vec4(color, uOpacity);
}
`;
