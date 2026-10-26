import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

import { clearSharedModelImages, sharedModelImages } from "./sharedModelImages";

afterEach(clearSharedModelImages);

const loader = new THREE.ImageBitmapLoader();

/** A parser for one model file whose images are the given URIs; counts the images it really loads. */
function fakeParser(path: string, uris: (string | undefined)[], loads: string[]) {
  const parser = {
    json: { images: uris.map((uri) => (uri === undefined ? { bufferView: 0 } : { uri })) },
    options: { path },
    loadImageSource(sourceIndex: number, _loader?: THREE.Loader): Promise<THREE.Texture> {
      loads.push(`${path}${uris[sourceIndex] ?? "<embedded>"}`);
      const texture = new THREE.Texture({ width: 4, height: 4 } as unknown as HTMLImageElement);
      texture.needsUpdate = true;
      return Promise.resolve(texture);
    },
  };
  sharedModelImages(parser as unknown as GLTFParser);
  return parser;
}

describe("model images shared across files", () => {
  test("two models pointing at one texture file load it once and share its GPU source", async () => {
    const loads: string[] = [];
    const wall = fakeParser("/models/kit/", ["T_Trim.png"], loads);
    const door = fakeParser("/models/kit/", ["T_Trim.png"], loads);
    const a = await wall.loadImageSource(0, loader);
    const before = a.source.version;
    const b = await door.loadImageSource(0, loader);
    expect(loads).toEqual(["/models/kit/T_Trim.png"]);
    expect(a).not.toBe(b);
    expect(b.source).toBe(a.source);
    // A later model must not mark the already uploaded image as changed.
    expect(a.source.version).toBe(before);
  });

  test("embedded images and different files stay separate", async () => {
    const loads: string[] = [];
    const one = fakeParser("/models/a/", [undefined, "T_Trim.png"], loads);
    const two = fakeParser("/models/b/", [undefined, "T_Trim.png"], loads);
    await Promise.all([one.loadImageSource(0, loader), two.loadImageSource(0, loader), one.loadImageSource(1, loader), two.loadImageSource(1, loader)]);
    expect(loads.sort()).toEqual(["/models/a/<embedded>", "/models/a/T_Trim.png", "/models/b/<embedded>", "/models/b/T_Trim.png"]);
  });

  test("a failed image is tried again by the next model", async () => {
    const loads: string[] = [];
    const failing = {
      json: { images: [{ uri: "x.png" }] },
      options: { path: "/m/" },
      loadImageSource: (): Promise<THREE.Texture> => {
        loads.push("fail");
        return Promise.reject(new Error("404"));
      },
    };
    sharedModelImages(failing as unknown as GLTFParser);
    await expect(failing.loadImageSource(0, loader)).rejects.toThrow("404");
    await fakeParser("/m/", ["x.png"], loads).loadImageSource(0, loader);
    expect(loads).toEqual(["fail", "/m/x.png"]);
  });
});
