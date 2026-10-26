import * as THREE from "three";

import { ktx2Detected, materialKtx2Loader } from "@jgengine/core/model/modelLoad.draw";

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Whether fetched bytes are a KTX2 file rather than the PNG/JPEG the URL names. @internal */
export function isKtx2(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, KTX2_IDENTIFIER.length));
  return head.length === KTX2_IDENTIFIER.length && KTX2_IDENTIFIER.every((byte, index) => head[index] === byte);
}

/**
 * The URL asking a dev or measuring server for the image's GPU-compressed twin
 * (`games/shared/textureVariants.ts`), in the row order the loader stores; a host without twins
 * ignores the query and sends the image itself. @internal
 */
export function ktx2TwinUrl(url: string, flipY: boolean): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const [path = "", hash] = url.split("#", 2);
  return `${path}${path.includes("?") ? "&" : "?"}ktx2=auto,${flipY ? "flip" : "top"}${hash === undefined ? "" : `#${hash}`}`;
}

/**
 * The engine's loader for image textures (PNG, JPEG, WebP). The image decodes off the main thread
 * (`createImageBitmap`), so its first upload copies pixels instead of decoding a large JPEG on the
 * main thread inside `texImage2D`, which held a load for hundreds of milliseconds per scanned map.
 * A browser without `createImageBitmap` (and a test without a DOM) loads through `TextureLoader`.
 *
 * Rows land the way `TextureLoader`'s default `flipY` leaves them, baked in at decode since WebGL
 * ignores `flipY` for a bitmap; the bitmap texture's own `flipY` is false. A loader for
 * glTF-convention maps sets {@link ImageTextureLoader.flipY} false, and its views set `flipY` false
 * as they would on a `TextureLoader` texture, so both paths land the same rows.
 *
 * Once a renderer has set up the KTX2 transcoder, the request also asks for the image's compressed
 * twin; when the server has one it arrives as a mipmapped `CompressedTexture` (encoded in the same
 * row order) that uploads with no decode or mipmap pass, and the image itself loads otherwise.
 * @internal
 */
export class ImageTextureLoader extends THREE.Loader<THREE.Texture> {
  /** Store the image bottom row first, as `TextureLoader` does by default. */
  flipY = true;

  override load(url: string, onLoad?: (texture: THREE.Texture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): THREE.Texture {
    if (typeof createImageBitmap !== "function") {
      return new THREE.TextureLoader(this.manager).setCrossOrigin(this.crossOrigin).setPath(this.path).load(url, onLoad, onProgress, onError);
    }
    const texture = new THREE.Texture();
    if (ktx2Detected()) {
      this.loadEither(url, texture, onLoad, onProgress, onError);
      return texture;
    }
    const loader = new THREE.ImageBitmapLoader(this.manager)
      .setCrossOrigin(this.crossOrigin)
      .setPath(this.path)
      .setRequestHeader(this.requestHeader)
      .setWithCredentials(this.withCredentials);
    loader.setOptions({ imageOrientation: this.flipY ? "flipY" : "from-image", premultiplyAlpha: "none" });
    loader.load(
      url,
      (bitmap) => {
        texture.image = bitmap;
        texture.flipY = false;
        texture.needsUpdate = true;
        onLoad?.(texture);
      },
      onProgress,
      onError,
    );
    return texture;
  }

  /** Fetch with the twin query; a KTX2 answer transcodes, anything else decodes as an image into `texture`. */
  private loadEither(url: string, texture: THREE.Texture, onLoad?: (texture: THREE.Texture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    const files = new THREE.FileLoader(this.manager)
      .setPath(this.path)
      .setResponseType("arraybuffer")
      .setRequestHeader(this.requestHeader)
      .setWithCredentials(this.withCredentials);
    files.load(
      ktx2TwinUrl(url, this.flipY),
      (data) => {
        const bytes = data as ArrayBuffer;
        if (isKtx2(bytes)) {
          materialKtx2Loader().parse(bytes, (compressed) => onLoad?.(compressed), onError);
          return;
        }
        createImageBitmap(new Blob([bytes]), { imageOrientation: this.flipY ? "flipY" : "from-image", premultiplyAlpha: "none", colorSpaceConversion: "none" }).then(
          (bitmap) => {
            texture.image = bitmap;
            texture.flipY = false;
            texture.needsUpdate = true;
            onLoad?.(texture);
          },
          (error: unknown) => onError?.(error),
        );
      },
      onProgress,
      onError,
    );
  }
}
