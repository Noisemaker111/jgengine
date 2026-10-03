import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { measureProjectedOverdraw, summarizeProjectedOverdraw } from "./projectedOverdraw";

function harness(failure?: "render" | "readback" | "unsupported-readback") {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#123456");
  scene.fog = new THREE.Fog("#222222", 2, 9);
  const camera = new THREE.PerspectiveCamera();
  const source = new THREE.MeshPhysicalMaterial({ alphaTest: 0.4, transmission: 0.6, transparent: true, opacity: 0.3 });
  const map = new THREE.Texture(); source.map = map;
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, [source, source]); scene.add(mesh);
  let sourceDisposals = 0, borrowedDisposals = 0, materialDisposals = 0, targetDisposals = 0, reads = 0;
  source.addEventListener("dispose", () => sourceDisposals++);
  map.addEventListener("dispose", () => borrowedDisposals++);
  geometry.addEventListener("dispose", () => borrowedDisposals++);
  const previousTarget = new THREE.WebGLRenderTarget(5, 7);
  let currentTarget: THREE.WebGLRenderTarget | null = previousTarget;
  const viewport = new THREE.Vector4(2, 3, 21, 31), scissor = new THREE.Vector4(1, 4, 19, 29), color = new THREE.Color("#aabbcc");
  let scissorTest = true, alpha = 0.7, face = 3, mip = 2;
  const state = {
    autoClear: true, autoClearColor: false, autoClearDepth: false, autoClearStencil: true,
    xr: { enabled: true }, shadowMap: { enabled: true },
    info: { autoReset: true, render: { frame: 8, calls: 4, triangles: 32, points: 7, lines: 3 }, programs: [] },
    extensions: { has: () => true }, debug: { checkShaderErrors: false, onShaderError: null },
    getRenderTarget: () => currentTarget, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    getContext: () => ({ SCISSOR_BOX: 1, SCISSOR_TEST: 2, getParameter: (key: number) => key === 1 ? scissor.toArray() : scissorTest }),
    getCurrentViewport: (target: THREE.Vector4) => target.copy(viewport),
    getViewport: (target: THREE.Vector4) => target.copy(viewport), getScissor: (target: THREE.Vector4) => target.copy(scissor), getScissorTest: () => scissorTest,
    getClearColor: (target: THREE.Color) => target.copy(color), getClearAlpha: () => alpha,
    setRenderTarget(target: THREE.WebGLRenderTarget | null, nextFace = 0, nextMip = 0) {
      currentTarget = target; face = nextFace; mip = nextMip;
      if (target !== null && target !== previousTarget) target.addEventListener("dispose", () => targetDisposals++);
    },
    setViewport(value: THREE.Vector4 | number, y?: number, width?: number, height?: number) { if (typeof value === "number") viewport.set(value, y!, width!, height!); else viewport.copy(value); },
    setScissor: (value: THREE.Vector4) => scissor.copy(value), setScissorTest(value: boolean) { scissorTest = value; },
    setClearColor(value: THREE.ColorRepresentation, nextAlpha: number) { color.set(value); alpha = nextAlpha; }, clear() {},
    render(rendered: THREE.Scene) {
      expect(rendered.background).toBeNull(); expect(rendered.fog).toBeNull();
      const temporary = (mesh.material as THREE.MeshPhysicalMaterial[])[0]!;
      expect(temporary).not.toBe(source); expect((mesh.material as THREE.Material[])[1]).toBe(temporary);
      temporary.addEventListener("dispose", () => materialDisposals++);
      expect(temporary.depthTest).toBe(false); expect(temporary.depthWrite).toBe(false);
      expect(temporary.transmission).toBe(0); expect(temporary.alphaTest).toBe(0.4);
      expect(temporary.map).toBe(map); expect(temporary.blendDst).toBe(THREE.OneFactor);
      const shader = { uniforms: {}, fragmentShader: "#include <alphatest_fragment>\n#include <dithering_fragment>\n}" };
      temporary.onBeforeCompile(shader as never, state as never);
      expect(shader.fragmentShader).toContain("gl_FragColor = vec4(1.0)");
      expect(shader.fragmentShader).toContain("#include <alphatest_fragment>");
      Object.assign(state.info.render, { frame: 9, calls: 2, triangles: 12, points: 0, lines: 0 });
      if (failure === "render") throw new Error("render failed");
    },
    readRenderTargetPixels(_target: THREE.WebGLRenderTarget, _x: number, _y: number, width: number, height: number, buffer: Float32Array) {
      reads++;
      if (reads === 1) { if (failure === "unsupported-readback") return; buffer.set([0, 0, 0, 0.25]); return; }
      if (failure === "readback") throw new Error("read failed");
      expect(width * height).toBe(4); buffer.set([0,0,0,0, 1,1,1,1, 2,2,2,2, 3,3,3,3]);
    },
  };
  const renderer = state as unknown as THREE.WebGLRenderer;
  const originalMaterials = mesh.material;
  const originalBackground = scene.background, originalFog = scene.fog;
  function restored() {
    expect(mesh.material).toBe(originalMaterials); expect(scene.background).toBe(originalBackground); expect(scene.fog).toBe(originalFog);
    expect(currentTarget).toBe(previousTarget); expect([face, mip]).toEqual([3,2]);
    expect(viewport.toArray()).toEqual([2,3,21,31]); expect(scissor.toArray()).toEqual([1,4,19,29]); expect(scissorTest).toBe(true);
    expect(color.getHexString()).toBe("aabbcc"); expect(alpha).toBe(0.7);
    expect([state.xr.enabled, state.shadowMap.enabled, state.autoClear, state.info.autoReset]).toEqual([true,true,true,true]);
    expect(state.debug).toEqual({ checkShaderErrors: false, onShaderError: null });
    expect(state.info.render).toEqual({ frame:8,calls:4,triangles:32,points:7,lines:3 });
    expect(sourceDisposals).toBe(0); expect(borrowedDisposals).toBe(0); expect(targetDisposals).toBe(1);
  }
  return { scene, camera, mesh, source, state, renderer, restored, disposals: () => materialDisposals };
}

describe("projected overdraw diagnostic", () => {
  test("counts additive float samples, keeps native coverage and restores borrowed material identity", () => {
    const h = harness();
    const userdata = h.source.userData;
    h.source.onBeforeCompile = shader => { shader.uniforms.original = { value: 7 }; h.source.userData.temporaryHook = true; };
    const report = measureProjectedOverdraw(h.renderer, h.scene, h.camera, { width: 2, height: 2 });
    expect(report).toMatchObject({ width:2,height:2,sampledPixels:4,coveredPixels:3,fragmentSamples:6,mean:1.5,meanCovered:2,max:3,meshes:1,materialSlots:2,opaqueSlots:0,maskedSlots:2,blendedSlots:2,transmissionSlots:2 });
    expect(report.caveats.join(" ")).toContain("not early-Z");
    expect(h.source.userData).toBe(userdata); expect(h.source.userData.temporaryHook).toBeUndefined();
    h.restored(); expect(h.disposals()).toBe(1);
  });
  test.each(["render", "readback"] as const)("restores all state and disposes owned resources after %s throws", failure => {
    const h = harness(failure);
    expect(() => measureProjectedOverdraw(h.renderer,h.scene,h.camera,{width:2,height:2})).toThrow(failure === "render" ? "render failed" : "read failed");
    h.restored(); expect(h.disposals()).toBe(1);
  });
  test("a silently unsupported float readback fails explicitly and restores state", () => {
    const h = harness("unsupported-readback");
    expect(() => measureProjectedOverdraw(h.renderer,h.scene,h.camera,{width:2,height:2})).toThrow("readback is unsupported");
    h.restored(); expect(h.disposals()).toBe(0);
  });
  test("unsupported extensions, callbacks and materials fail before scene/renderer mutation", () => {
    const h = harness(); const before = h.mesh.material;
    h.state.extensions.has = () => false;
    expect(() => measureProjectedOverdraw(h.renderer,h.scene,h.camera)).toThrow("EXT_float_blend");
    h.state.extensions.has = () => true;
    h.mesh.onBeforeRender = () => {};
    expect(() => measureProjectedOverdraw(h.renderer,h.scene,h.camera)).toThrow("render callbacks");
    h.mesh.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    h.mesh.material = new THREE.ShaderMaterial();
    expect(() => measureProjectedOverdraw(h.renderer,h.scene,h.camera)).toThrow("unsupported");
    h.mesh.material = before;
    expect(h.renderer.getViewport(new THREE.Vector4()).toArray()).toEqual([2,3,21,31]);
  });
  test("statistics reject incomplete/invalid samples and define empty coverage", () => {
    expect(summarizeProjectedOverdraw(new Float32Array(4),1,1)).toEqual({sampledPixels:1,coveredPixels:0,fragmentSamples:0,mean:0,meanCovered:0,max:0});
    expect(() => summarizeProjectedOverdraw(new Float32Array(3),1,1)).toThrow("dimensions");
    expect(() => summarizeProjectedOverdraw(new Float32Array([NaN,0,0,0]),1,1)).toThrow("invalid samples");
  });
});
