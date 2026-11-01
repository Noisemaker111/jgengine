import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import type { MotionBlurConfig } from "@jgengine/core/render/postProcessing";

const bodies = new Set<THREE.Object3D>();

/**
 * Let motion blur follow a moving body (a character, a car, a thrown crate) along its own screen
 * motion. Every model entity registers itself; register anything else that moves. Returns the
 * unregister call. Only registered bodies are walked each frame, never the whole scene.
 */
export function registerMotionBlurBody(root: THREE.Object3D): () => void {
  bodies.add(root);
  return () => {
    bodies.delete(root);
  };
}

/** The registered bodies, for tests and the velocity prepass. @internal */
export function motionBlurBodies(): ReadonlySet<THREE.Object3D> {
  return bodies;
}

const fullScreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const velocityVertex = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  uniform mat4 uPrevModel;
  uniform mat4 uPrevViewProjection;
  varying vec4 vCurrent;
  varying vec4 vPrevious;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vCurrent = projectionMatrix * viewMatrix * modelMatrix * vec4(transformed, 1.0);
    vPrevious = uPrevViewProjection * uPrevModel * vec4(transformed, 1.0);
    gl_Position = vCurrent;
  }
`;

// Hidden behind the beauty depth means another surface owns the pixel and the camera blur applies.
const velocityFragment = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  varying vec4 vCurrent;
  varying vec4 vPrevious;
  void main() {
    if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / uResolution).x + 1e-4) discard;
    gl_FragColor = vec4(vCurrent.xy / vCurrent.w * 0.5 - vPrevious.xy / vPrevious.w * 0.5, 0.0, 1.0);
  }
`;

/** The blur itself: camera reprojection everywhere, a body's own motion where the prepass drew one. @internal */
export function motionBlurFragment(samples: number): string {
  return /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tVelocity;
  uniform mat4 uProjectionInverse;
  uniform mat4 uCameraWorld;
  uniform mat4 uPrevViewProjection;
  uniform float uCamera;
  uniform float uObjects;
  uniform float uScale;
  uniform float uMaxBlur;
  uniform float uAspect;
  uniform float uFrame;
  varying vec2 vUv;

  float interleavedNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    float depth = min(texture2D(tDepth, vUv).x, 0.9999);
    vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 world = uCameraWorld * vec4(view.xyz / view.w, 1.0);
    vec4 previous = uPrevViewProjection * world;
    vec2 velocity = previous.w > 0.0 ? (vUv - (previous.xy / previous.w * 0.5 + 0.5)) * uCamera : vec2(0.0);
    vec4 body = texture2D(tVelocity, vUv);
    if (body.a > 0.5) velocity = body.xy * uObjects;
    velocity *= uScale;
    // The cap is measured across the frame's width, so a tall and a wide window blur alike.
    vec2 span = velocity * vec2(uAspect, 1.0);
    float length2 = length(span);
    float cap = uMaxBlur * uAspect;
    if (length2 > cap) velocity *= cap / length2;
    vec4 base = texture2D(tDiffuse, vUv);
    if (length2 < 0.0005) {
      gl_FragColor = base;
      return;
    }
    float jitter = interleavedNoise(gl_FragCoord.xy + uFrame * 5.588238);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < ${samples}; i++) {
      float t = (float(i) + jitter) / ${samples.toFixed(1)} - 0.5;
      sum += texture2D(tDiffuse, clamp(vUv - velocity * t, vec2(0.0), vec2(1.0)));
    }
    gl_FragColor = vec4(sum.rgb / ${samples.toFixed(1)}, base.a);
  }
`;
}

/**
 * How long the blur is relative to the last frame's motion: a shutter of `shutter` 60 Hz frames over
 * a frame that took `delta` seconds. Bounded, so a hitch does not smear the screen. @internal
 */
export function motionBlurScale(shutter: number, delta: number): number {
  if (!(delta > 0)) return 0;
  return Math.min(4, Math.max(0, shutter) / (60 * delta));
}

const PROXY_PRUNE_FRAMES = 240;

interface VelocityProxy {
  source: THREE.Mesh;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  previousModel: THREE.Matrix4;
  previous: THREE.Matrix4;
  seen: number;
}

/**
 * Camera and per-object motion blur. A small prepass draws only the registered bodies that moved,
 * into a velocity target; the blur then reprojects the rest of the frame through last frame's camera.
 * @internal
 */
export class MotionBlurPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly velocity: THREE.WebGLRenderTarget;
  private readonly uniforms: {
    tDiffuse: THREE.IUniform<THREE.Texture | null>;
    tDepth: THREE.IUniform<THREE.DepthTexture>;
    tVelocity: THREE.IUniform<THREE.Texture>;
    uProjectionInverse: THREE.IUniform<THREE.Matrix4>;
    uCameraWorld: THREE.IUniform<THREE.Matrix4>;
    uPrevViewProjection: THREE.IUniform<THREE.Matrix4>;
    uCamera: THREE.IUniform<number>;
    uObjects: THREE.IUniform<number>;
    uScale: THREE.IUniform<number>;
    uMaxBlur: THREE.IUniform<number>;
    uAspect: THREE.IUniform<number>;
    uFrame: THREE.IUniform<number>;
  };
  private readonly quad: FullScreenQuad;
  private readonly velocityScene = new THREE.Scene();
  private readonly proxies = new WeakMap<THREE.Mesh, VelocityProxy>();
  private readonly active: VelocityProxy[] = [];
  private readonly every = new Set<VelocityProxy>();
  private readonly resolution = new THREE.Vector2(1, 1);
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly currentViewProjection = new THREE.Matrix4();
  private hasPrevious = false;
  private frame = 0;
  private readonly settings: Required<MotionBlurConfig>;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly depth: THREE.DepthTexture,
    settings: Required<MotionBlurConfig>,
    samples: number,
  ) {
    super();
    this.settings = settings;
    this.velocity = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      tVelocity: { value: this.velocity.texture },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: this.previousViewProjection },
      uCamera: { value: Math.max(0, settings.camera) },
      uObjects: { value: Math.max(0, settings.objects) },
      uScale: { value: 0 },
      uMaxBlur: { value: Math.max(0, settings.maxBlur) },
      uAspect: { value: 1 },
      uFrame: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: fullScreenVertex,
      fragmentShader: motionBlurFragment(Math.max(2, Math.floor(samples))),
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.velocity.setSize(width, height);
    this.uniforms.uAspect.value = width / Math.max(1, height);
    this.resolution.set(width, height);
  }

  private proxyFor(mesh: THREE.Mesh): VelocityProxy {
    let proxy = this.proxies.get(mesh);
    if (proxy !== undefined) return proxy;
    const previousModel = new THREE.Matrix4();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.depth },
        uResolution: { value: this.resolution },
        uPrevModel: { value: previousModel },
        uPrevViewProjection: { value: this.previousViewProjection },
      },
      vertexShader: velocityVertex,
      fragmentShader: velocityFragment,
    });
    let copy: THREE.Mesh;
    if (mesh instanceof THREE.SkinnedMesh) {
      const skinnedCopy = new THREE.SkinnedMesh(mesh.geometry, material);
      skinnedCopy.bind(mesh.skeleton, mesh.bindMatrix);
      copy = skinnedCopy;
    } else copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrixWorldAutoUpdate = false;
    proxy = { source: mesh, mesh: copy, material, previousModel, previous: mesh.matrixWorld.clone(), seen: -1 };
    this.proxies.set(mesh, proxy);
    this.every.add(proxy);
    return proxy;
  }

  /** Release the copies of meshes no body has shown for a few seconds (a despawned enemy, a swapped look). */
  private pruneProxies(): void {
    if (this.frame % PROXY_PRUNE_FRAMES !== 0) return;
    for (const proxy of this.every) {
      if (this.frame - proxy.seen < PROXY_PRUNE_FRAMES) continue;
      proxy.material.dispose();
      this.proxies.delete(proxy.source);
      this.every.delete(proxy);
    }
  }

  /** Put every visible mesh of a registered body into the velocity scene, with last frame's matrix. */
  private gatherBodies(): void {
    this.velocityScene.clear();
    this.active.length = 0;
    if (this.settings.objects <= 0) return;
    for (const root of bodies) {
      if (root.parent === null || !root.visible) continue;
      root.traverseVisible((node) => {
        if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
        const mesh = node;
        const proxy = this.proxyFor(mesh);
        const fresh = proxy.seen !== this.frame - 1;
        proxy.seen = this.frame;
        proxy.previousModel.copy(fresh ? mesh.matrixWorld : proxy.previous);
        proxy.previous.copy(mesh.matrixWorld);
        proxy.mesh.matrixWorld.copy(mesh.matrixWorld);
        if (proxy.mesh instanceof THREE.SkinnedMesh && mesh instanceof THREE.SkinnedMesh) proxy.mesh.bindMatrixInverse.copy(mesh.bindMatrixInverse);
        this.velocityScene.add(proxy.mesh);
        this.active.push(proxy);
      });
    }
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime?: number): void {
    this.frame += 1;
    this.currentViewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    if (!this.hasPrevious) this.previousViewProjection.copy(this.currentViewProjection);
    this.gatherBodies();
    this.pruneProxies();

    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.velocity);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    if (this.active.length > 0) {
      const autoUpdate = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(this.velocityScene, this.camera);
      renderer.shadowMap.autoUpdate = autoUpdate;
    }
    renderer.setClearColor(clearColor, clearAlpha);

    const uniforms = this.uniforms;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.uProjectionInverse.value.copy(this.camera.projectionMatrixInverse);
    uniforms.uCameraWorld.value.copy(this.camera.matrixWorld);
    uniforms.uScale.value = motionBlurScale(this.settings.shutter, deltaTime ?? 1 / 60);
    uniforms.uFrame.value = this.frame % 64;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);

    this.previousViewProjection.copy(this.currentViewProjection);
    this.hasPrevious = true;
    this.velocityScene.clear();
  }

  /** Forget last frame's camera, so a cut or a teleport does not blur the first frame after it. */
  reset(): void {
    this.hasPrevious = false;
  }

  override dispose(): void {
    this.velocity.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.velocityScene.clear();
    for (const proxy of this.every) proxy.material.dispose();
    this.every.clear();
  }
}
