import * as THREE from "three";
import { FullScreenQuad, Pass, type RenderPass } from "three-stdlib";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The beauty copy's fragment shader, exported for the GPU check of the pass that replaces it. @internal */
export const BEAUTY_COPY_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

/**
 * Draws the scene into a target of its own, the one carrying the depth texture the depth-reading
 * effects sample (AO, contact shadows, SSR, haze, motion blur, temporal AA), then copies the colour
 * into the chain. The composer's two ping-pong buffers never carry that depth, so no effect can
 * write into a target whose depth it samples (a WebGL feedback loop that draws black), and the depth
 * is always this frame's, whichever buffer the chain starts on after a pass skipped its swap.
 * @internal
 */
export class BeautyPass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  /** The copy into the chain; `bun run perf post-audit` draws it as the reference for the composite. */
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(
    readonly scenePass: RenderPass,
    depth: THREE.DepthTexture,
    width: number,
    height: number,
  ) {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthTexture: depth });
    this.material = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: this.target.texture } }, vertexShader, fragmentShader: BEAUTY_COPY_FRAGMENT, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.scenePass.setSize(width, height);
  }

  /** False when a later pass (`SceneCompositePass`) reads {@link target} itself, so the copy would be redrawn over. */
  copies = true;

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.scenePass.renderToScreen = false;
    this.scenePass.render(renderer, writeBuffer, this.target);
    if (!this.copies && !this.renderToScreen) return;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.scenePass.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
