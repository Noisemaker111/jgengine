import * as THREE from "three";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** How sharp an impostor atlas is: `frames`×`frames` views over the upper hemisphere, `cell` pixels each. @internal */
export interface ImpostorSettings {
  /** View directions per atlas side; the atlas holds frames² views. */
  frames: number;
  /** Pixels per view. */
  cell: number;
}

/** Atlas resolution per tier. Low keeps impostors too: they are what makes a far forest cheap. @internal */
export function impostorSettingsForQuality(quality: GraphicsQuality): ImpostorSettings {
  if (quality === "low") return { frames: 6, cell: 48 };
  if (quality === "medium") return { frames: 8, cell: 64 };
  if (quality === "high") return { frames: 8, cell: 96 };
  return { frames: 8, cell: 128 };
}

/** Models smaller than this bounding radius (metres) stay meshes: a card saves little on a crate. @internal */
export const IMPOSTOR_MIN_RADIUS = 2.2;

/**
 * Distance in metres beyond which an instance of a model with bounding `radius` draws as an impostor.
 * Bigger models switch farther out, so a building keeps its parallax longer than a tree.
 * @internal
 */
export function impostorDistance(radius: number, quality: GraphicsQuality): number {
  const [base, perRadius] = quality === "low" ? [38, 10] : quality === "medium" ? [55, 13] : quality === "high" ? [70, 16] : [95, 20];
  return Math.max(base, radius * perRadius);
}

/**
 * Distance in metres beyond which a model too small for an impostor (a bush, a pebble, a fern) stops
 * drawing at all. Small detail reads only up close, so culling it by size keeps an island-sized
 * scatter field to the draws near the camera; fog and the far trees' impostors carry the distance.
 * @internal
 */
export function detailDrawDistance(radius: number, quality: GraphicsQuality): number {
  const [base, perRadius] = quality === "low" ? [40, 45] : quality === "medium" ? [55, 60] : quality === "high" ? [70, 75] : [90, 100];
  return base + radius * perRadius;
}

/** Hemi-octahedral encoding of an upward unit direction into 0..1 atlas coordinates. @internal */
export function hemiOctEncode(x: number, y: number, z: number): [number, number] {
  const sum = Math.abs(x) + Math.abs(Math.max(y, 0)) + Math.abs(z) || 1;
  const px = x / sum;
  const pz = z / sum;
  return [(px + pz) * 0.5 + 0.5, (px - pz) * 0.5 + 0.5];
}

/** Inverse of {@link hemiOctEncode}. @internal */
export function hemiOctDecode(u: number, v: number, target = new THREE.Vector3()): THREE.Vector3 {
  const tx = u * 2 - 1;
  const ty = v * 2 - 1;
  const px = (tx + ty) * 0.5;
  const pz = (tx - ty) * 0.5;
  return target.set(px, 1 - Math.abs(px) - Math.abs(pz), pz).normalize();
}

/** The up vector a bake camera looking back along `direction` uses; the shader mirrors it. @internal */
export function impostorUp(direction: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
  return Math.abs(direction.y) > 0.999 ? target.set(0, 0, -1) : target.set(0, 1, 0);
}

/** A model baked into albedo and normal atlases seen from `frames`² directions. @internal */
export interface ImpostorAtlas {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  frames: number;
  /** Bounding sphere of the model in its own space. */
  center: THREE.Vector3;
  radius: number;
  /** The render targets a fresh bake drew into, for a build step that reads the pixels back. */
  targets?: { albedo: THREE.WebGLRenderTarget; normal: THREE.WebGLRenderTarget };
  dispose(): void;
}

/** One draw source of a model: what the instanced path harvests from a GLB. @internal */
export interface ImpostorSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
}

const NORMAL_BAKE_VERTEX = /* glsl */ `
  varying vec3 vJgNormal;
  varying vec2 vJgUv;
  void main() {
    vJgNormal = normalize(mat3(modelMatrix) * normal);
    vJgUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NORMAL_BAKE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform mat3 uMapTransform;
  uniform float uAlphaTest;
  varying vec3 vJgNormal;
  varying vec2 vJgUv;
  void main() {
    if (uAlphaTest > 0.0 && texture2D(uMap, (uMapTransform * vec3(vJgUv, 1.0)).xy).a < uAlphaTest) discard;
    vec3 n = normalize(vJgNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

function bakeMaterials(material: THREE.Material): { albedo: THREE.Material; normal: THREE.ShaderMaterial } {
  const source = material as THREE.MeshStandardMaterial;
  const map = source.map ?? null;
  const alphaTest = map !== null && source.alphaTest > 0 ? source.alphaTest : 0;
  const albedo = new THREE.MeshBasicMaterial({
    color: source.color ?? new THREE.Color(1, 1, 1),
    map,
    vertexColors: source.vertexColors === true,
    alphaTest,
    side: THREE.DoubleSide,
    fog: false,
  });
  const normal = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uMapTransform: { value: map === null ? new THREE.Matrix3() : map.matrix },
      uAlphaTest: { value: alphaTest },
    },
    vertexShader: NORMAL_BAKE_VERTEX,
    fragmentShader: NORMAL_BAKE_FRAGMENT,
    side: THREE.DoubleSide,
  });
  return { albedo, normal };
}

function atlasTarget(size: number, srgb: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  if (srgb) target.texture.colorSpace = THREE.SRGBColorSpace;
  return target;
}

const bakeDirection = new THREE.Vector3();
const bakeUp = new THREE.Vector3();

/**
 * Renders `sources` from `frames`² directions over the upper hemisphere into an albedo atlas and a
 * normal atlas (normals in model space, coverage in alpha). Background stays transparent black, so a
 * mip level's colour divided by its coverage is the true average colour at that distance.
 * @internal
 */
export function bakeImpostor(renderer: THREE.WebGLRenderer, sources: readonly ImpostorSource[], settings: ImpostorSettings): ImpostorAtlas | null {
  const scene = new THREE.Scene();
  const owned: THREE.Material[] = [];
  const meshes: { mesh: THREE.Mesh; albedo: THREE.Material | THREE.Material[]; normal: THREE.Material | THREE.Material[] }[] = [];
  for (const source of sources) {
    const list = Array.isArray(source.material) ? source.material : [source.material];
    const baked = list.map(bakeMaterials);
    for (const pair of baked) owned.push(pair.albedo, pair.normal);
    const albedo = Array.isArray(source.material) ? baked.map((pair) => pair.albedo) : baked[0]!.albedo;
    const normal = Array.isArray(source.material) ? baked.map((pair) => pair.normal) : baked[0]!.normal;
    const mesh = new THREE.Mesh(source.geometry, albedo);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(source.localMatrix);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push({ mesh, albedo, normal });
  }
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) {
    for (const material of owned) material.dispose();
    return null;
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius * 1.04;
  const size = settings.frames * settings.cell;
  const albedoTarget = atlasTarget(size, true);
  const normalTarget = atlasTarget(size, false);
  const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 4);

  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const previousClear = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const previousShadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  for (const [target, pass] of [[albedoTarget, "albedo"], [normalTarget, "normal"]] as const) {
    for (const entry of meshes) entry.mesh.material = entry[pass];
    target.scissorTest = false;
    target.viewport.set(0, 0, size, size);
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    for (let row = 0; row < settings.frames; row += 1) {
      for (let column = 0; column < settings.frames; column += 1) {
        hemiOctDecode((column + 0.5) / settings.frames, (row + 0.5) / settings.frames, bakeDirection);
        camera.position.copy(sphere.center).addScaledVector(bakeDirection, radius * 2);
        camera.up.copy(impostorUp(bakeDirection, bakeUp));
        camera.lookAt(sphere.center);
        camera.updateMatrixWorld(true);
        target.viewport.set(column * settings.cell, row * settings.cell, settings.cell, settings.cell);
        target.scissor.copy(target.viewport);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
        renderer.clear(false, true, false);
        renderer.render(scene, camera);
      }
    }
    target.scissorTest = false;
    target.viewport.set(0, 0, size, size);
  }
  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = previousAutoClear;
  renderer.setClearColor(previousClear, previousAlpha);
  renderer.shadowMap.autoUpdate = previousShadows;
  for (const material of owned) material.dispose();

  return {
    albedo: albedoTarget.texture,
    normal: normalTarget.texture,
    frames: settings.frames,
    center: sphere.center.clone(),
    radius,
    targets: { albedo: albedoTarget, normal: normalTarget },
    dispose() {
      albedoTarget.dispose();
      normalTarget.dispose();
    },
  };
}

const IMPOSTOR_VERTEX_PARS = /* glsl */ `
uniform vec3 uImpCenter;
uniform float uImpRadius;
uniform float uImpFrames;
varying vec2 vImpUv;
varying vec3 vImpR0;
varying vec3 vImpR1;
varying vec3 vImpR2;`;

// A camera-facing card that shows the baked view nearest the camera's direction in the instance's own
// frame. In the shadow pass the "camera" is the light, so the card turns to the sun and casts the
// silhouette the sun sees.
const IMPOSTOR_VERTEX = /* glsl */ `
  mat4 jgImpModel = modelMatrix * instanceMatrix;
  vec3 jgImpCenterW = (jgImpModel * vec4(uImpCenter, 1.0)).xyz;
  mat3 jgImpRot = mat3(normalize(jgImpModel[0].xyz), normalize(jgImpModel[1].xyz), normalize(jgImpModel[2].xyz));
  vec3 jgImpView = isOrthographic ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : cameraPosition - jgImpCenterW;
  vec3 jgImpLocal = transpose(jgImpRot) * normalize(jgImpView);
  jgImpLocal.y = max(jgImpLocal.y, 0.0);
  jgImpLocal = normalize(jgImpLocal + vec3(0.0, 1e-4, 0.0));
  vec2 jgImpP = jgImpLocal.xz / (abs(jgImpLocal.x) + abs(jgImpLocal.y) + abs(jgImpLocal.z));
  vec2 jgImpE = vec2(jgImpP.x + jgImpP.y, jgImpP.x - jgImpP.y) * 0.5 + 0.5;
  vec2 jgImpFrame = min(floor(jgImpE * uImpFrames), vec2(uImpFrames - 1.0));
  vec2 jgImpT = (jgImpFrame + 0.5) / uImpFrames * 2.0 - 1.0;
  vec2 jgImpQ = vec2(jgImpT.x + jgImpT.y, jgImpT.x - jgImpT.y) * 0.5;
  vec3 jgImpDir = normalize(vec3(jgImpQ.x, 1.0 - abs(jgImpQ.x) - abs(jgImpQ.y), jgImpQ.y));
  vec3 jgImpUp = abs(jgImpDir.y) > 0.999 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vec3 jgImpX = normalize(cross(jgImpUp, jgImpDir));
  vec3 jgImpY = cross(jgImpDir, jgImpX);
  vec3 jgImpLocalPos = uImpCenter + (jgImpX * position.x + jgImpY * position.y) * uImpRadius;
  vec3 jgImpWorld = (jgImpModel * vec4(jgImpLocalPos, 1.0)).xyz;
  vImpUv = (jgImpFrame + position.xy * 0.5 + 0.5) / uImpFrames;
  vImpR0 = jgImpRot[0];
  vImpR1 = jgImpRot[1];
  vImpR2 = jgImpRot[2];
  vec3 transformed = jgImpLocalPos;`;

const IMPOSTOR_PROJECT = /* glsl */ `
  vec4 mvPosition = viewMatrix * vec4(jgImpWorld, 1.0);
  gl_Position = projectionMatrix * mvPosition;`;

const IMPOSTOR_WORLDPOS = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = vec4(jgImpWorld, 1.0);
#endif`;

const IMPOSTOR_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uImpAlbedo;
uniform sampler2D uImpNormal;
varying vec2 vImpUv;
varying vec3 vImpR0;
varying vec3 vImpR1;
varying vec3 vImpR2;`;

function impostorUniforms(atlas: ImpostorAtlas): Record<string, THREE.IUniform> {
  return {
    uImpCenter: { value: atlas.center },
    uImpRadius: { value: atlas.radius },
    uImpFrames: { value: atlas.frames },
    uImpAlbedo: { value: atlas.albedo },
    uImpNormal: { value: atlas.normal },
  };
}

function patchVertex(vertex: string): string {
  return vertex
    .replace("#include <common>", `#include <common>\n${IMPOSTOR_VERTEX_PARS}`)
    .replace("#include <begin_vertex>", IMPOSTOR_VERTEX)
    .replace("#include <project_vertex>", IMPOSTOR_PROJECT)
    .replace("#include <worldpos_vertex>", IMPOSTOR_WORLDPOS);
}

/**
 * The lit card and its shadow-pass twin for one baked model. The card is a standard material, so the
 * sun, the sky light, fog and received shadows light it the same way as the mesh it stands in for.
 * @internal
 */
export function createImpostorMaterials(atlas: ImpostorAtlas): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const uniforms = impostorUniforms(atlas);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${IMPOSTOR_FRAGMENT_PARS}`)
      .replace(
        "#include <map_fragment>",
        `vec4 jgImpN = texture2D(uImpNormal, vImpUv);
if (jgImpN.a < 0.5) discard;
diffuseColor.rgb *= texture2D(uImpAlbedo, vImpUv).rgb / jgImpN.a;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `normal = normalize((viewMatrix * vec4(mat3(vImpR0, vImpR1, vImpR2) * normalize(jgImpN.rgb / jgImpN.a * 2.0 - 1.0), 0.0)).xyz);`,
      );
  };
  material.customProgramCacheKey = () => "jg-impostor:v1";
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${IMPOSTOR_FRAGMENT_PARS}`)
      .replace("void main() {", "void main() {\n  if (texture2D(uImpNormal, vImpUv).a < 0.5) discard;");
  };
  depth.customProgramCacheKey = () => "jg-impostor-depth:v1";
  return { material, depth };
}

/** Whether an instance at `distance` draws as an impostor, holding its last answer inside a band so it cannot flicker. @internal */
export function impostorSwitch(distance: number, threshold: number, wasFar: boolean): boolean {
  const band = Math.max(3, threshold * 0.06);
  return wasFar ? distance > threshold - band : distance > threshold + band;
}

/** A baked model shared by every draw of it, and its card materials. @internal */
export interface ImpostorEntry {
  atlas: ImpostorAtlas | null;
  materials: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } | null;
  users: number;
}

const cache = new Map<string, ImpostorEntry>();

/**
 * The shared impostor for a model: baked once per model and quality, released when its last user
 * goes. Returns null when the model has nothing to bake.
 * @internal
 */
export function acquireImpostor(
  key: string,
  renderer: THREE.WebGLRenderer,
  sources: readonly ImpostorSource[],
  settings: ImpostorSettings,
): ImpostorEntry {
  const id = `${key}|${settings.frames}x${settings.cell}`;
  let entry = cache.get(id);
  if (entry === undefined) {
    const atlas = bakeImpostor(renderer, sources, settings);
    entry = { atlas, materials: atlas === null ? null : createImpostorMaterials(atlas), users: 0 };
    cache.set(id, entry);
  }
  entry.users += 1;
  return entry;
}

/** Drop one user of a shared impostor; the last one disposes it. @internal */
export function releaseImpostor(key: string, settings: ImpostorSettings): void {
  const id = `${key}|${settings.frames}x${settings.cell}`;
  const entry = cache.get(id);
  if (entry === undefined) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  cache.delete(id);
  entry.atlas?.dispose();
  entry.materials?.material.dispose();
  entry.materials?.depth.dispose();
}

/** The unit card every instance of `atlas` draws, bounded by the model it stands in for so culling stays honest. @internal */
export function impostorCard(atlas: ImpostorAtlas): THREE.PlaneGeometry {
  const card = new THREE.PlaneGeometry(2, 2);
  card.boundingSphere = new THREE.Sphere(atlas.center.clone(), atlas.radius * 1.5);
  card.boundingBox = new THREE.Box3().setFromCenterAndSize(atlas.center, new THREE.Vector3().setScalar(atlas.radius * 3));
  return card;
}

/** Bounding radius of a set of sources in model space, for deciding whether a model earns an impostor. @internal */
export function sourceRadius(sources: readonly ImpostorSource[]): number {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  for (const source of sources) {
    if (source.geometry.boundingBox === null) source.geometry.computeBoundingBox();
    part.copy(source.geometry.boundingBox!).applyMatrix4(source.localMatrix);
    box.union(part);
  }
  return box.isEmpty() ? 0 : box.getBoundingSphere(new THREE.Sphere()).radius;
}
