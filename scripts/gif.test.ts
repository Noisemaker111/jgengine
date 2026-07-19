import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { assembleGif, toRgba } from "./gif";

/** Minimal valid truecolor PNG: solid RGB color. */
function makePng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9); // truecolor
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    scanlines.writeUInt8(0, row);
    for (let x = 0; x < width; x += 1) {
      scanlines[row + 1 + x * 3] = rgb[0];
      scanlines[row + 2 + x * 3] = rgb[1];
      scanlines[row + 3 + x * 3] = rgb[2];
    }
  }
  const idat = deflateSync(scanlines);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, 8 + data.length)) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

describe("assembleGif", () => {
  test("emits a valid looping GIF89a with one image block per frame", () => {
    const gif = assembleGif([
      { png: makePng(8, 6, [255, 0, 0]), delayMs: 250 },
      { png: makePng(8, 6, [0, 255, 0]), delayMs: 500 },
      { png: makePng(8, 6, [0, 0, 255]), delayMs: 750 },
    ]);
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(gif.readUInt16LE(6)).toBe(8); // logical screen width
    expect(gif.readUInt16LE(8)).toBe(6); // height
    // NETSCAPE2.0 looping extension present (loop forever).
    expect(gif.includes(Buffer.from("NETSCAPE2.0", "latin1"))).toBe(true);
    // One image descriptor (0x2C separator) per frame.
    let images = 0;
    for (const byte of gif) if (byte === 0x2c) images += 1;
    expect(images).toBeGreaterThanOrEqual(3);
    expect(gif[gif.length - 1]).toBe(0x3b); // trailer
  });

  test("per-frame delay survives in graphic control extensions (centiseconds)", () => {
    const gif = assembleGif([
      { png: makePng(4, 4, [10, 10, 10]), delayMs: 500 },
      { png: makePng(4, 4, [200, 200, 200]), delayMs: 1000 },
    ]);
    // GCE: 0x21 0xF9 0x04 <flags> <delay lo> <delay hi> — collect the delays.
    const delays: number[] = [];
    for (let i = 0; i + 5 < gif.length; i += 1) {
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 0x04) {
        delays.push(gif.readUInt16LE(i + 4));
      }
    }
    expect(delays).toEqual([50, 100]);
  });

  test("rejects empty input and mismatched sizes", () => {
    expect(() => assembleGif([])).toThrow("no frames");
    expect(() =>
      assembleGif([
        { png: makePng(4, 4, [0, 0, 0]), delayMs: 100 },
        { png: makePng(5, 4, [0, 0, 0]), delayMs: 100 },
      ]),
    ).toThrow("differs");
  });
});

describe("toRgba", () => {
  test("expands RGB and grayscale to RGBA, passes RGBA through", () => {
    expect(Array.from(toRgba(new Uint8Array([1, 2, 3]), 1, 1))).toEqual([1, 2, 3, 255]);
    expect(Array.from(toRgba(new Uint8Array([9]), 1, 1))).toEqual([9, 9, 9, 255]);
    expect(Array.from(toRgba(new Uint8Array([9, 128]), 1, 1))).toEqual([9, 9, 9, 128]);
    const rgba = new Uint8Array([1, 2, 3, 4]);
    expect(toRgba(rgba, 1, 1)).toBe(rgba);
  });
});
