import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

import jpeg from "jpeg-js";

/**
 * The few image codecs the model library's pulls need, in plain TypeScript so a pull runs anywhere
 * Bun or Node does: TGA and PNG in, JPEG and PNG out, and a box-filter downscale between them.
 */

/** Git's blob id for a file's bytes: what the contents API lists as `sha`.
 * @internal
 */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

/** A decoded image as top-row-first RGBA. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Decode an uncompressed or run-length TGA (true-colour or greyscale) to RGBA rows in **glTF row
 * order for FBX UVs**: FBX puts v = 0 at the image's bottom edge and glTF at its first row, so the
 * returned first row is the picture's bottom row. Pass the result straight to an encoder.
 * @internal
 */
export function decodeTgaForGltf(bytes: Uint8Array): RgbaImage {
  const idLength = bytes[0]!;
  const colorMapType = bytes[1]!;
  const imageType = bytes[2]!;
  const colorMapLength = bytes[5]! | (bytes[6]! << 8);
  const colorMapEntryBits = bytes[7]!;
  const width = bytes[12]! | (bytes[13]! << 8);
  const height = bytes[14]! | (bytes[15]! << 8);
  const bits = bytes[16]!;
  const topDown = (bytes[17]! & 0x20) !== 0;
  if (colorMapType !== 0) throw new Error("colour-mapped TGA is not supported");
  const grey = imageType === 3 || imageType === 11;
  const rle = imageType === 10 || imageType === 11;
  if (![2, 3, 10, 11].includes(imageType)) throw new Error(`TGA image type ${imageType} is not supported`);
  const bpp = bits / 8;
  let at = 18 + idLength + colorMapLength * Math.ceil(colorMapEntryBits / 8);
  const pixels = width * height;
  const raw = new Uint8Array(pixels * 4);
  const put = (index: number, from: number): void => {
    const o = index * 4;
    if (grey) {
      raw[o] = raw[o + 1] = raw[o + 2] = bytes[from]!;
      raw[o + 3] = bpp === 2 ? bytes[from + 1]! : 255;
    } else {
      raw[o] = bytes[from + 2]!;
      raw[o + 1] = bytes[from + 1]!;
      raw[o + 2] = bytes[from]!;
      raw[o + 3] = bpp === 4 ? bytes[from + 3]! : 255;
    }
  };
  if (!rle) {
    for (let i = 0; i < pixels; i += 1) put(i, at + i * bpp);
  } else {
    let i = 0;
    while (i < pixels) {
      const header = bytes[at]!;
      at += 1;
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        for (let k = 0; k < count && i < pixels; k += 1, i += 1) put(i, at);
        at += bpp;
      } else {
        for (let k = 0; k < count && i < pixels; k += 1, i += 1, at += bpp) put(i, at);
      }
    }
  }
  if (!topDown) return { width, height, data: raw };
  // Stored top row first: reverse so the bottom row leads, which is what FBX UVs expect in glTF.
  const data = new Uint8Array(raw.length);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) data.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
  return { width, height, data };
}

/** Halve an RGBA image (2x2 box filter) until its longest edge fits `max`.
 * @internal
 */
export function fitRgba(image: RgbaImage, max: number): RgbaImage {
  let { width, height, data } = image;
  while (Math.max(width, height) > max && width > 1 && height > 1) {
    const w = width >> 1;
    const h = height >> 1;
    const next = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const a = (y * 2 * width + x * 2) * 4;
        const b = a + width * 4;
        for (let c = 0; c < 4; c += 1) {
          next[(y * w + x) * 4 + c] = (data[a + c]! + data[a + 4 + c]! + data[b + c]! + data[b + 4 + c]! + 2) >> 2;
        }
      }
    }
    data = next;
    width = w;
    height = h;
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Encode RGBA as an 8-bit PNG (used where a map needs its alpha, which JPEG cannot carry).
 * @internal
 */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) rows.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encode RGBA as a baseline JPEG (alpha dropped).
 * @internal
 */
export function encodeJpeg(image: RgbaImage, quality = 86): Uint8Array {
  return new Uint8Array(jpeg.encode({ data: image.data, width: image.width, height: image.height }, quality).data);
}


const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

/**
 * Decode an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB, RGBA or palette) to top-row-first
 * RGBA, the order glTF textures already use.
 * @internal
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) throw new Error("decodePng: not a PNG file (bad signature)");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const data: Uint8Array[] = [];
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG depth ${depth} / interlace ${interlace} is not supported`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) throw new Error(`PNG colour type ${colorType} is not supported`);
  const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of data) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = new Uint8Array(inflateSync(joined));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? rows[y * stride + x - channels]! : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const corner = y > 0 && x >= channels ? rows[(y - 1) * stride + x - channels]! : 0;
      let value = line[x]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      rows[y * stride + x] = value & 0xff;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const s = i * channels;
    if (colorType === 3) {
      const index = rows[s]!;
      out[o] = palette![index * 3]!;
      out[o + 1] = palette![index * 3 + 1]!;
      out[o + 2] = palette![index * 3 + 2]!;
      out[o + 3] = transparency !== null && index < transparency.length ? transparency[index]! : 255;
    } else if (channels <= 2) {
      out[o] = out[o + 1] = out[o + 2] = rows[s]!;
      out[o + 3] = channels === 2 ? rows[s + 1]! : 255;
    } else {
      out[o] = rows[s]!;
      out[o + 1] = rows[s + 1]!;
      out[o + 2] = rows[s + 2]!;
      out[o + 3] = channels === 4 ? rows[s + 3]! : 255;
    }
  }
  return { width, height, data: out };
}

/** Whether any pixel is less than fully opaque.
 * @internal
 */
export function hasAlpha(image: RgbaImage): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! < 255) return true;
  return false;
}
