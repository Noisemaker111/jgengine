/**
 * Zero-dep PNG decoder: signature + chunk walk, zlib inflate (Bun/Node
 * built-in) on the concatenated IDAT stream, then per-scanline unfilter
 * (None/Sub/Up/Average/Paeth). Supports 8-bit grayscale, grayscale+alpha,
 * RGB, and RGBA, non-interlaced — the shapes `Page.captureScreenshot`
 * PNGs and any hand-built test fixture use. Palette (color type 3),
 * interlaced, and >8-bit images throw rather than silently misdecode.
 */
import { inflateSync } from "node:zlib";

export type DecodedPng = { width: number; height: number; data: Uint8Array };

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("decodePng: not a PNG file (bad signature)");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 6;
  let interlace = 0;
  const idatChunks: Uint8Array[] = [];

  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (width === 0 || height === 0) throw new Error("decodePng: missing or empty IHDR chunk");
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth} (only 8-bit PNGs are supported)`);
  if (interlace !== 0) throw new Error("decodePng: interlaced PNGs are not supported");
  if (colorType === 3) throw new Error("decodePng: palette PNGs are not supported");
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (channels === undefined) throw new Error(`decodePng: unsupported color type ${colorType}`);

  const compressed = Buffer.concat(idatChunks.map((chunk) => Buffer.from(chunk)));
  const raw = inflateSync(compressed);

  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const output = new Uint8Array(width * height * 4);
  let prevScanline = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];
    const scanline = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const filt = raw[rowStart + 1 + x];
      const a = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const b = prevScanline[x];
      const c = x >= bytesPerPixel ? prevScanline[x - bytesPerPixel] : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = filt;
          break;
        case 1:
          value = filt + a;
          break;
        case 2:
          value = filt + b;
          break;
        case 3:
          value = filt + Math.floor((a + b) / 2);
          break;
        case 4:
          value = filt + paethPredictor(a, b, c);
          break;
        default:
          throw new Error(`decodePng: unsupported scanline filter type ${filterType}`);
      }
      scanline[x] = value & 0xff;
    }
    for (let px = 0; px < width; px += 1) {
      const srcOffset = px * bytesPerPixel;
      const dstOffset = (y * width + px) * 4;
      if (colorType === 6) {
        output[dstOffset] = scanline[srcOffset];
        output[dstOffset + 1] = scanline[srcOffset + 1];
        output[dstOffset + 2] = scanline[srcOffset + 2];
        output[dstOffset + 3] = scanline[srcOffset + 3];
      } else if (colorType === 2) {
        output[dstOffset] = scanline[srcOffset];
        output[dstOffset + 1] = scanline[srcOffset + 1];
        output[dstOffset + 2] = scanline[srcOffset + 2];
        output[dstOffset + 3] = 255;
      } else if (colorType === 4) {
        const gray = scanline[srcOffset];
        output[dstOffset] = gray;
        output[dstOffset + 1] = gray;
        output[dstOffset + 2] = gray;
        output[dstOffset + 3] = scanline[srcOffset + 1];
      } else {
        const gray = scanline[srcOffset];
        output[dstOffset] = gray;
        output[dstOffset + 1] = gray;
        output[dstOffset + 2] = gray;
        output[dstOffset + 3] = 255;
      }
    }
    prevScanline = scanline;
  }

  return { width, height, data: output };
}
