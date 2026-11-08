import * as THREE from "three";
import { FullScreenQuad } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { TextureComparer } from "../render/textureComparer.draw";
import type { GradePass } from "./gradeShader.draw";
import type { TemporalAaPass } from "./temporalAaPass.draw";

/** Frames between audited frames, so the audit's extra draws and readback barely move the frame rate. */
const AUDIT_EVERY = 20;

/** What the merged draws did and, with the audit on, what comparing them with the separate draws found. */
export interface PostAuditStats {
  /** Frames the grade also did the OutputPass's work, and also temporal AA's sharpen. */
  tailFrames: number;
  sharpenFrames: number;
  /** Audited frames, the screen texels compared over them, and those that differ at all or by more than one level. */
  auditFrames: number;
  auditTexels: number;
  auditDifferingTexels: number;
  auditTexelsOverOneLevel: number;
  auditFailed: number;
}

/**
 * Checks the grade's merged draws on live frames (`?postAudit=1`, read by `bun run perf post-audit`).
 * Every {@link AUDIT_EVERY}th frame the grade merged, it draws the frame's ending both ways from the
 * same inputs into two 8-bit targets of the screen's size: temporal AA's sharpen, the OutputPass and
 * the grade as separate draws, and the grade's merged variant. A GPU comparison counts the texels that
 * differ. Nothing it draws reaches the screen.
 * @internal
 */
export class PostAudit {
  readonly stats: PostAuditStats = { tailFrames: 0, sharpenFrames: 0, auditFrames: 0, auditTexels: 0, auditDifferingTexels: 0, auditTexelsOverOneLevel: 0, auditFailed: 0 };
  private readonly comparer = new TextureComparer();
  private readonly output = new OutputPass();
  private readonly sharpened = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly toned = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly separate = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly merged = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private sharpenQuad: FullScreenQuad | null = null;
  private frame = 0;

  constructor(private readonly auditing: boolean) {}

  /** Count what the frame just drawn merged, and on an audit frame compare it with the separate draws. */
  afterFrame(renderer: THREE.WebGLRenderer, grade: GradePass | null, taa: TemporalAaPass | null, width: number, height: number): void {
    if (grade === null || !grade.fuseOutput) return;
    this.stats.tailFrames += 1;
    if (grade.fuseSharpen) this.stats.sharpenFrames += 1;
    if (!this.auditing || (this.frame++ % AUDIT_EVERY) !== 0) return;
    const fuseSharpen = grade.fuseSharpen;
    const renderToScreen = grade.renderToScreen;
    const hdr = grade.uniforms["tDiffuse"]?.value as THREE.Texture | null;
    const history = grade.uniforms["tHistory"]?.value as THREE.Texture | null;
    const previous = renderer.getRenderTarget();
    try {
      for (const target of [this.sharpened, this.toned, this.separate, this.merged]) {
        if (target.width !== width || target.height !== height) target.setSize(width, height);
      }
      let source: THREE.Texture | null = hdr;
      if (fuseSharpen) {
        if (taa === null || history === null) throw new Error("no temporal AA history to sharpen");
        // Temporal AA's own sharpen draw, on the history it handed the grade.
        this.sharpenQuad ??= new FullScreenQuad(taa.sharpenMaterial);
        taa.sharpenMaterial.uniforms["tDiffuse"]!.value = history;
        renderer.setRenderTarget(this.sharpened);
        this.sharpenQuad.render(renderer);
        source = this.sharpened.texture;
      }
      if (source === null || hdr === null) throw new Error("the grade had no frame to read");
      this.output.render(renderer, this.toned, { texture: source } as THREE.WebGLRenderTarget);
      grade.renderToScreen = false;
      grade.fuseOutput = false;
      grade.fuseSharpen = false;
      grade.render(renderer, this.separate, this.toned);
      grade.fuseOutput = true;
      grade.fuseSharpen = fuseSharpen;
      grade.render(renderer, this.merged, { texture: hdr } as THREE.WebGLRenderTarget);
      const differing = this.comparer.count(renderer, this.separate.texture, this.merged.texture, width, height);
      const overOne = this.comparer.count(renderer, this.separate.texture, this.merged.texture, width, height, 1.5 / 255);
      if (differing < 0 || overOne < 0) throw new Error("the comparison did not run");
      this.stats.auditFrames += 1;
      this.stats.auditTexels += width * height;
      this.stats.auditDifferingTexels += differing;
      this.stats.auditTexelsOverOneLevel += overOne;
    } catch {
      this.stats.auditFailed += 1;
    } finally {
      grade.fuseOutput = true;
      grade.fuseSharpen = fuseSharpen;
      grade.renderToScreen = renderToScreen;
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.comparer.dispose();
    this.output.dispose();
    this.sharpenQuad?.dispose();
    for (const target of [this.sharpened, this.toned, this.separate, this.merged]) target.dispose();
  }
}
