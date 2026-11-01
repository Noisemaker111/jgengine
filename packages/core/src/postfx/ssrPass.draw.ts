import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import type { SsrConfig } from "@jgengine/core/render/postProcessing";
import { visitVisible } from "@jgengine/core/visibility/visitVisible.draw";

const maskClear = new THREE.Color();

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The reflection march. Normals come from the depth buffer, so the pass needs no G-buffer and costs
 * no extra scene draw; a surface's normal map does not ripple its reflection. @internal
 */
export function ssrFragment(steps: number): string {
  return /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tMask;
  uniform mat4 uProjection;
  uniform mat4 uProjectionInverse;
  uniform mat4 uCameraWorld;
  uniform vec2 uTexel;
  uniform float uIntensity;
  uniform float uReflectance;
  uniform float uMaxDistance;
  uniform float uThickness;
  uniform float uMinUp;
  uniform float uFadeDistance;
  uniform float uFrame;
  varying vec2 vUv;

  vec3 viewPosition(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjectionInverse * clip;
    return view.xyz / view.w;
  }

  // The flatter of the two one-sided differences on each axis, so a silhouette edge does not bend the normal.
  vec3 viewNormal(vec3 p) {
    vec3 r = viewPosition(vUv + vec2(uTexel.x, 0.0)) - p;
    vec3 l = p - viewPosition(vUv - vec2(uTexel.x, 0.0));
    vec3 u = viewPosition(vUv + vec2(0.0, uTexel.y)) - p;
    vec3 d = p - viewPosition(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(r.z) < abs(l.z) ? r : l;
    vec3 dy = abs(u.z) < abs(d.z) ? u : d;
    return normalize(cross(dx, dy));
  }

  vec2 toScreen(vec3 view) {
    vec4 clip = uProjection * vec4(view, 1.0);
    return clip.xy / clip.w * 0.5 + 0.5;
  }

  float interleavedNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    gl_FragColor = base;
    float gloss = texture2D(tMask, vUv).r;
    if (gloss <= 0.0 || texture2D(tDepth, vUv).x >= 0.99999) return;
    vec3 p = viewPosition(vUv);
    vec3 n = viewNormal(p);
    float up = (uCameraWorld * vec4(n, 0.0)).y;
    float mask = gloss * smoothstep(uMinUp, uMinUp + 0.15, up) * (1.0 - smoothstep(uFadeDistance * 0.7, uFadeDistance, -p.z));
    if (mask <= 0.0) return;
    vec3 v = normalize(p);
    vec3 r = reflect(v, n);
    float facing = max(dot(-v, n), 0.0);
    float fresnel = uReflectance + (1.0 - uReflectance) * pow(1.0 - facing, 5.0);

    float stepLength = uMaxDistance / ${steps.toFixed(1)};
    vec3 ray = p + n * 0.01 * (1.0 - p.z * 0.01) + r * stepLength * interleavedNoise(gl_FragCoord.xy + uFrame * 5.588238);
    vec3 before = p;
    vec2 hitUv = vec2(-1.0);
    float travelled = 0.0;
    for (int i = 0; i < ${steps}; i++) {
      vec2 uv = toScreen(ray);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ray.z > -0.01) break;
      float sceneZ = viewPosition(uv).z;
      float gap = sceneZ - ray.z;
      if (gap > 0.0 && gap < uThickness + stepLength) {
        // Halve back toward the last miss so the hit lands on the surface, not a step past it.
        vec3 lo = before;
        vec3 hi = ray;
        for (int k = 0; k < 4; k++) {
          vec3 mid = (lo + hi) * 0.5;
          if (viewPosition(toScreen(mid)).z - mid.z > 0.0) hi = mid; else lo = mid;
        }
        hitUv = toScreen(hi);
        travelled = float(i) / ${steps.toFixed(1)};
        break;
      }
      before = ray;
      ray += r * stepLength;
    }
    if (hitUv.x < 0.0) return;
    vec2 edge = smoothstep(vec2(0.0), vec2(0.08), hitUv) * smoothstep(vec2(0.0), vec2(0.08), 1.0 - hitUv);
    float weight = clamp(uIntensity * fresnel * mask * edge.x * edge.y * (1.0 - travelled * travelled), 0.0, 1.0);
    gl_FragColor = vec4(mix(base.rgb, texture2D(tDiffuse, hitUv).rgb, weight), base.a);
  }
`;
}

const maskVertex = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Only the nearest surface owns a pixel, so a glossy floor behind a rough crate stays unmasked there.
const maskFragment = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uGloss;
  void main() {
    if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / uResolution).x + 1e-4) discard;
    gl_FragColor = vec4(uGloss, 0.0, 0.0, 1.0);
  }
`;

/** How often the pass looks for glossy surfaces again, in frames. */
const GLOSS_RESCAN_FRAMES = 90;
/** Most glossy surfaces one frame masks; the nearest scan order keeps the first ones found. */
export const MAX_GLOSSY_SURFACES = 256;

/**
 * How strongly a mesh reflects, 0..1: `userData.ssr` (a number, `true` for 1, `false` for never)
 * wins; otherwise an opaque standard material reflects in proportion to how far its roughness is
 * under `maxRoughness`. Rough ground, foliage and anything transparent reflect nothing. @internal
 */
export function surfaceGloss(mesh: THREE.Mesh, maxRoughness: number): number {
  const authored = mesh.userData?.["ssr"];
  if (authored === false) return 0;
  if (authored === true) return 1;
  if (typeof authored === "number") return Math.min(1, Math.max(0, authored));
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const standard = material as THREE.MeshStandardMaterial | undefined;
  if (standard?.isMeshStandardMaterial !== true || standard.transparent || standard.alphaTest > 0 || standard.roughnessMap !== null) return 0;
  if (maxRoughness <= 0 || standard.roughness >= maxRoughness) return 0;
  return 1 - standard.roughness / maxRoughness;
}

/** Every visible mesh in `scene` that reflects, with its gloss, at most {@link MAX_GLOSSY_SURFACES}. @internal */
export function findGlossySurfaces(scene: THREE.Object3D, maxRoughness: number): { mesh: THREE.Mesh; gloss: number }[] {
  const found: { mesh: THREE.Mesh; gloss: number }[] = [];
  visitVisible(scene, (node) => {
    if (found.length >= MAX_GLOSSY_SURFACES) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || (mesh as THREE.SkinnedMesh).isSkinnedMesh === true || (mesh as THREE.InstancedMesh).isInstancedMesh === true) return;
    const gloss = surfaceGloss(mesh, maxRoughness);
    if (gloss > 0) found.push({ mesh, gloss });
  });
  return found;
}

/**
 * Screen-space reflections over the lit HDR frame. Reads the beauty depth, so like contact shadows it
 * only runs in a chain that samples depth; writes the reflected frame to the next buffer. @internal
 */
export class SsrPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly mask: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly maskScene = new THREE.Scene();
  private readonly proxies = new WeakMap<THREE.Mesh, { mesh: THREE.Mesh; material: THREE.ShaderMaterial }>();
  private readonly materials = new Set<THREE.ShaderMaterial>();
  private readonly resolution = new THREE.Vector2(1, 1);
  private surfaces: { mesh: THREE.Mesh; gloss: number }[] = [];
  private framesSinceScan = GLOSS_RESCAN_FRAMES;
  private frame = 0;
  private readonly maxRoughness: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly depth: THREE.DepthTexture,
    settings: Required<SsrConfig>,
    steps: number,
  ) {
    super();
    this.maxRoughness = settings.maxRoughness;
    this.mask = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        tMask: { value: this.mask.texture },
        uProjection: { value: new THREE.Matrix4() },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uIntensity: { value: settings.intensity },
        uReflectance: { value: Math.min(1, Math.max(0, settings.reflectance)) },
        uMaxDistance: { value: Math.max(0.1, settings.maxDistance) },
        uThickness: { value: Math.max(0.01, settings.thickness) },
        uMinUp: { value: settings.minUp },
        uFadeDistance: { value: Math.max(1, settings.fadeDistance) },
        uFrame: { value: 0 },
      },
      vertexShader,
      fragmentShader: ssrFragment(Math.max(1, Math.floor(steps))),
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    (this.material.uniforms["uTexel"]!.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.mask.setSize(width, height);
    this.resolution.set(width, height);
  }

  private proxyFor(mesh: THREE.Mesh): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
    let proxy = this.proxies.get(mesh);
    if (proxy !== undefined) return proxy;
    const material = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: this.depth }, uResolution: { value: this.resolution }, uGloss: { value: 0 } },
      vertexShader: maskVertex,
      fragmentShader: maskFragment,
    });
    const copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrixWorldAutoUpdate = false;
    proxy = { mesh: copy, material };
    this.proxies.set(mesh, proxy);
    this.materials.add(material);
    return proxy;
  }

  /** Draw the glossy surfaces' reflection strength into the mask; returns false when none are in view. */
  private drawMask(renderer: THREE.WebGLRenderer): boolean {
    this.framesSinceScan += 1;
    if (this.framesSinceScan >= GLOSS_RESCAN_FRAMES || this.surfaces.some(({ mesh }) => mesh.parent === null)) {
      this.surfaces = findGlossySurfaces(this.scene, this.maxRoughness);
      this.framesSinceScan = 0;
    }
    this.maskScene.clear();
    for (const { mesh, gloss } of this.surfaces) {
      if (mesh.parent === null || !mesh.visible) continue;
      const proxy = this.proxyFor(mesh);
      proxy.material.uniforms["uGloss"]!.value = gloss;
      proxy.mesh.geometry = mesh.geometry;
      proxy.mesh.matrixWorld.copy(mesh.matrixWorld);
      this.maskScene.add(proxy.mesh);
    }
    const clearColor = renderer.getClearColor(maskClear);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    const any = this.maskScene.children.length > 0;
    if (any) {
      const autoUpdate = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(this.maskScene, this.camera);
      renderer.shadowMap.autoUpdate = autoUpdate;
    }
    renderer.setClearColor(clearColor, clearAlpha);
    this.maskScene.clear();
    return any;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.drawMask(renderer)) {
      // Nothing glossy in view: pass the frame through untouched instead of marching every pixel.
      this.needsSwap = false;
      return;
    }
    this.needsSwap = true;
    const uniforms = this.material.uniforms;
    uniforms["tDiffuse"]!.value = readBuffer.texture;
    (uniforms["uProjection"]!.value as THREE.Matrix4).copy(this.camera.projectionMatrix);
    (uniforms["uProjectionInverse"]!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    (uniforms["uCameraWorld"]!.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    this.frame = (this.frame + 1) % 64;
    uniforms["uFrame"]!.value = this.frame;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
    this.mask.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.clear();
    this.maskScene.clear();
  }
}
