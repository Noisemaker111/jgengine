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

test("a baked cube LUT packs into one linear-filtered strip and is released with the pass", () => {
  const size = 4;
  const data = new Uint8Array(size * size * size * 3);
  for (let index = 0; index < size * size * size; index += 1) {
    data[index * 3] = index % 256;
    data[index * 3 + 1] = 255 - (index % 256);
    data[index * 3 + 2] = index % 256;
  }
  const pass = createGradePass({ lut: { cube: { size, data } } });
  const texture = pass.uniforms.uLut.value as THREE.DataTexture;
  expect(texture).toBeInstanceOf(THREE.DataTexture);
  expect(texture.image.width).toBe(size * size);
  expect(texture.image.height).toBe(size);
  expect(texture.minFilter).toBe(THREE.LinearFilter);
  expect(texture.magFilter).toBe(THREE.LinearFilter);
  // Display values are sampled raw, so the hardware must not decode them as sRGB.
  expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(pass.uniforms.uLutSize.value).toBe(size);
  // Blue slice 1, green 2, red 3 -> row 2, tile 1, column 3 of the strip.
  const from = (1 * size * size + 2 * size + 3) * 3;
  const to = (2 * size * size + 1 * size + 3) * 4;
  expect(texture.image.data[to]).toBe(data[from]);
  expect(texture.image.data[to + 1]).toBe(data[from + 1]);
  expect(texture.image.data[to + 2]).toBe(data[from + 2]);
  expect(texture.image.data[to + 3]).toBe(255);
  let disposals = 0;
  texture.addEventListener("dispose", () => { disposals++; });
  pass.dispose();
  expect(disposals).toBe(1);
});

test("a baked cube LUT does not touch the texture loader", () => {
  createGradePass({ lut: { cube: { size: 2, data: new Uint8Array(24).fill(128) } } });
  expect(loads).not.toHaveBeenCalled();
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
