import * as THREE from "three";

/** Sampling resolution; lower resolutions change thin geometry and alpha-mask raster coverage. */
export interface ProjectedOverdrawOptions { width?: number; height?: number }

/** Projected mesh-fragment overlap, with depth rejection disabled; this is not production early-Z overdraw or GPU timing. */
export interface ProjectedOverdrawReport {
  width: number;
  height: number;
  sampledPixels: number;
  coveredPixels: number;
  fragmentSamples: number;
  mean: number;
  meanCovered: number;
  max: number;
  meshes: number;
  materialSlots: number;
  /** Native opaque render-queue slots, including masked slots. */
  opaqueSlots: number;
  /** Slots with alphaTest/alphaHash; this can overlap queue counts. */
  maskedSlots: number;
  blendedSlots: number;
  transmissionSlots: number;
  caveats: readonly string[];
}

function supported(material: THREE.Material): boolean {
  const flags = material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return flags.isMeshStandardMaterial === true || flags.isMeshBasicMaterial === true;
}

/** Convert finite nonnegative RGBA32F sample counts to overlap statistics. @internal */
export function summarizeProjectedOverdraw(pixels: Float32Array, width: number, height: number): Pick<ProjectedOverdrawReport, "sampledPixels" | "coveredPixels" | "fragmentSamples" | "mean" | "meanCovered" | "max"> {
  if (pixels.length !== width * height * 4) throw new Error("Projected-overdraw readback dimensions do not match the RGBA buffer");
  let coveredPixels = 0, fragmentSamples = 0, max = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const count = pixels[index]!;
    if (!Number.isFinite(count) || count < 0) throw new Error("Projected-overdraw float readback returned invalid samples");
    if (count > 0) coveredPixels++;
    fragmentSamples += count;
    max = Math.max(max, count);
  }
  const sampledPixels = width * height;
  return { sampledPixels, coveredPixels, fragmentSamples, mean: fragmentSamples / sampledPixels, meanCovered: coveredPixels === 0 ? 0 : fragmentSamples / coveredPixels, max };
}

function countMaterial(source: THREE.Material): THREE.Material {
  const material = source.clone();
  const compile = source.onBeforeCompile;
  const key = source.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    const tail = /#include <dithering_fragment>(\s*})\s*$/;
    if (!tail.test(shader.fragmentShader)) throw new Error("Projected overdraw requires the native final fragment chunk; this shader callback changes the fragment main tail");
    shader.fragmentShader = shader.fragmentShader.replace(tail, "#include <dithering_fragment>\ngl_FragColor = vec4(1.0);$1");
  };
  material.customProgramCacheKey = () => `${key}|jg-projected-overdraw:v1`;
  material.transparent = true;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.depthTest = false;
  material.depthWrite = false;
  material.colorWrite = true;
  material.forceSinglePass = true;
  material.toneMapped = false;
  material.premultipliedAlpha = false;
  material.alphaToCoverage = false;
  if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) (material as THREE.MeshPhysicalMaterial).transmission = 0;
  return material;
}

/**
 * Opt in to a synchronous offscreen count of projected mesh fragments. Native PBR/unlit vertex transforms and alpha discard remain; depth rejection, shadow/refraction passes and postprocessing do not participate.
 * Blended texels count equally, including zero opacity when native alphaTest/alphaHash does not discard them. Pure shader-modifying onBeforeCompile callbacks are retained; render callbacks, custom shader materials, stencil and alpha-to-coverage are rejected.
 * The float readback stalls the GPU. Temporary materials/target are disposed and renderer draw counters/state restored; borrowed assets may become resident while measured.
 * @capability projected-overdraw sample actual mesh/camera fragment overlap with native coverage and explicit depth/blending/transmission limits
 */
export function measureProjectedOverdraw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, options: ProjectedOverdrawOptions = {}): ProjectedOverdrawReport {
  const width = options.width ?? 128;
  const height = options.height ?? 128;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048) throw new Error("Projected-overdraw resolution must contain integer dimensions from 1 to 2048");
  if (!renderer.extensions.has("EXT_color_buffer_float") || !renderer.extensions.has("EXT_float_blend")) throw new Error("Projected overdraw requires RGBA32F rendering/readback and EXT_float_blend; this renderer cannot provide a fragment count");
  if ((camera as THREE.ArrayCamera).isArrayCamera) throw new Error("Projected overdraw requires one camera projection; measure array-camera views separately");
  if (scene.overrideMaterial !== null) throw new Error("Projected overdraw does not support an active scene overrideMaterial");
  const meshes: THREE.Mesh[] = [];
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const materials = new Set<THREE.Material>();
  let materialSlots = 0, opaqueSlots = 0, maskedSlots = 0, blendedSlots = 0, transmissionSlots = 0;
  if (scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || scene.onAfterRender !== THREE.Object3D.prototype.onAfterRender) throw new Error("Projected overdraw rejects scene render callbacks");
  scene.traverseVisible(node => {
    if (!node.layers.test(camera.layers)) return;
    const flags = node as THREE.Mesh & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isBatchedMesh?: boolean; isInstancedMesh?: boolean; count?: number };
    if (flags.geometry?.drawRange.count === 0 || (flags.isInstancedMesh && flags.count === 0)) return;
    if (flags.material !== undefined && (Array.isArray(flags.material) ? flags.material : [flags.material]).every(material => !material.visible)) return;
    if (flags.isPoints || flags.isLine || flags.isSprite || flags.isBatchedMesh) throw new Error(`Projected overdraw does not support ${node.type}`);
    if (!flags.isMesh) return;
    if (node.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || node.onAfterRender !== THREE.Object3D.prototype.onAfterRender) throw new Error(`Projected overdraw rejects render callbacks on ${node.name || node.type}`);
    meshes.push(flags);
    originals.set(flags, flags.material);
    for (const material of Array.isArray(flags.material) ? flags.material : [flags.material]) {
      if (!material.visible) continue;
      if (!supported(material)) throw new Error(`Projected overdraw requires native PBR or unlit material; ${material.name || material.type} is unsupported`);
      if (material.onBeforeRender !== THREE.Material.prototype.onBeforeRender) throw new Error(`Projected overdraw rejects material render callbacks on ${material.name || material.type}`);
      if (material.stencilWrite || material.alphaToCoverage) throw new Error(`Projected overdraw cannot reproduce stencil or multisample alpha coverage on ${material.name || material.type}`);
      materials.add(material);
      materialSlots++;
      if (material.alphaTest > 0 || material.alphaHash) maskedSlots++;
      if (material.transparent) blendedSlots++;
      else opaqueSlots++;
      if ((material as THREE.MeshPhysicalMaterial).transmission > 0) transmissionSlots++;
    }
  });
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
  target.texture.colorSpace = THREE.NoColorSpace;
  const replacements = new Map<THREE.Material, THREE.Material>();
  const userData = new Map([...materials].map(material => [material, { object: material.userData, entries: { ...material.userData } }]));
  const context = renderer.getContext();
  const state = {
    target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getCurrentViewport(new THREE.Vector4()),
    scissor: new THREE.Vector4().fromArray(context.getParameter(context.SCISSOR_BOX) as Int32Array), scissorTest: context.getParameter(context.SCISSOR_TEST) as boolean,
    clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(), autoClear: renderer.autoClear,
    autoClearColor: renderer.autoClearColor, autoClearDepth: renderer.autoClearDepth, autoClearStencil: renderer.autoClearStencil,
    xr: renderer.xr.enabled, shadows: renderer.shadowMap.enabled, infoAutoReset: renderer.info.autoReset, render: { ...renderer.info.render },
    background: scene.background, fog: scene.fog, shaderCheck: renderer.debug.checkShaderErrors, shaderError: renderer.debug.onShaderError,
  };
  try {
    const shaderErrors: string[] = [];
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => { shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join("\n")); };
    renderer.xr.enabled = false;
    renderer.shadowMap.enabled = false;
    renderer.info.autoReset = false;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0.25);
    renderer.clear(true, false, false);
    const probe = new Float32Array(4).fill(NaN);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, probe);
    if (!Number.isFinite(probe[3]) || Math.abs(probe[3]! - 0.25) > 0.001) throw new Error("Projected overdraw RGBA32F readback is unsupported or incomplete");
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    for (const source of materials) replacements.set(source, countMaterial(source));
    for (const mesh of meshes) {
      const source = originals.get(mesh)!;
      mesh.material = Array.isArray(source) ? source.map(material => replacements.get(material) ?? material) : replacements.get(source) ?? source;
    }
    scene.background = null;
    scene.fog = null;
    renderer.render(scene, camera);
    if (shaderErrors.length > 0) throw new Error(`Projected-overdraw shader compilation failed: ${shaderErrors.join("\n")}`);
    const pixels = new Float32Array(width * height * 4).fill(NaN);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return { width, height, ...summarizeProjectedOverdraw(pixels, width, height), meshes: meshes.length, materialSlots, opaqueSlots, maskedSlots, blendedSlots, transmissionSlots,
      caveats: ["Depth rejection is disabled: projected overlap is an upper bound on production opaque shading, not early-Z overdraw.", "Native alphaTest/alphaHash discard is retained at this sampled resolution; blended texels count equally, including zero opacity.", "Transmission refraction/background, shadow, postprocessing, sky and MSAA passes are excluded. No GPU timing is measured.", "Native vertex transforms and pure shader-modifying material callbacks remain; borrowed assets may be uploaded during this diagnostic."] };
  } finally {
    for (const [mesh, material] of originals) mesh.material = material;
    for (const [material, saved] of userData) {
      material.userData = saved.object;
      for (const key of Object.keys(saved.object)) if (!(key in saved.entries)) delete saved.object[key];
      Object.assign(saved.object, saved.entries);
    }
    scene.background = state.background;
    scene.fog = state.fog;
    renderer.xr.enabled = state.xr;
    renderer.shadowMap.enabled = state.shadows;
    renderer.autoClear = state.autoClear;
    renderer.autoClearColor = state.autoClearColor;
    renderer.autoClearDepth = state.autoClearDepth;
    renderer.autoClearStencil = state.autoClearStencil;
    renderer.info.autoReset = state.infoAutoReset;
    renderer.debug.checkShaderErrors = state.shaderCheck;
    renderer.debug.onShaderError = state.shaderError;
    for (const material of replacements.values()) material.dispose();
    target.dispose();
    if (state.target === null) renderer.setRenderTarget(null, state.face, state.mip);
    else {
      const viewport = state.target.viewport.clone(), scissor = state.target.scissor.clone(), scissorTest = state.target.scissorTest;
      state.target.viewport.copy(state.viewport); state.target.scissor.copy(state.scissor); state.target.scissorTest = state.scissorTest;
      try { renderer.setRenderTarget(state.target, state.face, state.mip); }
      finally { state.target.viewport.copy(viewport); state.target.scissor.copy(scissor); state.target.scissorTest = scissorTest; }
    }
    renderer.setClearColor(state.clearColor, state.clearAlpha);
    Object.assign(renderer.info.render, state.render);
  }
}
