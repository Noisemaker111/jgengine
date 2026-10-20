/** Integer-hash value noise (`jgHashUint`, `jgVNoise`, `jgFbm`) every surface chunk builds on. */
export const NOISE_GLSL = /* glsl */ `
uint jgHashUint(uvec2 v){
  uint x = v.x * 1664525u + v.y * 1013904223u;
  x = (x ^ (x >> 16u)) * 2246822519u;
  x = (x ^ (x >> 13u)) * 3266489917u;
  x = x ^ (x >> 16u);
  return x;
}
float jgHash(vec2 p){
  ivec2 i = ivec2(floor(p));
  return float(jgHashUint(uvec2(i))) * (1.0 / 4294967296.0);
}
float jgVNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jgHash(i);
  float b = jgHash(i + vec2(1.0, 0.0));
  float c = jgHash(i + vec2(0.0, 1.0));
  float d = jgHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float jgFbm(vec2 p){
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 4; i++){ v += amp * jgVNoise(p); p *= 2.0; amp *= 0.5; }
  return v;
}
`;

/**
 * GLSL for the terrain surface pass: per-surface procedural ground (grass, dirt, gravel, rock, sand,
 * mud, snow, road) and the height-aware blend between painted layers. Needs `NOISE_GLSL` first.
 * Every octave is gated by `jgBand(frequency)` so detail finer than a pixel fades to its mean
 * instead of shimmering at distance.
 */
export const SURFACE_FUNCTIONS_GLSL = /* glsl */ `
float jgFootprint;
float jgFbm2(vec2 p){ return jgVNoise(p) * 0.62 + jgVNoise(p * 2.03 + 17.3) * 0.38; }
float jgFbm3o(vec2 p){ return (jgVNoise(p) * 0.5 + jgVNoise(p * 2.03 + 17.3) * 0.3 + jgVNoise(p * 4.1 + 5.9) * 0.2); }
float jgBand(float freq){ return 1.0 - smoothstep(0.16, 0.42, freq * jgFootprint); }
vec2 jgHash22(vec2 cell){
  uint h = jgHashUint(uvec2(ivec2(floor(cell + 0.5))));
  uint h2 = h * 747796405u + 2891336453u;
  h2 = (h2 ^ (h2 >> 15u)) * 2246822519u;
  return vec2(float(h), float(h2 ^ (h2 >> 13u))) * (1.0 / 4294967296.0);
}
float jgHash3(vec3 i){
  ivec3 c = ivec3(i);
  return float(jgHashUint(uvec2(uint(c.x) ^ (uint(c.z) * 2654435761u), uint(c.y) + uint(c.z) * 1013904223u))) * (1.0 / 4294967296.0);
}
float jgVNoise3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = jgHash3(i), b = jgHash3(i + vec3(1.0, 0.0, 0.0));
  float c = jgHash3(i + vec3(0.0, 1.0, 0.0)), d = jgHash3(i + vec3(1.0, 1.0, 0.0));
  float e = jgHash3(i + vec3(0.0, 0.0, 1.0)), g = jgHash3(i + vec3(1.0, 0.0, 1.0));
  float h = jgHash3(i + vec3(0.0, 1.0, 1.0)), k = jgHash3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float jgFbm3(vec3 p){
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 3; i++){ v += amp * jgVNoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 4.1); amp *= 0.5; }
  return v / 0.875;
}
// x: distance to the nearest feature point, y: F2 - F1 (0 on a cell border), z: that cell's random id.
vec3 jgVoronoi(vec2 p){
  vec2 n = floor(p); vec2 f = fract(p);
  float d1 = 8.0; float d2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = jgHash22(n + g);
      vec2 r = g + 0.15 + o * 0.7 - f;
      float d = dot(r, r);
      if (d < d1){ d2 = d1; d1 = d; id = o.x; } else if (d < d2){ d2 = d; }
    }
  }
  d1 = sqrt(d1);
  return vec3(d1, sqrt(d2) - d1, id);
}

struct JgSurf { vec3 albedo; float height; float rough; float bump; };

// height: 0..1 relief used to decide which layer wins along a blend edge; bump: displacement in metres.
JgSurf jgSurface(int cls, vec3 color, float rough, float scale, vec3 wp){
  vec2 p = wp.xz * scale;
  JgSurf s;
  s.albedo = color; s.rough = rough; s.height = 0.4; s.bump = 0.0;
  float m = jgFbm3o(p / 1.6 + float(cls) * 13.7);
#ifdef JG_SURFACE_LOW
  s.albedo = color * (0.84 + 0.34 * m);
  s.height = m;
  return s;
#else
  bool shaded = false;
#if (JG_SURFACE_CLASSES & 2) != 0
  if (cls == 1) {
    float clump = jgFbm3o(p / 0.9 + 5.3);
    float dry = smoothstep(0.5, 0.75, jgFbm2(p / 7.0 + 17.0));
    float blade = jgVNoise(p * 11.0 + clump * 3.0);
    float fine = jgVNoise(p * 27.0 + 91.0);
    float bBlade = jgBand(11.0);
    s.albedo = mix(color, color * vec3(1.24, 1.12, 0.7), dry * 0.55);
    s.albedo *= 0.74 + 0.48 * clump;
    s.albedo = mix(s.albedo, color * vec3(0.78, 0.64, 0.46), smoothstep(0.42, 0.24, clump) * 0.25);
    s.albedo *= 1.0 + (blade - 0.5) * 0.5 * bBlade + (fine - 0.5) * 0.32 * jgBand(27.0);
    s.height = 0.2 + clump * 0.55 + blade * 0.25 * bBlade;
    s.bump = clump * 0.014 + blade * 0.008 * bBlade;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 4) != 0
  if (cls == 2) {
    float clod = jgVNoise(p * 3.0 + m * 2.0);
    float crumb = jgVNoise(p * 14.0 + 7.0);
    vec3 v = jgVoronoi(p * 2.2 + 7.7);
    float peb = (1.0 - smoothstep(0.1, 0.2, v.x)) * step(0.7, v.z) * jgBand(7.0);
    s.albedo = color * (0.78 + 0.44 * m);
    s.albedo *= 1.0 + (clod - 0.5) * 0.32 * jgBand(3.0) + (crumb - 0.5) * 0.24 * jgBand(14.0);
    s.albedo = mix(s.albedo, color * vec3(1.34, 1.3, 1.24) + 0.02, peb * 0.75);
    s.height = 0.05 + m * 0.4 + clod * 0.2 + peb * 0.5;
    s.bump = clod * 0.012 * jgBand(3.0) + crumb * 0.003 * jgBand(14.0) + peb * 0.012;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 8) != 0
  if (cls == 3) {
    // Round pebbles from F1 distance (not Voronoi cells, which read as flagstone paving), two sizes,
    // packed over darker grit.
    vec3 va = jgVoronoi(p * 5.5);
    float ra = 0.28 + 0.18 * fract(va.z * 13.1);
    float sa = 1.0 - smoothstep(ra * 0.72, ra, va.x);
    float da = sqrt(max(0.0, 1.0 - (va.x / ra) * (va.x / ra))) * sa;
    vec3 vb = jgVoronoi(p * 11.0 + 3.1);
    float rb = 0.32 + 0.14 * fract(vb.z * 7.7);
    float sb = (1.0 - smoothstep(rb * 0.66, rb, vb.x)) * (1.0 - sa);
    float db = sqrt(max(0.0, 1.0 - (vb.x / rb) * (vb.x / rb))) * sb;
    float grit = jgVNoise(p * 24.0);
    float bA = jgBand(5.5);
    float bB = jgBand(11.0);
    vec3 hueA = mix(vec3(1.08, 1.0, 0.9), vec3(0.92, 0.97, 1.08), fract(va.z * 7.13));
    vec3 hueB = mix(vec3(1.05, 1.0, 0.93), vec3(0.95, 0.98, 1.05), fract(vb.z * 5.71));
    vec3 near = color * (0.58 + 0.2 * grit);
    near = mix(near, color * hueB * (0.66 + 0.5 * vb.z) * (0.72 + 0.28 * db), sb * bB);
    near = mix(near, color * hueA * (0.64 + 0.62 * va.z) * (0.7 + 0.3 * da), sa);
    s.albedo = mix(color * (0.8 + 0.26 * m), near, bA);
    s.height = 0.3 + max(da, db * 0.6 * bB) * 0.6 * bA;
    s.bump = (da * 0.03 + db * 0.012 * bB) * bA;
    s.rough = rough - 0.08 * sa * bA;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 16) != 0
  if (cls == 4) {
    vec3 q = wp * scale;
    float n = jgFbm3(q / 1.8);
    float n2 = jgFbm3(q * 1.7 + 5.0);
    float grain = jgVNoise3(q * 9.0);
    float strata = sin(q.y * 2.6 + n * 5.0) * 0.5 + 0.5;
    float pits = smoothstep(0.72, 0.9, jgVNoise3(q * 4.3 + 11.0)) * jgBand(4.3);
    float lichen = smoothstep(0.6, 0.78, jgFbm2(p / 3.0 + 41.0));
    s.albedo = color * (0.4 + 1.25 * n) * (0.8 + 0.4 * n2 * jgBand(3.4)) * (1.0 - pits * 0.35) * (0.94 + strata * 0.12);
    s.albedo *= 1.0 + (grain - 0.5) * 0.3 * jgBand(9.0);
    s.albedo = mix(s.albedo, s.albedo * vec3(0.92, 1.06, 0.82), lichen * 0.45);
    s.height = 0.35 + n * 0.65;
    s.bump = n * 0.1 + n2 * 0.02 * jgBand(3.4) - pits * 0.006 + grain * 0.004 * jgBand(9.0);
    s.rough = rough - 0.1 * n;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 32) != 0
  if (cls == 5) {
    float warp = jgFbm2(p / 3.0 + 3.3);
    float ripple = sin((p.x * 0.83 + p.y * 0.56) * 6.0 + warp * 7.0) * 0.5 + 0.5;
    float grain = jgVNoise(p * 40.0);
    float bRipple = jgBand(1.0);
    s.albedo = color * (0.92 + 0.16 * m) * (1.0 + (ripple - 0.5) * 0.1 * bRipple);
    float speck = jgVNoise(p * 9.0 + 2.7);
    s.albedo *= 1.0 + (grain - 0.5) * 0.14 * jgBand(40.0) + (speck - 0.5) * 0.12 * jgBand(9.0);
    s.height = 0.05 + ripple * 0.25 + m * 0.2;
    s.bump = ripple * 0.012 * bRipple;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 64) != 0
  if (cls == 6) {
    float puddle = smoothstep(0.56, 0.66, jgFbm3o(p / 3.2 + 31.0));
    float lumps = jgVNoise(p * 4.0 + m);
    s.albedo = color * (0.8 + 0.38 * m) * (1.0 + (lumps - 0.5) * 0.26 * jgBand(4.0));
    s.albedo = mix(s.albedo, s.albedo * 0.58, puddle);
    s.rough = mix(rough, 0.22, puddle);
    s.height = (0.1 + m * 0.4 + lumps * 0.2) * (1.0 - puddle * 0.8);
    s.bump = lumps * 0.012 * jgBand(4.0) * (1.0 - puddle);
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 128) != 0
  if (cls == 7) {
    float drift = jgFbm2(p / 4.0 + 9.0);
    s.albedo = color * (0.93 + 0.1 * m + 0.04 * drift);
    s.height = 0.3 + drift * 0.5;
    s.bump = drift * 0.03 + m * 0.01;
    shaded = true;
  }
#endif
#if (JG_SURFACE_CLASSES & 256) != 0
  if (cls == 8) {
    float grain = jgVNoise(p * 30.0);
    float stain = jgFbm2(p / 5.0 + 2.0);
    s.albedo = color * (0.88 + 0.22 * stain) * (1.0 + (grain - 0.5) * 0.2 * jgBand(30.0));
    s.height = 0.2 + stain * 0.2;
    s.bump = grain * 0.0015 * jgBand(30.0);
    shaded = true;
  }
#endif
  if (!shaded) {
    float fine = jgVNoise(p * 6.0 + 3.0);
    s.albedo = color * (1.0 + (fine - 0.5) * 0.18 * jgBand(6.0));
    s.height = 0.25 + m * 0.4;
    s.bump = m * 0.02 + fine * 0.004 * jgBand(6.0);
  }
  return s;
#endif
}
`;

/** Paint-coverage uniforms and the warped, smoothed cell lookup. */
export const PAINT_PARS_GLSL = /* glsl */ `
uniform sampler2D uPaintA;
uniform sampler2D uPaintB;
uniform vec2 uPaintMin;
uniform vec2 uPaintCell;
uniform vec2 uPaintGrid;
uniform float uPaintWarp;
uniform vec3 uLayerColor[8];
uniform float uLayerClass[8];
uniform float uLayerRough[8];
uniform float uLayerScale[8];
float jgWarpNoise(vec2 p){ return (jgVNoise(p) * 0.65 + jgVNoise(p * 2.7 + 13.1) * 0.35) - 0.5; }
vec2 jgPaintUv(vec2 wp){
  vec2 cell = (wp - uPaintMin) / uPaintCell;
  cell += vec2(jgWarpNoise(wp / 2.3 + 4.1), jgWarpNoise(wp / 2.3 + vec2(19.7, 3.3))) * uPaintWarp;
  vec2 c = cell - 0.5;
  vec2 i = floor(c); vec2 f = fract(c);
  f = f * f * (3.0 - 2.0 * f);
  return (i + f + 0.5) / uPaintGrid;
}
`;

/**
 * Micro-normal from a surface height `jgBumpH` (metres) via screen-space derivatives; goes after
 * `normal_fragment_maps`. Skipped on the low tier.
 */
export const SURFACE_BUMP_NORMAL_GLSL = /* glsl */ `
#ifndef JG_SURFACE_LOW
{
  // Bump from the blended surface height (metres) via screen-space derivatives, unnormalised so the
  // tilt is the true world slope of that height field at any distance.
  vec3 jgSigX = dFdx(-vViewPosition);
  vec3 jgSigY = dFdy(-vViewPosition);
  vec2 jgDh = vec2(dFdx(jgBumpH), dFdy(jgBumpH));
  vec3 jgR1 = cross(jgSigY, normal);
  vec3 jgR2 = cross(normal, jgSigX);
  float jgDet = dot(jgSigX, jgR1) * faceDirection;
  vec3 jgGrad = sign(jgDet) * (jgDh.x * jgR1 + jgDh.y * jgR2);
  normal = normalize(abs(jgDet) * normal - jgGrad);
}
#endif
`;
