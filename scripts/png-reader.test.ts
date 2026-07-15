import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { decodePng } from "./png-reader";

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Uint8Array.from(type.split("").map((c) => c.charCodeAt(0)));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([Buffer.from(typeBytes), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, crcInput, crc]);
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

function encodeTestPng(
  width: number,
  height: number,
  pixels: readonly (readonly [number, number, number, number])[],
  filterType: 0 | 1 | 2 | 3 | 4 = 0,
): Uint8Array {
  const bpp = 4;
  const stride = width * bpp;
  const rawBytes = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixels[y * width + x];
      const offset = y * stride + x * bpp;
      rawBytes[offset] = r;
      rawBytes[offset + 1] = g;
      rawBytes[offset + 2] = b;
      rawBytes[offset + 3] = a;
    }
  }

  const filtered = new Uint8Array(height * (1 + stride));
  let prevRow = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const rowRaw = rawBytes.subarray(y * stride, (y + 1) * stride);
    const rowStart = y * (1 + stride);
    filtered[rowStart] = filterType;
    for (let x = 0; x < stride; x += 1) {
      const raw = rowRaw[x];
      const a = x >= bpp ? rowRaw[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      let predictor: number;
      switch (filterType) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = a;
          break;
        case 2:
          predictor = b;
          break;
        case 3:
          predictor = Math.floor((a + b) / 2);
          break;
        case 4:
          predictor = paethPredictor(a, b, c);
          break;
      }
      filtered[rowStart + 1 + x] = (raw - predictor) & 0xff;
    }
    prevRow = rowRaw;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(Buffer.from(filtered));

  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

describe("decodePng", () => {
  const pixels: (readonly [number, number, number, number])[] = [
    [255, 0, 0, 255],
    [0, 255, 0, 128],
    [0, 0, 255, 0],
    [10, 20, 30, 255],
  ];

  test.each([0, 1, 2, 3, 4] as const)("round-trips a small RGBA image through filter type %d", (filterType) => {
    const png = encodeTestPng(2, 2, pixels, filterType);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    for (let i = 0; i < pixels.length; i += 1) {
      expect(Array.from(decoded.data.subarray(i * 4, i * 4 + 4))).toEqual(Array.from(pixels[i]));
    }
  });

  test("rejects a non-PNG buffer", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
