/**
 * Turning a rendered frame into the thumbnail a save card shows. Saves keep a small JPEG/WebP data
 * URL (a couple of KB), not a full-resolution PNG, so a slot index still fits in local storage.
 */

/** How {@link shrinkCapture} sizes and encodes a capture. */
export interface SaveThumbnailOptions {
  /** Output width in pixels. Default 320. */
  width?: number;
  /** Output height in pixels. Default 180 (16:9). */
  height?: number;
  /** Encoding quality, 0–1. Default 0.6. */
  quality?: number;
  /** Output format. Default `"image/jpeg"` — smallest for a photo-like frame. */
  type?: "image/jpeg" | "image/webp";
}

/**
 * Downscale a captured frame (a data URL from `captureCanvas`) to a save-card thumbnail. Resolves to
 * the thumbnail data URL, or `null` when the capture could not be decoded (a blank or tainted frame).
 *
 * @capability shrink-capture downscale a captured frame to a save-card thumbnail data URL
 */
export async function shrinkCapture(
  capture: string | null,
  options: SaveThumbnailOptions = {},
): Promise<string | null> {
  if (capture === null || !capture.startsWith("data:image")) return null;
  if (typeof document === "undefined") return null;
  const width = options.width ?? 320;
  const height = options.height ?? 180;
  const image = new Image();
  image.decoding = "sync";
  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = capture;
  });
  if (!loaded) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  try {
    return canvas.toDataURL(options.type ?? "image/jpeg", options.quality ?? 0.6);
  } catch {
    return null;
  }
}
