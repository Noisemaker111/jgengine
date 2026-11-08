import * as THREE from "three";
import { UnrealBloomPass } from "three-stdlib";

interface BloomInternals {
  fsQuad: { material: THREE.Material; render(renderer: THREE.WebGLRenderer): void };
  highPassUniforms: Record<string, THREE.IUniform>;
  copyUniforms: Record<string, THREE.IUniform>;
}

/**
 * three-stdlib's UnrealBloomPass with the same draws, materials and targets, minus the clear before
 * each one. Every bloom draw covers its whole target without blending, so each of those twelve clears
 * was overwritten in full: the image is bit-identical, for twelve fewer GL clears and their CPU calls.
 * @internal
 */
export class BloomPass extends UnrealBloomPass {
  constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold);
    // The clears also emptied each target's depth, against which these quads always passed; with no
    // clear the depth test must be off instead, or a fresh target's zeroed depth would reject them.
    for (const material of [this.materialHighPassFilter, ...this.separableBlurMaterials, this.compositeMaterial]) {
      material.depthTest = false;
      material.depthWrite = false;
    }
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    if (this.renderToScreen) {
      // Drawing straight to the screen also shows the frame under the bloom; three's path does that.
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    const internals = this as unknown as BloomInternals;
    const quad = internals.fsQuad;
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    if (maskActive) renderer.state.buffers.stencil.setTest(false);
    internals.highPassUniforms["tDiffuse"]!.value = readBuffer.texture;
    internals.highPassUniforms["luminosityThreshold"]!.value = this.threshold;
    quad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    quad.render(renderer);
    let input = this.renderTargetBright;
    for (let mip = 0; mip < this.nMips; mip++) {
      const blur = this.separableBlurMaterials[mip]!;
      const horizontal = this.renderTargetsHorizontal[mip]!;
      const vertical = this.renderTargetsVertical[mip]!;
      quad.material = blur;
      blur.uniforms["colorTexture"]!.value = input.texture;
      blur.uniforms["direction"]!.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(horizontal);
      quad.render(renderer);
      blur.uniforms["colorTexture"]!.value = horizontal.texture;
      blur.uniforms["direction"]!.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(vertical);
      quad.render(renderer);
      input = vertical;
    }
    quad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms["bloomStrength"]!.value = this.strength;
    this.compositeMaterial.uniforms["bloomRadius"]!.value = this.radius;
    this.compositeMaterial.uniforms["bloomTintColors"]!.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]!);
    quad.render(renderer);
    quad.material = this.materialCopy;
    internals.copyUniforms["tDiffuse"]!.value = this.renderTargetsHorizontal[0]!.texture;
    if (maskActive) renderer.state.buffers.stencil.setTest(true);
    renderer.setRenderTarget(readBuffer);
    quad.render(renderer);
    renderer.autoClear = oldAutoClear;
  }
}
