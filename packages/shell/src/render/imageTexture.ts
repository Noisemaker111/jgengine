import * as THREE from "three";

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
}
