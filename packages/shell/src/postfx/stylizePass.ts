import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

import type { StylizeConfig } from "@jgengine/core/render/postProcessing";

import { isPostfxOverlay } from "./postfxOverlay";

const DEFAULT_OUTLINE_COLOR = "#101014";
const DEFAULT_DEPTH_THRESHOLD = 0.08;
const DEFAULT_NORMAL_THRESHOLD = 0.35;
const DEFAULT_FADE_DISTANCE = 160;

const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform bool uOrtho;
  uniform bool uOutline;
  uniform vec3 uOutlineColor;
  uniform float uOutlineOpacity;
  uniform float uThickness;
  uniform float uDepthThreshold;
  uniform float uNormalThreshold;
  uniform float uFade;
  uniform float uBands;
  uniform float uPixel;
  varying vec2 vUv;

  float viewDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -(uOrtho ? orthographicDepthToViewZ(d, uNear, uFar) : perspectiveDepthToViewZ(d, uNear, uFar));
  }

  vec3 viewNormal(vec2 uv) {
    return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  }

  // Ink a normal crease only on its nearer side, so a thin or tiny feature stays one line wide
  // instead of stamping a plus-shaped blot onto the surface behind it.
  float crease(vec3 nc, float dc, vec2 uv, float dn) {
    return (1.0 - dot(nc, viewNormal(uv))) * step(dc, dn + dc * 0.02);
  }

  void main() {
    vec2 uv = vUv;
    if (uPixel > 1.0) {
      vec2 block = uPixel / uResolution;
      uv = (floor(uv / block) + 0.5) * block;
    }
    vec3 c = texture2D(tDiffuse, uv).rgb;

    if (uBands > 0.5) {
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float x = min(luma * uBands, uBands - 0.001);
      // Each band takes its centre brightness: the darkest band keeps colour instead of going black
      // and the top band never clips a bright sky to flat white. A narrow soft step hides aliasing.
      float q = (floor(x) + 0.5 + smoothstep(0.92, 1.0, fract(x))) / uBands;
      c *= q / max(luma, 1e-4);
    }

    if (uOutline) {
      vec2 px = uThickness / uResolution;
      float dc = viewDepth(uv);
      float dl = viewDepth(uv - vec2(px.x, 0.0));
      float dr = viewDepth(uv + vec2(px.x, 0.0));
      float dd = viewDepth(uv - vec2(0.0, px.y));
      float du = viewDepth(uv + vec2(0.0, px.y));
      // Laplacian is zero across flat planes at any angle, so only real depth breaks draw lines.
      float lap = abs(dl + dr + dd + du - 4.0 * dc) / max(dc, 1e-3);
      float nearest = min(dc, min(min(dl, dr), min(dd, du)));
      // Same nearer-side rule as creases: the background around a silhouette stays clean.
      float depthEdge = smoothstep(uDepthThreshold, uDepthThreshold * 2.0, lap) * step(dc, nearest + dc * 0.03);

      vec3 nc = viewNormal(uv);
      float nd = max(
        max(crease(nc, dc, uv - vec2(px.x, 0.0), dl), crease(nc, dc, uv + vec2(px.x, 0.0), dr)),
        max(crease(nc, dc, uv - vec2(0.0, px.y), dd), crease(nc, dc, uv + vec2(0.0, px.y), du))
      );
      float normalEdge = smoothstep(uNormalThreshold, uNormalThreshold + 0.25, nd);

      float fade = 1.0 - smoothstep(uFade * 0.5, uFade, nearest);
      float edge = max(depthEdge, normalEdge) * fade * uOutlineOpacity;
      c = mix(c, uOutlineColor, clamp(edge, 0.0, 1.0));
    }

    gl_FragColor = vec4(c, 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

type MaterialLike = THREE.Material | THREE.Material[];

function skipsDepthPrepass(material: MaterialLike): boolean {
  const list = Array.isArray(material) ? material : [material];
  // Shader materials place vertices in their own code, which the override material cannot reproduce.
  return list.some((m) => m.transparent || m.alphaTest > 0 || !m.depthWrite || !m.colorWrite || (m as THREE.ShaderMaterial).isShaderMaterial === true);
}

/**
 * Hide what the outline prepass must not see: marked overlays, points/lines/sprites, custom
 * shader meshes, and transparent or alpha-cut meshes (foliage cards would otherwise outline as
 * solid quads).
 */
function hideForPrepass(scene: THREE.Object3D, out: THREE.Object3D[]): void {
  out.length = 0;
  scene.traverse((object) => {
    if (!object.visible) return;
    const drawable = object as THREE.Mesh;
    const hide =
      isPostfxOverlay(object) ||
      (object as THREE.Points).isPoints === true ||
      (object as THREE.Line).isLine === true ||
      (object as THREE.Sprite).isSprite === true ||
      (drawable.isMesh === true && skipsDepthPrepass(drawable.material));
    if (!hide) return;
    object.visible = false;
    out.push(object);
  });
}

/**
 * Art-style post pass: ink outlines from a normal+depth prepass, cel luminance bands, and
 * pixelation. Runs on the display-space frame after `OutputPass`. The prepass renders only
 * when outlines are on, and reuses the frame's shadow maps instead of re-rendering them.
 */
export class StylizePass extends Pass {
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  private readonly normalTarget: THREE.WebGLRenderTarget | null;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly hidden: THREE.Object3D[] = [];
  private readonly clearColor = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    config: StylizeConfig,
  ) {
    super();
    const outline = config.outline === undefined || config.outline === false ? null : config.outline;
    this.normalTarget = outline === null
      ? null
      : new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1), type: THREE.UnsignedByteType });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalTarget?.texture ?? null },
        tDepth: { value: this.normalTarget?.depthTexture ?? null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uOrtho: { value: false },
        uOutline: { value: outline !== null },
        uOutlineColor: { value: new THREE.Color(outline?.color ?? DEFAULT_OUTLINE_COLOR) },
        uOutlineOpacity: { value: outline?.opacity ?? 1 },
        uThickness: { value: Math.max(0.5, outline?.thickness ?? 1) },
        uDepthThreshold: { value: outline?.depthThreshold ?? DEFAULT_DEPTH_THRESHOLD },
        uNormalThreshold: { value: outline?.normalThreshold ?? DEFAULT_NORMAL_THRESHOLD },
        uFade: { value: outline?.fadeDistance ?? DEFAULT_FADE_DISTANCE },
        uBands: { value: Math.max(0, Math.floor(config.bands ?? 0)) },
        uPixel: { value: Math.max(0, config.pixelSize ?? 0) },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.material.uniforms.uResolution.value.set(width, height);
    this.normalTarget?.setSize(width, height);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const uniforms = this.material.uniforms;
    if (this.normalTarget !== null) this.renderPrepass(renderer, this.normalTarget);
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;
    uniforms.uOrtho.value = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  private renderPrepass(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    const scene = this.scene;
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousShadowUpdate = renderer.shadowMap.autoUpdate;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    hideForPrepass(scene, this.hidden);
    scene.overrideMaterial = this.normalMaterial;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setClearColor(this.clearColor, previousClearAlpha);
    renderer.shadowMap.autoUpdate = previousShadowUpdate;
    scene.background = previousBackground;
    scene.overrideMaterial = previousOverride;
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;
  }

  override dispose(): void {
    this.material.dispose();
    this.normalMaterial.dispose();
    this.quad.dispose();
    this.normalTarget?.depthTexture?.dispose();
    this.normalTarget?.dispose();
  }
}
