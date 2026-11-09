import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { excludesOverlays, type PrepassListRenderer } from "./postfxOverlay.draw";
import { renderShadowlessPrepass } from "./shadowPrepass.draw";

function renderer(autoUpdate = true, needsUpdate = false): Pick<THREE.WebGLRenderer, "shadowMap"> & PrepassListRenderer {
  return {
    shadowMap: { autoUpdate, needsUpdate } as THREE.WebGLShadowMap,
    renderLists: { get: () => ({ opaque: [], transmissive: [], transparent: [], finish: () => {} }) },
  };
}

describe("postfx shadow prepasses", () => {
  test("actual GTAO and DOF scene prepasses reuse beauty shadows and beauty matrices", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const writeBuffer = new THREE.WebGLRenderTarget(8, 8);
    const readBuffer = new THREE.WebGLRenderTarget(8, 8);
    const passes = [new GTAOPass(scene, camera, 8, 8), new BokehPass(scene, camera, {})];
    let shadowUpdates = 0;
    let sceneDraws = 0;
    const matrixWalkStates: boolean[] = [];
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
        matrixWalkStates.push(scene.matrixWorldAutoUpdate);
        if (gl.shadowMap.autoUpdate || gl.shadowMap.needsUpdate) shadowUpdates++;
      },
    };
    gl.render(scene);
    for (const pass of passes) {
      renderShadowlessPrepass(gl, scene, excludesOverlays, () => pass.render(gl as unknown as THREE.WebGLRenderer, writeBuffer, readBuffer, 0, false));
    }
    expect(sceneDraws).toBe(3);
    expect(shadowUpdates).toBe(1);
    expect(matrixWalkStates).toEqual([true, false, false]);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
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
      expect(renderShadowlessPrepass(gl, new THREE.Scene(), excludesOverlays, () => {
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
    expect(() => renderShadowlessPrepass(gl, new THREE.Scene(), excludesOverlays, () => {
      throw error;
    })).toThrow(error);
    expect(gl.shadowMap.autoUpdate).toBe(false);
    expect(gl.shadowMap.needsUpdate).toBe(true);
  });

  test("nested prepasses restore the outer disabled scope", () => {
    const gl = renderer(true, true);
    const scene = new THREE.Scene();
    renderShadowlessPrepass(gl, scene, excludesOverlays, () => {
      renderShadowlessPrepass(gl, scene, excludesOverlays, () => {
        expect(gl.shadowMap.autoUpdate).toBe(false);
        expect(gl.shadowMap.needsUpdate).toBe(false);
        expect(scene.matrixWorldAutoUpdate).toBe(false);
      });
      expect(gl.shadowMap.autoUpdate).toBe(false);
      expect(gl.shadowMap.needsUpdate).toBe(false);
    });
    expect(gl.shadowMap.autoUpdate).toBe(true);
    expect(gl.shadowMap.needsUpdate).toBe(true);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });

  test("a throwing prepass restores the scene's matrix pass", () => {
    const scene = new THREE.Scene();
    const error = new Error("prepass failed");
    expect(() => renderShadowlessPrepass(renderer(), scene, excludesOverlays, () => {
      expect(scene.matrixWorldAutoUpdate).toBe(false);
      throw error;
    })).toThrow(error);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });
});
