import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import { ImageTextureLoader } from "./imageTexture";

const globals = globalThis as { createImageBitmap?: unknown; fetch: typeof fetch };
const realFetch = globals.fetch;
const realBitmap = globals.createImageBitmap;

afterEach(() => {
  globals.fetch = realFetch;
  if (realBitmap === undefined) delete globals.createImageBitmap;
  else globals.createImageBitmap = realBitmap;
});

function decodeOffThread(): { options: ImageBitmapOptions[] } {
  const options: ImageBitmapOptions[] = [];
  globals.fetch = (async () => new Response(new Blob([new Uint8Array(4)]))) as unknown as typeof fetch;
  globals.createImageBitmap = async (_blob: Blob, given: ImageBitmapOptions) => {
    options.push({ ...given });
    return { width: 2, height: 2, close() {} };
  };
  return { options };
}

function loaded(loader: ImageTextureLoader, url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

describe("ImageTextureLoader", () => {
  test("decodes off the main thread with TextureLoader's rows baked in, raw channels and straight alpha", async () => {
    const { options } = decodeOffThread();
    const texture = await loaded(new ImageTextureLoader(), "rock-normal.jpg");
    expect(options[0]).toMatchObject({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    expect(texture.image.width).toBe(2);
    // WebGL ignores flipY for a bitmap; the flip is already in the pixels.
    expect(texture.flipY).toBe(false);
    expect(texture.version).toBeGreaterThan(0);
  });

  test("a glTF-convention loader keeps the image's own rows", async () => {
    const { options } = decodeOffThread();
    const loader = new ImageTextureLoader();
    loader.flipY = false;
    await loaded(loader, "plank-color.png");
    expect(options[0]!.imageOrientation).toBe("from-image");
  });

  test("a failed fetch reports through onError", async () => {
    decodeOffThread();
    globals.createImageBitmap = async () => {
      throw new Error("not an image");
    };
    await expect(loaded(new ImageTextureLoader(), "missing.png")).rejects.toThrow("not an image");
  });
});
