import type { SurfaceScanTextures } from "./surfaceScanTextures";

/** Uniform values a scanned-surface shader reads; one object per material, maps shared. */
export interface SurfaceScanUniforms {
  [name: string]: { value: unknown };
  uScanColor: { value: SurfaceScanTextures["color"] | null };
  uScanNormal: { value: SurfaceScanTextures["normal"] | null };
  uScanRough: { value: SurfaceScanTextures["roughness"] | null };
  uScanAo: { value: SurfaceScanTextures["ao"] | null };
  uScanRepeat: { value: number };
  uScanStrength: { value: number };
  uScanTint: { value: number };
}

/** Blend settings for one scanned layer. */
export interface SurfaceScanBlend {
  /** Metres one tile covers. */
  repeat: number;
  /** 0..1 how much of the scan shows over the procedural surface. */
  strength: number;
  /** 0 keeps the authored colour and takes the scan's grain; 1 shows the scan's own colour. */
  tint: number;
}

/** Fresh uniforms for one material sampling `textures` (or nothing yet). @internal */
export function surfaceScanUniforms(blend: SurfaceScanBlend, textures: SurfaceScanTextures | null): SurfaceScanUniforms {
  return {
    uScanColor: { value: textures?.color ?? null },
    uScanNormal: { value: textures?.normal ?? null },
    uScanRough: { value: textures?.roughness ?? null },
    uScanAo: { value: textures?.ao ?? null },
    uScanRepeat: { value: Math.max(0.01, blend.repeat) },
    uScanStrength: { value: Math.min(1, Math.max(0, blend.strength)) },
    uScanTint: { value: Math.min(1, Math.max(0, blend.tint)) },
  };
}

/** Defines selecting which optional maps a scan carries. @internal */
export function surfaceScanDefines(textures: SurfaceScanTextures): Record<string, string> {
  return {
    JG_SCAN: "",
    ...(textures.roughness === undefined ? {} : { JG_SCAN_ROUGH: "" }),
    ...(textures.ao === undefined ? {} : { JG_SCAN_AO: "" }),
  };
}

/** Cache-key fragment for a scan's compiled variant. @internal */
export function surfaceScanKeyPart(textures: SurfaceScanTextures | null): string {
  if (textures === null) return "noscan";
  return `scan${textures.roughness === undefined ? "" : "-r"}${textures.ao === undefined ? "" : "-ao"}`;
}

/**
 * Fragment helpers for a scanned surface: uniforms, the scan's mean tone (its last mip), the
 * grain/tint recolour, mean-relative roughness and a derivative cotangent frame for its normal map.
 * Guarded by `JG_SCAN`, so a material compiled before its maps arrive carries none of it.
 */
export const SURFACE_SCAN_PARS_GLSL = /* glsl */ `
#ifdef JG_SCAN
uniform sampler2D uScanColor;
uniform sampler2D uScanNormal;
#ifdef JG_SCAN_ROUGH
uniform sampler2D uScanRough;
#endif
#ifdef JG_SCAN_AO
uniform sampler2D uScanAo;
#endif
uniform float uScanRepeat;
uniform float uScanStrength;
uniform float uScanTint;
const vec3 JG_SCAN_LUMA = vec3(0.2126, 0.7152, 0.0722);
// The 1x1 mip is the scan's mean colour: grain is measured against the scan's own tone, so a dark
// asphalt and a pale plaster both keep the authored colour's brightness when tint is 0.
vec3 jgScanMean() { return max(textureLod(uScanColor, vec2(0.5), 16.0).rgb, vec3(1e-3)); }
vec3 jgScanAlbedo(vec3 authored, vec3 scan) {
  float jgGrain = clamp(dot(scan, JG_SCAN_LUMA) / max(dot(jgScanMean(), JG_SCAN_LUMA), 1e-3), 0.3, 2.4);
  return mix(authored, mix(authored * jgGrain, scan, uScanTint), uScanStrength);
}
#ifdef JG_SCAN_ROUGH
float jgScanRoughMean() { return textureLod(uScanRough, vec2(0.5), 16.0).g; }
#endif
// Christian Schüler's cotangent frame from screen derivatives: no tangent attribute needed, so a
// ribbon, a welded junction or a kit model all take a normal map from whatever UVs we project.
vec3 jgScanPerturb(vec3 n, vec3 viewPos, vec2 uv, vec3 mapN, float s) {
  vec3 dp1 = dFdx(viewPos);
  vec3 dp2 = dFdy(viewPos);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;
  float m = max(dot(t, t), dot(b, b));
  if (m < 1e-30) return n;
  float inv = inversesqrt(m);
  vec3 p = t * inv * mapN.x * s + b * inv * mapN.y * s + n * mapN.z;
  float l2 = dot(p, p);
  return l2 > 1e-20 ? p * inversesqrt(l2) : n;
}
#endif
`;
