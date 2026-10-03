import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { POSTFX_OVERLAY_USERDATA } from "./postfxOverlay";
import { renderShadowlessPrepass } from "./shadowPrepass";

function renderer(autoUpdate = true, needsUpdate = false): Pick<THREE.WebGLRenderer, "shadowMap"> {
  return { shadowMap: { autoUpdate, needsUpdate } as THREE.WebGLShadowMap };
}

describe("postfx shadow prepasses", () => {
  test("actual GTAO and DOF scene prepasses reuse beauty shadows", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const writeBuffer = new THREE.WebGLRenderTarget(8, 8);
    const readBuffer = new THREE.WebGLRenderTarget(8, 8);
    const passes = [new GTAOPass(scene, camera, 8, 8), new BokehPass(scene, camera, {})];
    let shadowUpdates = 0;
    let sceneDraws = 0;
    const clearColor = new THREE.Color();
    const gl = {
      ...renderer(),
      autoClear: true,
      getClearColor: (target: THREE.Color) => target.copy(clearColor),
      getClearAlpha: () => 1,
      setClearColor: () => {},
      setClearAlpha: () => {},
      setRenderTarget: () => {},
      clear: () => {},
      render: (object: THREE.Object3D) => {
        if (object !== scene) return;
        sceneDraws++;
        if (gl.shadowMap.autoUpdate || gl.shadowMap.needsUpdate) shadowUpdates++;
      },
    };
    gl.render(scene);
    for (const pass of passes) {
      renderShadowlessPrepass(gl, scene, [], () => pass.render(gl as unknown as THREE.WebGLRenderer, writeBuffer, readBuffer, 0, false));
    }
    expect(sceneDraws).toBe(3);
    expect(shadowUpdates).toBe(1);
    gl.render(scene);
    expect(shadowUpdates).toBe(2);
    for (const pass of passes) pass.dispose();
    writeBuffer.dispose();
    readBuffer.dispose();
  });

  test.each([[true, false], [false, true], [false, false], [true, true]])(
    "preserves shadow update policy auto=%s dirty=%s",
    (autoUpdate, needsUpdate) => {
      const gl = renderer(autoUpdate, needsUpdate);
      expect(renderShadowlessPrepass(gl, new THREE.Scene(), [], () => {
        expect(gl.shadowMap.autoUpdate).toBe(false);
        expect(gl.shadowMap.needsUpdate).toBe(false);
        return "depth";
      })).toBe("depth");
      expect(gl.shadowMap.autoUpdate).toBe(autoUpdate);
      expect(gl.shadowMap.needsUpdate).toBe(needsUpdate);
    },
  );

  test("restores a pending update after a prepass throws", () => {
    const gl = renderer(false, true);
    const error = new Error("prepass failed");
    const scene = new THREE.Scene();
    const overlay = new THREE.Group();
    Object.assign(overlay.userData, POSTFX_OVERLAY_USERDATA);
    const alreadyHidden = overlay.clone();
    alreadyHidden.visible = false;
    scene.add(overlay, alreadyHidden);
    const hidden: THREE.Object3D[] = [];
    expect(() => renderShadowlessPrepass(gl, scene, hidden, () => {
      expect(overlay.visible).toBe(false);
      throw error;
    })).toThrow(error);
    expect(overlay.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
    expect(hidden).toHaveLength(0);
    expect(gl.shadowMap.autoUpdate).toBe(false);
    expect(gl.shadowMap.needsUpdate).toBe(true);
  });

  test("nested prepasses restore the outer disabled scope", () => {
    const gl = renderer(true, true);
    const scene = new THREE.Scene();
    const overlay = new THREE.Group();
    Object.assign(overlay.userData, POSTFX_OVERLAY_USERDATA);
    scene.add(overlay);
    const outerHidden: THREE.Object3D[] = [];
    const innerHidden: THREE.Object3D[] = [];
    renderShadowlessPrepass(gl, scene, outerHidden, () => {
      renderShadowlessPrepass(gl, scene, innerHidden, () => {
        expect(gl.shadowMap.autoUpdate).toBe(false);
        expect(gl.shadowMap.needsUpdate).toBe(false);
        expect(overlay.visible).toBe(false);
      });
      expect(gl.shadowMap.autoUpdate).toBe(false);
      expect(gl.shadowMap.needsUpdate).toBe(false);
      expect(overlay.visible).toBe(false);
    });
    expect(gl.shadowMap.autoUpdate).toBe(true);
    expect(gl.shadowMap.needsUpdate).toBe(true);
    expect(overlay.visible).toBe(true);
    expect(outerHidden).toHaveLength(0);
    expect(innerHidden).toHaveLength(0);
  });
});
