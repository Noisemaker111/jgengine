import * as THREE from "three";
import { FullScreenQuad, Pass } from "three-stdlib";

/**
 * Grid the beauty buffer is averaged down to before readback, per axis. 16×16 cells × 4×4 taps
 * covers 4096 samples of the frame — enough for a stable key luminance, small enough to read back
 * (1 KB of encoded log-luminance) without a measurable stall.
 */
const METER_SIZE = 16;
const TAPS_PER_AXIS = 4;
/** Encoded range of the log-luminance bytes: 2^-16 .. 2^8. */
const LOG_MIN = -16;
const LOG_MAX = 8;
const LOG_RANGE = LOG_MAX - LOG_MIN;

const reduceShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec2 cell = vec2(${METER_SIZE.toFixed(1)});
      vec2 texel = 1.0 / cell;
      vec2 origin = floor(vUv * cell) * texel;
      float logSum = 0.0;
      for (int y = 0; y < ${TAPS_PER_AXIS}; y++) {
        for (int x = 0; x < ${TAPS_PER_AXIS}; x++) {
          vec2 jitter = (vec2(float(x), float(y)) + 0.5) / ${TAPS_PER_AXIS.toFixed(1)};
          vec3 color = texture2D(tDiffuse, origin + jitter * texel).rgb;
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          // Log-encoded so one bright window cannot outweigh the room around it.
          logSum += clamp(log2(max(luma, 1e-6)), ${LOG_MIN.toFixed(1)}, ${LOG_MAX.toFixed(1)});
        }
      }
      float encoded = (logSum / ${(TAPS_PER_AXIS * TAPS_PER_AXIS).toFixed(1)} - ${LOG_MIN.toFixed(1)}) / ${LOG_RANGE.toFixed(1)};
      gl_FragColor = vec4(encoded, encoded, encoded, 1.0);
    }
  `,
};

const copyShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: reduceShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
  `,
};

/** Linear luminance encoded in one byte by {@link ExposureMeterPass}. @internal */
export function decodeMeterByte(value: number, target: Float32Array, targetIndex: number): void {
  target[targetIndex] = Math.pow(2, (value / 255) * LOG_RANGE + LOG_MIN);
}

/**
 * Meters the pre-tone-map beauty buffer for auto-exposure. Every `sampleInterval` frames it reduces
 * the frame to a 16×16 grid of log-luminance (GPU) and reads that back (1 KB), then hands the decoded
 * samples to `onSample` with the wall time since the previous sample. The pass itself is a pass-through,
 * so it can sit anywhere before the tone-mapping output pass without changing the picture.
 * @internal
 */
export class ExposureMeterPass extends Pass {
  readonly meterTarget: THREE.WebGLRenderTarget;
  readonly reduceUniforms = reduceShader.uniforms;
  private readonly copyUniforms = copyShader.uniforms;
  private readonly reduceQuad: FullScreenQuad;
  private readonly copyQuad: FullScreenQuad;
  private readonly pixels = new Uint8Array(METER_SIZE * METER_SIZE * 4);
  private readonly samples = new Float32Array(METER_SIZE * METER_SIZE);
  private frames = 0;
  private taken = 0;
  private elapsed = 0;
  private pendingSeconds = 0;
  private gl: WebGL2RenderingContext | null = null;
  private pbo: WebGLBuffer | null = null;
  private fence: WebGLSync | null = null;

  constructor(
    private readonly onSample: (samples: Float32Array, seconds: number) => void,
    /** Frames between readbacks once warmed up. Reading the GPU back stalls the pipeline, so this is
     * as rare as exposure adaptation tolerates. */
    private readonly sampleInterval = 32,
  ) {
    super();
    this.meterTarget = new THREE.WebGLRenderTarget(METER_SIZE, METER_SIZE, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.meterTarget.texture.minFilter = THREE.NearestFilter;
    this.meterTarget.texture.magFilter = THREE.NearestFilter;
    this.meterTarget.texture.generateMipmaps = false;
    this.reduceQuad = new FullScreenQuad(new THREE.ShaderMaterial(reduceShader));
    this.copyQuad = new FullScreenQuad(new THREE.ShaderMaterial(copyShader));
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
  ): void {
    const previous = renderer.getRenderTarget();
    this.reduceUniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.meterTarget);
    this.reduceQuad.render(renderer);

    this.frames += 1;
    this.elapsed += deltaTime;
    this.collectPendingSample();
    // The first few frames sample every frame so a load starts at its metered exposure, not at the
    // authored one; after that a readback is queued on a schedule.
    if (this.fence === null && (this.taken < 4 || this.frames % this.sampleInterval === 0)) {
      this.queueReadback(renderer);
    }

    this.copyUniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.copyQuad.render(renderer);
    renderer.setRenderTarget(previous);
  }

  /**
   * Queues a readback through a pixel-pack buffer and a fence, so the CPU never waits on the GPU: the
   * samples arrive a frame or two later through {@link collectPendingSample}. A renderer without WebGL2
   * buffers falls back to the synchronous read, which costs one stall per sample.
   */
  private queueReadback(renderer: THREE.WebGLRenderer): void {
    this.pendingSeconds = this.elapsed;
    this.elapsed = 0;
    this.gl ??= (renderer.getContext?.() as WebGL2RenderingContext | undefined) ?? null;
    const gl = this.gl;
    if (gl === null || typeof gl.fenceSync !== "function") {
      renderer.readRenderTargetPixels(this.meterTarget, 0, 0, METER_SIZE, METER_SIZE, this.pixels);
      this.emit();
      return;
    }
    this.pbo ??= gl.createBuffer();
    renderer.setRenderTarget(this.meterTarget);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, METER_SIZE, METER_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  private collectPendingSample(): void {
    const gl = this.gl;
    if (gl === null || this.fence === null || this.pbo === null) return;
    const status = gl.clientWaitSync(this.fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return;
    if (status === gl.WAIT_FAILED) {
      gl.deleteSync(this.fence);
      this.fence = null;
      return;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteSync(this.fence);
    this.fence = null;
    this.emit();
  }

  private emit(): void {
    for (let index = 0; index < this.samples.length; index += 1) {
      decodeMeterByte(this.pixels[index * 4] ?? 0, this.samples, index);
    }
    this.taken += 1;
    this.onSample(this.samples, this.pendingSeconds);
  }

  override dispose(): void {
    if (this.gl !== null) {
      if (this.fence !== null) this.gl.deleteSync(this.fence);
      if (this.pbo !== null) this.gl.deleteBuffer(this.pbo);
      this.fence = null;
      this.pbo = null;
    }
    this.meterTarget.dispose();
    this.reduceQuad.material.dispose();
    this.reduceQuad.dispose();
    this.copyQuad.material.dispose();
    this.copyQuad.dispose();  }
}
