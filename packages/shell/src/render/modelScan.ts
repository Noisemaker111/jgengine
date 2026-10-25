import * as THREE from "three";

import type { TerrainDetailMaterialConfig } from "@jgengine/core/world/features";

import { SURFACE_SCAN_PARS_GLSL, surfaceScanDefines, surfaceScanKeyPart, surfaceScanUniforms } from "./surfaceScanShader";
import { acquireSurfaceScan, type SurfaceScanTextures } from "./surfaceScanTextures";

let scanEnabled = true;
const scanned = new Set<THREE.Material>();

/**
 * Turn model scans on or off for the live graphics tier (`low` draws none). Materials already drawn
 * recompile; programs are shared per scan variant, so the count stays bounded. @internal
 */
export function configureModelScan(enabled: boolean): void {
  if (enabled === scanEnabled) return;
  scanEnabled = enabled;
  for (const material of scanned) material.needsUpdate = true;
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vJgScnPos;
varying vec3 vJgScnN;
varying vec3 vJgScnAx;
varying vec3 vJgScnAy;
varying vec3 vJgScnAz;`;

// Object-space position in metres (model and instance scale applied, instances offset so a row of
// the same kit piece does not repeat one pattern) plus the object->view axes, so the fragment can
// turn an object-space tilt into the view-space normal three lights with.
const VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
{
  mat3 jgScnL = mat3(modelViewMatrix);
#ifdef USE_INSTANCING
  jgScnL = jgScnL * mat3(instanceMatrix);
#endif
  vec3 jgScnS = max(vec3(length(jgScnL[0]), length(jgScnL[1]), length(jgScnL[2])), vec3(1e-6));
  vJgScnAx = jgScnL[0] / jgScnS.x;
  vJgScnAy = jgScnL[1] / jgScnS.y;
  vJgScnAz = jgScnL[2] / jgScnS.z;
  vJgScnPos = transformed * jgScnS;
#ifdef USE_INSTANCING
  vJgScnPos += mod(instanceMatrix[3].xyz, 97.0);
#endif
  vJgScnN = objectNormal;
}`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vJgScnPos;
varying vec3 vJgScnN;
varying vec3 vJgScnAx;
varying vec3 vJgScnAy;
varying vec3 vJgScnAz;
${SURFACE_SCAN_PARS_GLSL}`;

// Triplanar in object space: each axis projects the scan onto the faces looking along it, blended by
// a sharpened normal so walls, sills and roofs each take one clean projection.
const COLOR_MAIN = /* glsl */ `
#include <color_fragment>
vec3 jgScnW = pow(abs(normalize(vJgScnN)), vec3(4.0));
jgScnW /= max(dot(jgScnW, vec3(1.0)), 1e-5);
vec3 jgScnP = vJgScnPos / uScanRepeat;
vec2 jgScnUvX = jgScnP.zy;
vec2 jgScnUvY = jgScnP.xz;
vec2 jgScnUvZ = jgScnP.xy;
#define JG_SCN_TRI(tex) (texture2D(tex, jgScnUvX) * jgScnW.x + texture2D(tex, jgScnUvY) * jgScnW.y + texture2D(tex, jgScnUvZ) * jgScnW.z)
diffuseColor.rgb = jgScanAlbedo(diffuseColor.rgb, JG_SCN_TRI(uScanColor).rgb);`;

const ROUGHNESS_MAIN = /* glsl */ `
#include <roughnessmap_fragment>
#ifdef JG_SCAN_ROUGH
roughnessFactor = clamp(roughnessFactor + (JG_SCN_TRI(uScanRough).g - jgScanRoughMean()) * uScanStrength * 0.8, 0.04, 1.0);
#endif`;

// Each projection's tangent tilt lands on the two object axes its UVs run along (whiteout blend),
// then the object->view axes carry it onto three's view-space normal.
const NORMAL_MAIN = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 jgTnX = texture2D(uScanNormal, jgScnUvX).xyz * 2.0 - 1.0;
  vec3 jgTnY = texture2D(uScanNormal, jgScnUvY).xyz * 2.0 - 1.0;
  vec3 jgTnZ = texture2D(uScanNormal, jgScnUvZ).xyz * 2.0 - 1.0;
  vec3 jgScnD = vec3(0.0, jgTnX.y, jgTnX.x) * jgScnW.x + vec3(jgTnY.x, 0.0, jgTnY.y) * jgScnW.y + vec3(jgTnZ.x, jgTnZ.y, 0.0) * jgScnW.z;
  vec3 jgScnDv = mat3(vJgScnAx, vJgScnAy, vJgScnAz) * jgScnD * uScanStrength * 0.6 * faceDirection;
  vec3 jgScnNn = normal + jgScnDv;
  float jgScnL2 = dot(jgScnNn, jgScnNn);
  if (jgScnL2 > 1e-20) normal = jgScnNn * inversesqrt(jgScnL2);
}`;

function setTextures(uniforms: ReturnType<typeof surfaceScanUniforms>, textures: SurfaceScanTextures | null): void {
  uniforms.uScanColor.value = textures?.color ?? null;
  uniforms.uScanNormal.value = textures?.normal ?? null;
  uniforms.uScanRough.value = textures?.roughness ?? null;
  uniforms.uScanAo.value = textures?.ao ?? null;
}

/**
 * Project a scanned surface onto one model material from its own geometry: object-space triplanar
 * tiled in metres, recoloured by the config's `tint` (0 keeps the model's colours and takes the
 * scan's grain), roughness varied around the authored value, normal tilted by the scan's normal map.
 * The material compiles without the scan until the maps load (and on the `low` tier), and releases
 * its hold on the shared maps when disposed. Chains onto any earlier `onBeforeCompile`. @internal
 */
export function applyModelScan(target: THREE.MeshStandardMaterial, config: TerrainDetailMaterialConfig): void {
  const uniforms = surfaceScanUniforms({ repeat: config.repeat ?? 2, strength: config.strength ?? 1, tint: config.tint ?? 1 }, null);
  let textures: SurfaceScanTextures | null = null;
  const handle = acquireSurfaceScan(config.maps, () => {
    textures = handle.current();
    setTextures(uniforms, textures);
    target.needsUpdate = true;
  });
  textures = handle.current();
  setTextures(uniforms, textures);
  scanned.add(target);
  target.addEventListener("dispose", function release() {
    target.removeEventListener("dispose", release);
    scanned.delete(target);
    handle.release();
  });
  const previousCompile = target.onBeforeCompile;
  const previousKey = target.customProgramCacheKey;
  target.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(target, shader, renderer);
    const live = scanEnabled ? textures : null;
    if (live === null) return;
    Object.assign(shader.uniforms, uniforms);
    const defines = Object.keys(surfaceScanDefines(live)).map((name) => `#define ${name}`).join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${VERTEX_PARS}`)
      .replace("#include <begin_vertex>", VERTEX_MAIN);
    shader.fragmentShader = `${defines}\n${shader.fragmentShader}`
      .replace("#include <common>", `#include <common>${FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", COLOR_MAIN)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS_MAIN)
      .replace("#include <normal_fragment_maps>", NORMAL_MAIN);
  };
  // Read the chained key lazily: the default surface's key follows the live graphics tier.
  target.customProgramCacheKey = () => `${previousKey.call(target)}|jg-scan:${scanEnabled ? surfaceScanKeyPart(textures) : "off"}`;
  target.needsUpdate = true;
}
