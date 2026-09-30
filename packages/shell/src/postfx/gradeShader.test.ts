import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import { createGradePass } from "./gradeShader";

const loads = spyOn(THREE.TextureLoader.prototype, "loadAsync");
afterEach(() => loads.mockReset());
afterAll(() => loads.mockRestore());

function deferredTexture() {
  let resolve!: (texture: THREE.Texture) => void;
  const promise = new Promise<THREE.Texture>((done) => { resolve = done; });
  return { promise, resolve };
}

function observedTexture() {
  const texture = new THREE.Texture();
  let disposals = 0;
  texture.addEventListener("dispose", () => { disposals++; });
  return { texture, disposals: () => disposals };
}

test("a grade pass applies its LUT and releases exactly its owned texture once", async () => {
  const loaded = observedTexture();
  const external = observedTexture();
  loads.mockResolvedValueOnce(loaded.texture);
  const pass = createGradePass({ lut: { url: "/grade.png", size: 16 } });
  await Promise.resolve();
  expect(loads).toHaveBeenCalledWith("/grade.png");
  expect(pass.uniforms.uLut.value).toBe(loaded.texture);
  expect(pass.uniforms.uLutSize.value).toBe(16);
  expect(loaded.texture.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(loaded.texture.minFilter).toBe(THREE.NearestFilter);
  expect(loaded.texture.magFilter).toBe(THREE.NearestFilter);
  expect(loaded.texture.generateMipmaps).toBe(false);
  pass.uniforms.uLut.value = external.texture;
  pass.dispose();
  pass.dispose();
  expect(loaded.disposals()).toBe(1);
  expect(external.disposals()).toBe(0);
  external.texture.dispose();
});

test("a disposed old graph cannot bind a late LUT into its replacement", async () => {
  const oldLoad = deferredTexture();
  const newLoad = deferredTexture();
  const oldTexture = observedTexture();
  const newTexture = observedTexture();
  loads.mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(newLoad.promise);
  const config = { lut: { url: "/same-grade.png" } };
  const oldPass = createGradePass(config);
  oldPass.dispose();
  const replacement = createGradePass(config);
  newLoad.resolve(newTexture.texture);
  await Promise.resolve();
  oldLoad.resolve(oldTexture.texture);
  await Promise.resolve();
  expect(loads).toHaveBeenCalledTimes(2);
  expect(oldPass.uniforms.uLut.value).toBeNull();
  expect(oldTexture.disposals()).toBe(1);
  expect(replacement.uniforms.uLut.value).toBe(newTexture.texture);
  expect(replacement.uniforms.uLutSize.value).toBe(32);
  expect(newTexture.disposals()).toBe(0);
  replacement.dispose();
  expect(newTexture.disposals()).toBe(1);
});

test("a failed LUT keeps the normal grade pass usable without an unhandled rejection", async () => {
  loads.mockRejectedValueOnce(new Error("LUT unavailable"));
  const pass = createGradePass({ lut: { url: "/missing.png" } });
  await Promise.resolve();
  await Promise.resolve();
  expect(pass.uniforms.uLut.value).toBeNull();
  expect(pass.uniforms.uLutSize.value).toBe(0);
  pass.dispose();
});
