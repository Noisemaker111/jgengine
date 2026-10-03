import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRoot, type ReconcilerRoot } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { armTextureErrors, textureErrorsSnapshot } from "@jgengine/core/devtools/textureErrors";
import type { EnvironmentSource } from "@jgengine/core/render/environment";
import { EnvironmentLighting } from "./EnvironmentLighting";

const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];
const originals = {
  hdr: RGBELoader.prototype.loadAsync,
  exr: EXRLoader.prototype.loadAsync,
  cube: THREE.CubeTextureLoader.prototype.loadAsync,
  equirect: THREE.PMREMGenerator.prototype.fromEquirectangular,
  cubemap: THREE.PMREMGenerator.prototype.fromCubemap,
  dispose: THREE.PMREMGenerator.prototype.dispose,
  warn: console.warn,
};
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
let pmremDisposals = 0;
let conversions = 0;
let warnings = 0;

beforeEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  pmremDisposals = 0;
  conversions = 0;
  warnings = 0;
  THREE.PMREMGenerator.prototype.dispose = () => { pmremDisposals++; };
  console.warn = (...messages) => { if (String(messages[0]).startsWith("[jgengine]")) warnings++; };
  armTextureErrors(true);
});

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  RGBELoader.prototype.loadAsync = originals.hdr;
  EXRLoader.prototype.loadAsync = originals.exr;
  THREE.CubeTextureLoader.prototype.loadAsync = originals.cube;
  THREE.PMREMGenerator.prototype.fromEquirectangular = originals.equirect;
  THREE.PMREMGenerator.prototype.fromCubemap = originals.cubemap;
  THREE.PMREMGenerator.prototype.dispose = originals.dispose;
  console.warn = originals.warn;
  armTextureErrors(false);
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function harness(source: EnvironmentSource) {
  const root = createRoot({} as HTMLCanvasElement);
  roots.push(root);
  const scene = new THREE.Scene();
  const originalTexture = new THREE.Texture();
  const originalRotation = new THREE.Euler(0.1, 0.2, 0.3);
  scene.environment = originalTexture;
  scene.environmentRotation = originalRotation;
  scene.environmentIntensity = 0.6;
  await root.configure({ scene, frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  await act(async () => root.render(createElement(EnvironmentLighting, { source })));
  return { root, scene, originalTexture, originalRotation, remove: () => act(async () => root.render(null)) };
}

describe("environment lighting ownership", () => {
  for (const kind of ["hdr", "exr", "cube"] as const) {
    test(`late ${kind} completion disposes its texture without calling a disposed PMREM`, async () => {
      const pending = deferred<THREE.DataTexture>();
      const pendingCube = deferred<THREE.CubeTexture>();
      RGBELoader.prototype.loadAsync = () => pending.promise;
      EXRLoader.prototype.loadAsync = () => pending.promise;
      THREE.CubeTextureLoader.prototype.loadAsync = () => pendingCube.promise;
      THREE.PMREMGenerator.prototype.fromEquirectangular = () => { conversions++; throw new Error("PMREM used after cancellation"); };
      THREE.PMREMGenerator.prototype.fromCubemap = () => { conversions++; throw new Error("PMREM used after cancellation"); };
      const source: EnvironmentSource = kind === "cube" ? { kind: "cube", urls: ["px", "nx", "py", "ny", "pz", "nz"], intensity: 0.8 } : { kind: "hdri", url: `late.${kind}`, intensity: 0.8 };
      const h = await harness(source);
      expect(h.scene.environmentIntensity).toBe(0.8);
      await h.remove();
      expect(pmremDisposals).toBe(1);
      expect(h.scene.environment).toBe(h.originalTexture);
      expect(h.scene.environmentIntensity).toBe(0.6);
      const texture = kind === "cube" ? new THREE.CubeTexture() : new THREE.DataTexture();
      let disposed = 0;
      texture.addEventListener("dispose", () => disposed++);
      await act(async () => {
        if (kind === "cube") pendingCube.resolve(texture as THREE.CubeTexture);
        else pending.resolve(texture as THREE.DataTexture);
      });
      expect(disposed).toBe(1);
      expect(conversions).toBe(0);
      expect(warnings).toBe(0);
      expect(textureErrorsSnapshot()).toEqual([]);
      expect(h.scene.environment).toBe(h.originalTexture);
    });
  }

  test("success releases owned inputs/output and restores previous scene values", async () => {
    const texture = new THREE.DataTexture();
    RGBELoader.prototype.loadAsync = async () => texture;
    const target = new THREE.WebGLRenderTarget(4, 4);
    THREE.PMREMGenerator.prototype.fromEquirectangular = () => { conversions++; return target; };
    let disposed = 0;
    texture.addEventListener("dispose", () => disposed++);
    target.addEventListener("dispose", () => disposed++);
    const h = await harness({ kind: "hdri", url: "owned.hdr", rotation: 0.7, intensity: 0.8 });
    expect(h.scene.environment).toBe(target.texture);
    expect(h.scene.environmentRotation.y).toBe(0.7);
    expect(conversions).toBe(1);
    await h.remove();
    expect(disposed).toBe(2);
    expect(pmremDisposals).toBe(1);
    expect(h.scene.environment).toBe(h.originalTexture);
    expect(h.scene.environmentRotation).toBe(h.originalRotation);
    expect(h.scene.environmentIntensity).toBe(0.6);
  });

  test("cleanup preserves environment, rotation and intensity replaced by another owner", async () => {
    const texture = new THREE.DataTexture();
    RGBELoader.prototype.loadAsync = async () => texture;
    const target = new THREE.WebGLRenderTarget(4, 4);
    THREE.PMREMGenerator.prototype.fromEquirectangular = () => target;
    const h = await harness({ kind: "hdri", url: "superseded.hdr", rotation: 0.7, intensity: 0.8 });
    const replacement = new THREE.Texture();
    const rotation = new THREE.Euler(0, 1.2, 0);
    h.scene.environment = replacement;
    h.scene.environmentRotation = rotation;
    h.scene.environmentIntensity = 1.4;
    let borrowedDisposals = 0;
    replacement.addEventListener("dispose", () => borrowedDisposals++);
    h.originalTexture.addEventListener("dispose", () => borrowedDisposals++);
    await h.remove();
    expect(h.scene.environment).toBe(replacement);
    expect(h.scene.environmentRotation).toBe(rotation);
    expect(h.scene.environmentIntensity).toBe(1.4);
    expect(borrowedDisposals).toBe(0);
  });

  test("cancelled rejections stay quiet while active failures report their asset URL", async () => {
    const cancelled = deferred<THREE.DataTexture>();
    RGBELoader.prototype.loadAsync = () => cancelled.promise;
    const h = await harness({ kind: "hdri", url: "cancelled.hdr" });
    await h.remove();
    await act(async () => cancelled.reject(new Error("request completed after unmount")));
    expect(warnings).toBe(0);
    expect(textureErrorsSnapshot()).toEqual([]);
    RGBELoader.prototype.loadAsync = async () => { throw new Error("missing authored environment"); };
    const active = await harness({ kind: "hdri", url: "missing.hdr" });
    expect(warnings).toBe(1);
    expect(textureErrorsSnapshot()).toEqual([{ url: "missing.hdr", count: 1 }]);
    expect(active.scene.environment).toBe(active.originalTexture);
    await active.remove();
    expect(active.scene.environmentIntensity).toBe(0.6);
  });

  test("cleanup preserves an environment rotation edited in place", async () => {
    RGBELoader.prototype.loadAsync = async () => new THREE.DataTexture();
    THREE.PMREMGenerator.prototype.fromEquirectangular = () => new THREE.WebGLRenderTarget(4, 4);
    const h = await harness({ kind: "hdri", url: "rotation.hdr", rotation: 0.7 });
    const edited = h.scene.environmentRotation;
    edited.y = 1.2;
    await h.remove();
    expect(h.scene.environment).toBe(h.originalTexture);
    expect(h.scene.environmentRotation).toBe(edited);
    expect(h.scene.environmentRotation.y).toBe(1.2);
  });
});
