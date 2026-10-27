import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import { DEFAULT_CONTACT_SHADOWS, type ContactShadowConfig } from "@jgengine/core/render/postProcessing";
import { visitVisible } from "@jgengine/core/visibility/visitVisible.draw";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The contact-shadow ray march. Writes how much key light reaches each pixel, 1 where nothing blocks it.
 * @internal
 */
export function contactShadowFragment(steps: number): string {
  return /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjection;
  uniform mat4 uProjectionInverse;
  uniform vec3 uLightView;
  uniform float uIntensity;
  uniform float uLength;
  uniform float uThickness;
  uniform float uDistance;
  uniform float uFrame;
  varying vec2 vUv;

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjectionInverse * clip;
    return view.xyz / view.w;
  }

  float interleavedNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  float contactShadow() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 0.99999) return 0.0;
    vec3 origin = viewPosition(vUv, depth);
    float distance = -origin.z;
    float fade = 1.0 - smoothstep(uDistance * 0.6, uDistance, distance);
    vec3 crossed = cross(dFdx(origin), dFdy(origin));
    float area = length(crossed);
    if (area < 1e-10) return 0.0;
    vec3 normal = crossed / area;
    float facing = dot(normal, uLightView);
    // A surface turned away from the sun is already unlit; darkening it again reads as a dirty halo.
    if (fade <= 0.0 || facing <= 0.02) return 0.0;
    // Far pixels cover more ground, so the ray and the occluder slab grow with distance to stay visible.
    float scale = 1.0 + distance * 0.015;
    float stepLength = uLength * scale / ${steps.toFixed(1)};
    float thickness = uThickness * scale;
    float bias = 0.004 + distance * 0.0015;
    float jitter = interleavedNoise(gl_FragCoord.xy + uFrame * 5.588238);
    vec3 start = origin + normal * (0.01 * scale);
    float occlusion = 0.0;
    for (int i = 0; i < ${steps}; i++) {
      vec3 sampleView = start + uLightView * stepLength * (float(i) + jitter);
      vec4 clip = uProjection * vec4(sampleView, 1.0);
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) break;
      float sceneDepth = texture2D(tDepth, uv).x;
      if (sceneDepth >= 0.99999) continue;
      float delta = viewPosition(uv, sceneDepth).z - sampleView.z;
      if (delta > bias && delta < thickness) {
        // A hit near the start of the ray is the contact itself; later ones soften toward the tip.
        occlusion = 1.0 - float(i) / ${steps.toFixed(1)} * 0.5;
        break;
      }
    }
    vec2 edge = min(vUv, 1.0 - vUv);
    float edgeFade = smoothstep(0.0, 0.03, min(edge.x, edge.y));
    return occlusion * fade * edgeFade * uIntensity * smoothstep(0.02, 0.2, facing);
  }

  void main() {
    gl_FragColor = vec4(1.0 - contactShadow());
  }
`;
}

const lightPosition = new THREE.Vector3();
const targetPosition = new THREE.Vector3();

/**
 * The scene's key light: the strongest shadow-casting directional light, which is the sun or the
 * moon the shadow map already follows. A cascaded rig has several lights pointing the same way, so
 * any of them gives the direction. @internal
 */
export function findKeyLight(scene: THREE.Object3D): THREE.DirectionalLight | null {
  let best: THREE.DirectionalLight | null = null;
  visitVisible(scene, (object) => {
    const light = object as THREE.DirectionalLight;
    if (!light.isDirectionalLight || !light.castShadow || light.intensity <= 0) return;
    if (best === null || light.intensity > best.intensity) best = light;
  });
  return best;
}

/** Unit vector from the scene toward `light`, in world space. @internal */
export function towardLight(light: THREE.DirectionalLight, target: THREE.Vector3): THREE.Vector3 {
  light.getWorldPosition(lightPosition);
  light.target.getWorldPosition(targetPosition);
  target.subVectors(lightPosition, targetPosition);
  if (target.lengthSq() < 1e-10) target.set(0, 1, 0);
  return target.normalize();
}

/** Frames between key-light searches; a light added or removed mid-play is picked up within this. */
const LIGHT_RESCAN_FRAMES = 90;

/** Multiplies the shadow factor onto the colour target it is drawn over. */
const applyFragment = /* glsl */ `
  uniform sampler2D tShadow;
  varying vec2 vUv;
  void main() {
    float light = texture2D(tShadow, vUv).r;
    gl_FragColor = vec4(vec3(light), 1.0);
  }
`;

/**
 * Screen-space contact shadows over the lit HDR frame. Every pixel marches a short ray toward the
 * key light through the beauty pass's depth; a hit darkens it. It costs two full-screen passes and
 * no scene draw, and is skipped while the scene has no shadow-casting sun.
 *
 * Both composer targets share the beauty depth (a cloned depth texture shares its GPU image), so a
 * pass that samples depth may not draw into either of them. The ray march writes a light factor into
 * a target of its own, then a second draw multiplies it onto the colour in place.
 * @internal
 */
export class ContactShadowPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly applyMaterial: THREE.ShaderMaterial;
  readonly shadowTarget: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly applyQuad: FullScreenQuad;
  private light: THREE.DirectionalLight | null = null;
  private framesSinceScan = LIGHT_RESCAN_FRAMES;
  private frame = 0;
  private readonly lightWorld = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    depth: THREE.DepthTexture,
    config: ContactShadowConfig,
    steps: number,
  ) {
    super();
    this.needsSwap = false;
    const settings = { ...DEFAULT_CONTACT_SHADOWS, ...config };
    this.shadowTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depth },
        uProjection: { value: new THREE.Matrix4() },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uLightView: { value: new THREE.Vector3(0, 1, 0) },
        uIntensity: { value: settings.intensity },
        uLength: { value: settings.length },
        uThickness: { value: settings.thickness },
        uDistance: { value: settings.distance },
        uFrame: { value: 0 },
      },
      vertexShader,
      fragmentShader: contactShadowFragment(steps),
      depthTest: false,
      depthWrite: false,
    });
    this.applyMaterial = new THREE.ShaderMaterial({
      uniforms: { tShadow: { value: this.shadowTarget.texture } },
      vertexShader,
      fragmentShader: applyFragment,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
    });
    this.quad = new FullScreenQuad(this.material);
    this.applyQuad = new FullScreenQuad(this.applyMaterial);
  }

  /** The light the pass is shadowing from, refreshed every {@link LIGHT_RESCAN_FRAMES} frames. */
  keyLight(): THREE.DirectionalLight | null {
    this.framesSinceScan += 1;
    const lost = this.light !== null && (this.light.parent === null || !this.light.castShadow);
    if (lost || this.framesSinceScan >= LIGHT_RESCAN_FRAMES) {
      this.light = findKeyLight(this.scene);
      this.framesSinceScan = 0;
    }
    return this.light;
  }

  override setSize(width: number, height: number): void {
    this.shadowTarget.setSize(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const light = this.keyLight();
    if (light === null) return;
    const uniforms = this.material.uniforms;
    towardLight(light, this.lightWorld);
    (uniforms["uLightView"]!.value as THREE.Vector3).copy(this.lightWorld).transformDirection(this.camera.matrixWorldInverse);
    (uniforms["uProjection"]!.value as THREE.Matrix4).copy(this.camera.projectionMatrix);
    (uniforms["uProjectionInverse"]!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    this.frame = (this.frame + 1) % 64;
    uniforms["uFrame"]!.value = this.frame;

    renderer.setRenderTarget(this.shadowTarget);
    this.quad.render(renderer);
    // Drawn over the frame, so the renderer must not clear the target first.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = autoClear;
  }

  override dispose(): void {
    this.shadowTarget.dispose();
    this.material.dispose();
    this.applyMaterial.dispose();
    this.quad.dispose();
    this.applyQuad.dispose();
  }
}
