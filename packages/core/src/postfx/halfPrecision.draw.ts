/**
 * GLSL that rounds a float the way the GPU rounds on its way into a half-float target, so one shader
 * can do the work of several draws and still write the bits those draws left.
 *
 * Measured on the RTX 3070 (ANGLE on Direct3D 11) against exact arithmetic, over a million random
 * channels each (`.scratch` experiments behind PR "Post chain"):
 * - a shader's output written to an RGBA16F target is truncated toward zero, and a finite value past
 *   the largest half (65504) becomes 65504;
 * - a blend first truncates its source the same way, then rounds the blended value to nearest even,
 *   and a result past 65504 also becomes 65504;
 * - `unpackHalf2x16(packHalf2x16(x))` compiles away to `x`, so the rounding is done on the bits.
 *
 * `rtz16` is the target write, `rne16` the blend's result. A multiply blend `dst * src` is therefore
 * `rne16(dst * rtz16(src))`; the product of two halves is exact in a float, so nothing else rounds.
 * @internal
 */
export const HALF_ROUNDING_GLSL = /* glsl */ `
  float rtz16(float v) {
    if (isnan(v) || isinf(v)) return v;
    float a = abs(v);
    if (a >= 65504.0) return sign(v) * 65504.0;
    // Below the smallest normal half the step is 2^-24 everywhere.
    if (a < 6.103515625e-05) return trunc(v * 16777216.0) / 16777216.0;
    return uintBitsToFloat(floatBitsToUint(v) & 0xFFFFE000u);
  }
  float rne16(float v) {
    if (isnan(v) || isinf(v)) return v;
    float a = abs(v);
    if (a < 6.103515625e-05) return roundEven(v * 16777216.0) / 16777216.0;
    uint bits = floatBitsToUint(v);
    bits += 0x0FFFu + ((bits >> 13) & 1u);
    float r = uintBitsToFloat(bits & 0xFFFFE000u);
    return abs(r) > 65504.0 ? sign(v) * 65504.0 : r;
  }
  vec3 rtz16(vec3 v) { return vec3(rtz16(v.x), rtz16(v.y), rtz16(v.z)); }
  vec4 rtz16(vec4 v) { return vec4(rtz16(v.x), rtz16(v.y), rtz16(v.z), rtz16(v.w)); }
  vec3 rne16(vec3 v) { return vec3(rne16(v.x), rne16(v.y), rne16(v.z)); }
`;
