import * as THREE from "three";
import { FullScreenQuad as PlaneQuad, UnrealBloomPass, type Pass } from "three-stdlib";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { drawsHeld } from "../render/shaderWarmup.draw";
import { TextureComparer } from "../render/textureComparer.draw";
import { AtmospherePass } from "./atmospherePass.draw";
import { BeautyPass } from "./beautyPass.draw";
import { BloomPass } from "./bloomPass.draw";
import { POST_AUDIT_CHECKS, type PostAuditCheck } from "./postAuditChecks";
import { ContactShadowPass } from "./contactShadowPass.draw";
import { SceneCompositePass } from "./sceneCompositePass.draw";

/** Frames between audited frames, so the audit's extra draws and readback barely move the frame rate. */
const AUDIT_EVERY = 20;


/** What the changed draws did and, with the audit on, what comparing them with three's draws found. */
export type PostAuditStats = {
  /** Frames that drew at least one changed draw. */
  changedFrames: number;
  /**
   * Audited frames; those dropped because a program either way was still linking (the engine holds
   * such a draw, which would leave its target as it was); those that threw.
   */
  auditFrames: number;
  auditSkipped: number;
  auditFailed: number;
} & Record<`${PostAuditCheck}${"Frames" | "Texels" | "Differing"}`, number>;

function emptyStats(): PostAuditStats {
  const stats: Record<string, number> = { changedFrames: 0, auditFrames: 0, auditSkipped: 0, auditFailed: 0 };
  for (const check of POST_AUDIT_CHECKS) for (const field of ["Frames", "Texels", "Differing"]) stats[`${check}${field}`] = 0;
  return stats as PostAuditStats; // type-escape: the loop above fills exactly the keys the mapped type names
}

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D tSource;
  void main() {
    gl_FragColor = texelFetch(tSource, ivec2(gl_FragCoord.xy), 0);
  }
`;

/** The atmosphere's former second draw: its march went to a half-float target of its own, which this blended over the frame. */
const ATMOSPHERE_APPLY_FRAGMENT = /* glsl */ `
  uniform sampler2D tAtmosphere;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tAtmosphere, vUv);
  }
`;

type Program = { isReady?: () => boolean };
type Quad = { material: THREE.Material | null; render(renderer: THREE.WebGLRenderer): void };

/**
 * Checks every draw the post chain does differently from three's own passes on live frames
 * (`?postAudit=1`, read by `bun run perf post-audit`). Every {@link AUDIT_EVERY}th frame it redraws,
 * from the same inputs into spare targets, each changed draw both ways and counts the texels whose
 * bits differ:
 * - `composite`: `SceneCompositePass` against the beauty copy, three's GTAO blend and the contact
 *   shadow apply as the three draws they were;
 * - `atmosphere`: the march blended straight over a frame against the march into its own half-float
 *   target and a second blended draw;
 * - `bloom`: `BloomPass` against three-stdlib's `UnrealBloomPass` with the same settings.
 * The atmosphere and bloom start from this frame's beauty image, the HDR scene they draw over.
 * A frame on which any program either way was still linking is dropped: the engine holds a draw whose
 * program is not ready, which would leave its target as it was. Nothing it draws reaches the screen.
 * @internal
 */
export class PostAudit {
  readonly stats: PostAuditStats = emptyStats();
  private readonly comparer = new TextureComparer();
  private readonly copyMaterial = new THREE.ShaderMaterial({ uniforms: { tSource: { value: null } }, vertexShader: QUAD_VERTEX, fragmentShader: COPY_FRAGMENT, depthTest: false, depthWrite: false });
  private readonly applyMaterial = new THREE.ShaderMaterial({
    uniforms: { tAtmosphere: { value: null } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: ATMOSPHERE_APPLY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  /** three-stdlib's quad (a plane), which the beauty copy, contact apply, atmosphere and sharpen draw with. */
  private readonly plane: Quad = new PlaneQuad(this.copyMaterial);
  /** three's quad (one triangle), which GTAO's blend draws with. */
  private readonly triangle: Quad & { dispose(): void } = new FullScreenQuad();
  private readonly half = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
  private bloom: UnrealBloomPass | null = null;
  private frame = 0;

  constructor(private readonly auditing: boolean) {}

  /** Count what the frame just drawn changed, and on an audit frame compare each changed draw with three's. */
  afterFrame(renderer: THREE.WebGLRenderer, passes: readonly Pass[]): void {
    const find = <T>(kind: abstract new (...args: never[]) => T): T | null => (passes.find((pass) => pass instanceof kind && pass.enabled) as T | undefined) ?? null;
    const composite = find(SceneCompositePass);
    const beauty = find(BeautyPass);
    const atmosphere = find(AtmospherePass);
    const bloom = find(BloomPass);
    if (beauty === null || (composite === null && atmosphere === null && bloom === null)) return;
    this.stats.changedFrames += 1;
    if (!this.auditing || (this.frame++ % AUDIT_EVERY) !== 0) return;
    // While the loading gate holds the frame's draws, every draw here would be swallowed too.
    if (drawsHeld(renderer)) {
      this.stats.auditSkipped += 1;
      return;
    }

    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const found: { check: PostAuditCheck; differing: number; texels: number }[] = [];
    let held = false;
    // Runs `work` and notes whether every program it draws with was ready before and is unchanged after.
    const guarded = (materials: readonly THREE.Material[], work: () => void) => {
      const program = (material: THREE.Material) => (renderer.properties.get(material) as { currentProgram?: Program }).currentProgram;
      const before = materials.map(program);
      const ready = before.every((entry) => entry !== undefined && entry.isReady?.() !== false);
      // three counts every render it really runs; a render a hold swallowed never reaches it.
      const renders = renderer.info.render.frame;
      work();
      if (!ready || renderer.info.render.frame === renders || materials.some((material, index) => program(material) !== before[index])) held = true;
    };
    const draw = (quad: Quad, material: THREE.Material, target: THREE.WebGLRenderTarget, clear = false) =>
      guarded([material], () => {
        quad.material = material;
        renderer.setRenderTarget(target);
        renderer.autoClear = clear;
        quad.render(renderer);
        renderer.autoClear = autoClear;
      });
    const copy = (source: THREE.Texture, target: THREE.WebGLRenderTarget) => {
      this.copyMaterial.uniforms["tSource"]!.value = source;
      draw(this.plane, this.copyMaterial, target);
    };
    const compare = (check: PostAuditCheck, a: THREE.WebGLRenderTarget, b: THREE.WebGLRenderTarget) => {
      const differing = this.comparer.count(renderer, a.texture, b.texture, a.width, a.height);
      if (differing < 0) throw new Error(`the ${check} comparison did not run`);
      found.push({ check, differing, texels: a.width * a.height });
    };
    try {
      const { width, height } = beauty.target;
      for (const target of this.half) if (target.width !== width || target.height !== height) target.setSize(width, height);
      const [a, b, scratch] = this.half as [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
      if (composite !== null) {
        // The three draws it replaced: the beauty copy, GTAO's multiply blend, the contact shadow's multiply.
        draw(this.plane, beauty.material, a);
        const ao = composite.drawn.ao;
        if (ao !== null) {
          const gtao = find(GTAOPass);
          if (gtao === null) throw new Error("the composite multiplied AO without a GTAO pass");
          gtao.blendMaterial.uniforms["intensity"]!.value = ao.intensity;
          gtao.blendMaterial.uniforms["tDiffuse"]!.value = ao.texture;
          draw(this.triangle, gtao.blendMaterial, a);
        }
        if (composite.drawn.shadow !== null) {
          const contact = find(ContactShadowPass);
          if (contact === null) throw new Error("the composite multiplied contact shadows without their pass");
          draw(this.plane, contact.applyMaterial, a);
        }
        guarded([composite.material], () => composite.redraw(renderer, b));
        compare("composite", a, b);
      }

      if (atmosphere !== null) {
        // The draws it replaced: the march into a half-float target of its own, then that blended over the frame.
        copy(beauty.target.texture, a);
        copy(beauty.target.texture, b);
        const blending = atmosphere.material.blending;
        atmosphere.material.blending = THREE.NoBlending;
        try {
          draw(this.plane, atmosphere.material, scratch, true);
        } finally {
          atmosphere.material.blending = blending;
        }
        this.applyMaterial.uniforms["tAtmosphere"]!.value = scratch.texture;
        draw(this.plane, this.applyMaterial, a);
        draw(this.plane, atmosphere.material, b);
        compare("atmosphere", a, b);
      }

      if (bloom !== null) {
        const reference = (this.bloom ??= new UnrealBloomPass(bloom.resolution.clone(), bloom.strength, bloom.radius, bloom.threshold));
        reference.strength = bloom.strength;
        reference.radius = bloom.radius;
        reference.threshold = bloom.threshold;
        if (!reference.resolution.equals(bloom.resolution)) {
          reference.resolution.copy(bloom.resolution);
          reference.setSize(bloom.resolution.x, bloom.resolution.y);
        }
        copy(beauty.target.texture, a);
        copy(beauty.target.texture, b);
        const materials = (pass: UnrealBloomPass) => [pass.materialHighPassFilter, ...pass.separableBlurMaterials, pass.compositeMaterial, pass.materialCopy];
        guarded(materials(reference), () => reference.render(renderer, scratch, a, 0, false));
        guarded(materials(bloom), () => bloom.render(renderer, scratch, b, 0, false));
        compare("bloom", a, b);
      }

      if (held) {
        this.stats.auditSkipped += 1;
        return;
      }
      this.stats.auditFrames += 1;
      for (const { check, differing, texels } of found) {
        this.stats[`${check}Frames`] += 1;
        this.stats[`${check}Texels`] += texels;
        this.stats[`${check}Differing`] += differing;
      }
    } catch {
      this.stats.auditFailed += 1;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.comparer.dispose();
    this.copyMaterial.dispose();
    this.applyMaterial.dispose();
    this.triangle.dispose();
    this.bloom?.dispose();
    for (const target of this.half) target.dispose();
  }
}
