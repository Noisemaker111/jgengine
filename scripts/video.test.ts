import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assembleMp4 } from "./video";

/** Minimal valid truecolor PNG: solid gray. */
function makePng(width: number, height: number, shade: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  const scanlines = Buffer.alloc(height * (1 + width * 3), shade);
  for (let y = 0; y < height; y += 1) scanlines.writeUInt8(0, y * (1 + width * 3));
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

describe("assembleMp4", () => {
  test("encodes frames into a playable faststart MP4 (ftyp header up front)", () => {
    const outPath = join(tmpdir(), `jg-video-test-${process.pid}.mp4`);
    try {
      assembleMp4(
        [
          { png: makePng(32, 24, 30), delayMs: 200 },
          { png: makePng(32, 24, 120), delayMs: 300 },
          { png: makePng(32, 24, 220), delayMs: 400 },
        ],
        outPath,
      );
      expect(existsSync(outPath)).toBe(true);
      const bytes = readFileSync(outPath);
      expect(bytes.length).toBeGreaterThan(100);
      // ISO BMFF: box size (4 bytes) then "ftyp"; faststart puts moov before mdat.
      expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
      expect(bytes.indexOf(Buffer.from("moov", "latin1"))).toBeLessThan(
        bytes.indexOf(Buffer.from("mdat", "latin1")),
      );
    } finally {
      rmSync(outPath, { force: true });
    }
  });

  test("rejects empty input", () => {
    expect(() => assembleMp4([], "/tmp/never.mp4")).toThrow("no frames");
  });
});
