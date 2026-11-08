import * as THREE from "three";
import { FullScreenQuad, Pass, RenderPass } from "three-stdlib";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Resolve: reproject last frame's history through the depth buffer and the camera's motion, clip it
 * to the current pixel's neighbourhood colour box (so a moved object cannot leave a trail), and blend.
 * Blending in a luma-weighted space keeps one bright sparkle from flickering the average.
 */
const resolveShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tHistory;
  uniform sampler2D tDepth;
  uniform mat4 uInverseViewProjection;
  uniform mat4 uPreviousViewProjection;
  uniform vec2 uTexel;
  uniform float uFeedback;
  uniform float uHistoryValid;
  varying vec2 vUv;

  vec3 toYCoCg(vec3 c) {
    return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
  }
  vec3 fromYCoCg(vec3 c) {
    return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
  }
  vec3 tonemap(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
  vec3 untonemap(vec3 c) { return c / max(1.0 / 65504.0, 1.0 - max(c.r, max(c.g, c.b))); }

  vec3 sampleHistory(vec2 uv) {
    // Five-tap Catmull-Rom: a plain bilinear fetch softens the image a little more every frame.
    vec2 position = uv / uTexel;
    vec2 center = floor(position - 0.5) + 0.5;
    vec2 f = position - center;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    vec2 tc0 = (center - 1.0) * uTexel;
    vec2 tc3 = (center + 2.0) * uTexel;
    vec2 tc12 = (center + w2 / w12) * uTexel;
    vec3 result = texture2D(tHistory, vec2(tc12.x, tc0.y)).rgb * (w12.x * w0.y)
      + texture2D(tHistory, vec2(tc0.x, tc12.y)).rgb * (w0.x * w12.y)
      + texture2D(tHistory, vec2(tc12.x, tc12.y)).rgb * (w12.x * w12.y)
      + texture2D(tHistory, vec2(tc3.x, tc12.y)).rgb * (w3.x * w12.y)
      + texture2D(tHistory, vec2(tc12.x, tc3.y)).rgb * (w12.x * w3.y);
    float weight = (w12.x * w0.y) + (w0.x * w12.y) + (w12.x * w12.y) + (w3.x * w12.y) + (w12.x * w3.y);
    return max(result / max(weight, 1e-4), 0.0);
  }

  void main() {
    vec4 currentSample = texture2D(tDiffuse, vUv);
    vec3 current = tonemap(currentSample.rgb);
    vec3 mean = vec3(0.0);
    vec3 squares = vec3(0.0);
    float closestDepth = 1.0;
    vec2 closestUv = vUv;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
        vec3 neighbour = toYCoCg(tonemap(texture2D(tDiffuse, uv).rgb));
        mean += neighbour;
        squares += neighbour * neighbour;
        float depth = texture2D(tDepth, uv).x;
        if (depth < closestDepth) {
          closestDepth = depth;
          closestUv = uv;
        }
      }
    }
    mean /= 9.0;
    vec3 deviation = sqrt(max(squares / 9.0 - mean * mean, 0.0));
    vec3 boxMin = mean - deviation * 1.25;
    vec3 boxMax = mean + deviation * 1.25;

    // The nearest depth in the neighbourhood reprojects an edge with the object in front of it.
    vec4 world = uInverseViewProjection * vec4(closestUv * 2.0 - 1.0, closestDepth * 2.0 - 1.0, 1.0);
    world /= world.w;
    vec4 previous = uPreviousViewProjection * vec4(world.xyz, 1.0);
    vec2 previousUv = previous.xy / previous.w * 0.5 + 0.5 + (vUv - closestUv);
    bool offscreen = previousUv.x < 0.0 || previousUv.x > 1.0 || previousUv.y < 0.0 || previousUv.y > 1.0;
    if (uHistoryValid < 0.5 || offscreen || previous.w <= 0.0) {
      gl_FragColor = currentSample;
      return;
    }
    vec3 history = toYCoCg(tonemap(sampleHistory(previousUv)));
    // Clip toward the box centre rather than clamping per channel, which shifts hue.
    vec3 centre = (boxMin + boxMax) * 0.5;
    vec3 extent = max((boxMax - boxMin) * 0.5, vec3(1e-4));
    vec3 offset = history - centre;
    vec3 unit = abs(offset / extent);
    float outside = max(unit.x, max(unit.y, unit.z));
    if (outside > 1.0) history = centre + offset / outside;
    history = fromYCoCg(history);

    float motion = length((vUv - previousUv) / uTexel);
    float feedback = mix(uFeedback, 0.75, clamp(motion / 12.0, 0.0, 1.0));
    vec3 resolved = untonemap(mix(current, history, feedback));
    // A NaN in the history would otherwise live on in every later frame.
    if (!(resolved.r == resolved.r && resolved.g == resolved.g && resolved.b == resolved.b)) resolved = currentSample.rgb;
    gl_FragColor = vec4(resolved, currentSample.a);
  }
`;

/** Light sharpening on the way out, giving back the detail the history blend softens. */
const sharpenShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  uniform float uSharpness;
  varying vec2 vUv;
  void main() {
    vec4 centre = texture2D(tDiffuse, vUv);
    vec3 north = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
    vec3 south = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
    vec3 east = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
    vec3 west = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 lo = min(centre.rgb, min(min(north, south), min(east, west)));
    vec3 hi = max(centre.rgb, max(max(north, south), max(east, west)));
    vec3 sharpened = centre.rgb + (centre.rgb * 4.0 - north - south - east - west) * uSharpness;
    gl_FragColor = vec4(clamp(sharpened, lo, hi), centre.a);
  }
`;

/** Halton(2,3) offsets in pixels, centred on zero. Eight samples settle an edge in about eight frames. */
const JITTER: readonly (readonly [number, number])[] = Array.from({ length: 8 }, (_, index) => [halton(index + 1, 2) - 0.5, halton(index + 1, 3) - 0.5]);

/** Radical inverse of `index` in `base`. @internal */
export function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let value = index;
  while (value > 0) {
    result += (value % base) * fraction;
    value = Math.floor(value / base);
    fraction /= base;
  }
  return result;
}

/** The sub-pixel offset for frame `frame`, in pixels. @internal */
export function taaJitter(frame: number): readonly [number, number] {
  return JITTER[((frame % JITTER.length) + JITTER.length) % JITTER.length]!;
}

/** A camera step this large between frames is a cut, not motion: the history is dropped. @internal */
export const TAA_CUT_DISTANCE = 12;
const TAA_CUT_ANGLE = 0.6;

const jitterMatrix = new THREE.Matrix4();
const cameraForward = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

/**
 * Temporal antialiasing. The paired {@link JitteredRenderPass} renders the scene through a camera
 * shifted a fraction of a pixel per frame; this pass blends each frame into a reprojected history,
 * so edges, foliage cards and specular glints resolve to a stable average instead of crawling. It
 * needs the beauty pass's depth to reproject and costs two full-screen passes and no scene draw.
 * @internal
 */
export class TemporalAaPass extends Pass {
  readonly resolveMaterial: THREE.ShaderMaterial;
  readonly sharpenMaterial: THREE.ShaderMaterial;
  private readonly resolveQuad: FullScreenQuad;
  private readonly sharpenQuad: FullScreenQuad;
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private current = 0;
  private historyValid = false;
  private frame = 0;
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly previousPosition = new THREE.Vector3();
  private readonly previousForward = new THREE.Vector3();
  /** The offset the beauty pass used for the frame being resolved, in pixels. */
  readonly jitter = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    depth: THREE.DepthTexture,
    width: number,
    height: number,
    sharpness = 0.3,
  ) {
    super();
    this.history = [createHistoryTarget(width, height), createHistoryTarget(width, height)];
    this.resolveMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: null },
        tDepth: { value: depth },
        uInverseViewProjection: { value: new THREE.Matrix4() },
        uPreviousViewProjection: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        uFeedback: { value: 0.9 },
        uHistoryValid: { value: 0 },
      },
      vertexShader,
      fragmentShader: resolveShader,
      depthTest: false,
      depthWrite: false,
    });
    this.sharpenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        uSharpness: { value: sharpness },
      },
      vertexShader,
      fragmentShader: sharpenShader,
      depthTest: false,
      depthWrite: false,
    });
    this.resolveQuad = new FullScreenQuad(this.resolveMaterial);
    this.sharpenQuad = new FullScreenQuad(this.sharpenMaterial);
  }

  /** Advance to the next jitter offset; the beauty pass calls this before it draws. */
  nextJitter(): THREE.Vector2 {
    this.frame += 1;
    const [x, y] = taaJitter(this.frame);
    return this.jitter.set(x, y);
  }

  /** Forget the history, e.g. after a camera cut or a resize. */
  reset(): void {
    this.historyValid = false;
  }

  override setSize(width: number, height: number): void {
    for (const target of this.history) target.setSize(width, height);
    (this.resolveMaterial.uniforms["uTexel"]!.value as THREE.Vector2).set(1 / width, 1 / height);
    (this.sharpenMaterial.uniforms["uTexel"]!.value as THREE.Vector2).set(1 / width, 1 / height);
    this.reset();
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const camera = this.camera;
    camera.getWorldDirection(cameraForward);
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    if (
      this.historyValid &&
      (cameraPosition.distanceTo(this.previousPosition) > TAA_CUT_DISTANCE || cameraForward.angleTo(this.previousForward) > TAA_CUT_ANGLE)
    ) {
      this.historyValid = false;
    }

    const read = this.history[this.current]!;
    const write = this.history[1 - this.current]!;
    const uniforms = this.resolveMaterial.uniforms;
    uniforms["tDiffuse"]!.value = readBuffer.texture;
    uniforms["tHistory"]!.value = read.texture;
    (uniforms["uInverseViewProjection"]!.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    (uniforms["uPreviousViewProjection"]!.value as THREE.Matrix4).copy(this.previousViewProjection);
    uniforms["uHistoryValid"]!.value = this.historyValid ? 1 : 0;
    renderer.setRenderTarget(write);
    this.resolveQuad.render(renderer);

    this.sharpenMaterial.uniforms["tDiffuse"]!.value = write.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.sharpenQuad.render(renderer);

    this.previousViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.previousPosition.copy(cameraPosition);
    this.previousForward.copy(cameraForward);
    this.current = 1 - this.current;
    this.historyValid = true;
  }

  override dispose(): void {
    for (const target of this.history) target.dispose();
    this.resolveMaterial.dispose();
    this.sharpenMaterial.dispose();
    this.resolveQuad.dispose();
    this.sharpenQuad.dispose();
  }
}

function createHistoryTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
}

/**
 * The beauty pass under temporal AA: renders through a projection shifted by the TAA pass's
 * sub-pixel jitter and puts the camera back afterwards, so picking, culling and every later pass
 * see the unshifted camera.
 * @internal
 */
export class JitteredRenderPass extends RenderPass {
  private readonly saved = new THREE.Matrix4();
  private readonly savedInverse = new THREE.Matrix4();

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly taa: TemporalAaPass,
  ) {
    super(scene, camera);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // With temporal AA off (its programs still linking), nothing would resolve the jitter.
    if (!this.taa.enabled) {
      super.render(renderer, writeBuffer, readBuffer);
      return;
    }
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const jitter = this.taa.nextJitter();
    const width = readBuffer.width;
    const height = readBuffer.height;
    this.saved.copy(camera.projectionMatrix);
    this.savedInverse.copy(camera.projectionMatrixInverse);
    jitterMatrix.makeTranslation((jitter.x * 2) / width, (jitter.y * 2) / height, 0);
    camera.projectionMatrix.premultiply(jitterMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    try {
      super.render(renderer, writeBuffer, readBuffer);
    } finally {
      camera.projectionMatrix.copy(this.saved);
      camera.projectionMatrixInverse.copy(this.savedInverse);
    }
  }
}
