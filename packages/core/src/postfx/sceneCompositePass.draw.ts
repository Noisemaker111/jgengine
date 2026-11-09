import * as THREE from "three";
import { Pass } from "three-stdlib";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { GTAOBlendShader } from "three/examples/jsm/shaders/GTAOShader.js";
import { HALF_ROUNDING_GLSL } from "./halfPrecision.draw";

/** The composite's fragment shader, exported for the GPU check that it matches the three draws. @internal */
export const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tBeauty;
  uniform sampler2D tAo;
  uniform sampler2D tShadow;
  uniform bool uAo;
  uniform bool uShadow;
  uniform float uIntensity;
  varying vec2 vUv;
  ${HALF_ROUNDING_GLSL}
  void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    // The beauty copy: same size, so the copy's sample is this texel exactly.
    vec4 color = texelFetch(tBeauty, texel, 0);
    if (uAo) {
      // three's GTAO blend: its fragment, then a multiply blend (alpha by alpha).
      vec4 ao = texture2D(tAo, vUv);
      vec4 factor = rtz16(vec4(mix(vec3(1.), ao.rgb, uIntensity), ao.a));
      color = vec4(rne16(color.rgb * factor.rgb), rne16(vec3(color.a * factor.a)).x);
    }
    if (uShadow) {
      // The contact-shadow apply: its light factor multiplied onto colour; alpha times one is unchanged.
      color.rgb = rne16(color.rgb * rtz16(texelFetch(tShadow, texel, 0).r));
    }
    gl_FragColor = color;
  }
`;

/**
 * The front of the chain in one full-screen draw: the beauty copy, the GTAO multiply and the contact
 * shadow multiply, which were three draws each reading and writing the whole frame. Each of those
 * passes still computes its own result (AO and denoise, the shadow march) and hands the texture here
 * instead of drawing it onto the frame.
 *
 * The bits are the ones the three draws left: every blend rounding is redone in the shader with
 * {@link HALF_ROUNDING_GLSL}, and the AO is sampled with three's own quad and vertex shader, so its
 * bilinear upsample lands on the same coordinates as three's blend did. `bun run check postfx-exact`
 * compares the two on the GPU over random HDR frames, for every combination of the two multiplies,
 * with the AO blend at 1. At other blends the compiler forms three's `mix` differently in this
 * shader (measured on the RTX 3070), so the chain only fuses at 1.
 * @internal
 */
export class SceneCompositePass extends Pass {
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private ao: { texture: THREE.Texture; intensity: number } | null = null;
  private shadow: THREE.Texture | null = null;
  /** What the last render multiplied on, for `bun run perf post-audit` to redraw both ways. */
  readonly drawn: { ao: { texture: THREE.Texture; intensity: number } | null; shadow: THREE.Texture | null } = { ao: null, shadow: null };

  constructor(private readonly beauty: THREE.Texture) {
    super();
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tBeauty: { value: beauty },
        tAo: { value: null },
        tShadow: { value: null },
        uAo: { value: false },
        uShadow: { value: false },
        uIntensity: { value: 1 },
      },
      vertexShader: GTAOBlendShader.vertexShader,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** This frame's denoised AO, which the next render multiplies on. */
  takeAo(texture: THREE.Texture, intensity: number): void {
    this.ao = { texture, intensity };
  }

  /** This frame's contact-shadow light factor, which the next render multiplies on. */
  takeShadow(texture: THREE.Texture): void {
    this.shadow = texture;
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.drawn.ao = this.ao;
    this.drawn.shadow = this.shadow;
    this.draw(renderer, this.renderToScreen ? null : readBuffer);
    this.ao = null;
    this.shadow = null;
  }

  /** Draw the last render's composite again into `target`, from the same inputs. */
  redraw(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    this.draw(renderer, target);
  }

  private draw(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    const uniforms = this.material.uniforms;
    const { ao, shadow } = this.drawn;
    uniforms["tBeauty"]!.value = this.beauty;
    uniforms["uAo"]!.value = ao !== null;
    uniforms["tAo"]!.value = ao?.texture ?? null;
    uniforms["uIntensity"]!.value = ao?.intensity ?? 1;
    uniforms["uShadow"]!.value = shadow !== null;
    uniforms["tShadow"]!.value = shadow;
    // Every texel is overwritten without blending, so clearing the target first would be wasted.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
