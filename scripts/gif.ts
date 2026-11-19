import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { decodePng } from "../packages/assets/src/imageCodec";
import type { ApngFrame } from "./apng";

export function toRgba(data: Uint8Array, width: number, height: number): Uint8Array {
  const pixels = width * height;
  const channels = data.length / pixels;
  if (channels === 4) return data;
  const out = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const src = i * channels;
    if (channels === 3) {
      out[i * 4] = data[src]!;
      out[i * 4 + 1] = data[src + 1]!;
      out[i * 4 + 2] = data[src + 2]!;
      out[i * 4 + 3] = 255;
    } else {
      // grayscale (1) or grayscale+alpha (2)
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = data[src]!;
      out[i * 4 + 3] = channels === 2 ? data[src + 1]! : 255;
    }
  }
  return out;
}

/**
 * Encode PNG frames (with per-frame delays) into one looping GIF. Frames must
 * share dimensions — callers assemble them via `framesFromTimeline`, which
 * already filters mismatched load-in frames.
 */
export function assembleGif(frames: ApngFrame[]): Buffer {
  if (frames.length === 0) throw new Error("gif: no frames");
  const gif = GIFEncoder();
  let size: { width: number; height: number } | null = null;
  for (const frame of frames) {
    const decoded = decodePng(frame.png instanceof Uint8Array ? frame.png : new Uint8Array(frame.png));
    if (size === null) size = { width: decoded.width, height: decoded.height };
    else if (decoded.width !== size.width || decoded.height !== size.height) {
      throw new Error(`gif: frame size ${decoded.width}x${decoded.height} differs from ${size.width}x${size.height}`);
    }
    const rgba = toRgba(decoded.data, decoded.width, decoded.height);
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, decoded.width, decoded.height, {
      palette,
      delay: frame.delayMs,
      repeat: 0, // loop forever (only the first frame's repeat matters)
    });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
