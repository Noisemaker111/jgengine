import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** How long post effects take to fade in once their programs are linked. @internal */
export const REVEAL_FADE_SECONDS = 0.3;

/**
 * The longest step one frame may take through the fade, so a slow frame still shows a few frames
 * of it rather than jumping straight to the end.
 * @internal
 */
export const REVEAL_FADE_MAX_STEP = 1 / 30;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const copyShader = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

const overShader = /* glsl */ `
uniform sampler2D tPlain;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tPlain, vUv).rgb, uOpacity);
}
`;

function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
}

/**
 * Keeps a copy of the beauty pass, before any effect touches it, for {@link RevealFadePass} to fade
 * from. Draws nothing into the chain itself.
 * @internal
 */
export class RevealSnapshotPass extends Pass {
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly fade: RevealFadePass) {
    super();
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader, fragmentShader: copyShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms["tDiffuse"]!.value = readBuffer.texture;
    renderer.setRenderTarget(this.fade.plain);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}

/**
 * Fades the chain's effects in over the frame without them. It takes the beauty copy the
 * {@link RevealSnapshotPass} kept, tone maps it the way the chain's OutputPass does, and lays it
 * over the full chain's result with the opacity `progress` leaves: 0 is the frame without effects,
 * 1 the full chain. It sits after the passes it fades and before the grade, so the grade applies to
 * both alike.
 *
 * It draws onto the buffer it reads instead of swapping, like the snapshot. A pass that swaps would
 * flip which of the composer's two buffers the next frame's beauty pass draws into while the fade
 * runs, and only one of them carries the depth texture the AO, contact shadow and haze passes read:
 * the frame after the fade then drew those effects from a stale depth.
 * @internal
 */
export class RevealFadePass extends Pass {
  progress = 0;
  readonly plain: THREE.WebGLRenderTarget;
  private readonly plainDisplay: THREE.WebGLRenderTarget;
  private readonly output = new OutputPass();
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly copyQuad: FullScreenQuad;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = false;
    this.plain = createTarget(width, height);
    this.plainDisplay = createTarget(width, height);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tPlain: { value: this.plainDisplay.texture }, uOpacity: { value: 1 } },
      vertexShader,
      fragmentShader: overShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.copyMaterial = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader, fragmentShader: copyShader, depthTest: false, depthWrite: false });
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }

  override setSize(width: number, height: number): void {
    this.plain.setSize(width, height);
    this.plainDisplay.setSize(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.output.renderToScreen = false;
    this.output.render(renderer, this.plainDisplay, this.plain, 0, false);
    this.material.uniforms["uOpacity"]!.value = 1 - this.progress * this.progress * (3 - 2 * this.progress);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      if (this.renderToScreen) {
        // Last in the chain: the full result goes to the canvas first, then the frame without effects over it.
        this.copyMaterial.uniforms["tDiffuse"]!.value = readBuffer.texture;
        renderer.setRenderTarget(null);
        this.copyQuad.render(renderer);
      } else {
        renderer.setRenderTarget(readBuffer);
      }
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  override dispose(): void {
    this.plain.dispose();
    this.plainDisplay.dispose();
    this.output.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.copyMaterial.dispose();
    this.copyQuad.dispose();
  }
}

/** The fade's next progress after a frame of `delta` seconds. @internal */
export function stepRevealFade(progress: number, delta: number): number {
  return Math.min(1, progress + Math.min(Math.max(0, delta), REVEAL_FADE_MAX_STEP) / REVEAL_FADE_SECONDS);
}
