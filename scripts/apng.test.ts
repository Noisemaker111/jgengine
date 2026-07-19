import { describe, expect, test } from "bun:test";
import { deflateSync, inflateSync } from "node:zlib";
import { assembleApng, framesFromTimeline, parsePngChunks, thinFrames } from "./apng";

/** Minimal valid truecolor PNG: one gray pixel row per height. */
function makePng(width: number, height: number, shade: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type: truecolor
  const scanlines = Buffer.alloc(height * (1 + width * 3), shade);
  for (let y = 0; y < height; y += 1) scanlines.writeUInt8(0, y * (1 + width * 3)); // filter 0
  const idat = deflateSync(scanlines);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

describe("assembleApng", () => {
  test("wraps frames into acTL/fcTL/fdAT with contiguous sequence numbers", () => {
    const apng = assembleApng([
      { png: makePng(4, 3, 10), delayMs: 250 },
      { png: makePng(4, 3, 20), delayMs: 250 },
      { png: makePng(4, 3, 30), delayMs: 500 },
    ]);
    const chunks = parsePngChunks(apng);
    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe("IHDR");
    expect(types[1]).toBe("acTL");
    expect(types.filter((t) => t === "fcTL")).toHaveLength(3);
    expect(types.filter((t) => t === "IDAT")).toHaveLength(1);
    expect(types.filter((t) => t === "fdAT")).toHaveLength(2);
    expect(types[types.length - 1]).toBe("IEND");

    const actl = chunks.find((c) => c.type === "acTL")!;
    expect(actl.data.readUInt32BE(0)).toBe(3); // num_frames
    expect(actl.data.readUInt32BE(4)).toBe(0); // loop forever

    // Sequence numbers over fcTL + fdAT must be 0..4 in order.
    const sequenced = chunks
      .filter((c) => c.type === "fcTL" || c.type === "fdAT")
      .map((c) => c.data.readUInt32BE(0));
    expect(sequenced).toEqual([0, 1, 2, 3, 4]);
  });

  test("fcTL carries per-frame delay in milliseconds and full-frame geometry", () => {
    const apng = assembleApng([
      { png: makePng(6, 2, 1), delayMs: 125 },
      { png: makePng(6, 2, 2), delayMs: 750 },
    ]);
    const fctls = parsePngChunks(apng).filter((c) => c.type === "fcTL");
    for (const [index, delay] of [125, 750].entries()) {
      const data = fctls[index]!.data;
      expect(data.readUInt32BE(4)).toBe(6); // width
      expect(data.readUInt32BE(8)).toBe(2); // height
      expect(data.readUInt32BE(12)).toBe(0); // x_offset
      expect(data.readUInt16BE(20)).toBe(delay); // delay_num
      expect(data.readUInt16BE(22)).toBe(1000); // delay_den
    }
  });

  test("frame pixel data survives rewrapping losslessly", () => {
    const apng = assembleApng([
      { png: makePng(3, 3, 77), delayMs: 100 },
      { png: makePng(3, 3, 99), delayMs: 100 },
    ]);
    const chunks = parsePngChunks(apng);
    const idat = chunks.find((c) => c.type === "IDAT")!;
    const fdat = chunks.find((c) => c.type === "fdAT")!;
    const rowBytes = 1 + 3 * 3;
    expect(inflateSync(idat.data).subarray(0, rowBytes)).toEqual(
      inflateSync(makePngPayload(3, 3, 77)).subarray(0, rowBytes),
    );
    // fdAT = 4-byte sequence + the exact IDAT bytes of frame 1.
    expect(inflateSync(fdat.data.subarray(4))).toEqual(inflateSync(makePngPayload(3, 3, 99)));
  });

  test("rejects mismatched frame dimensions and empty input", () => {
    expect(() => assembleApng([])).toThrow("no frames");
    expect(() =>
      assembleApng([
        { png: makePng(4, 4, 1), delayMs: 100 },
        { png: makePng(5, 4, 1), delayMs: 100 },
      ]),
    ).toThrow("IHDR differs");
  });

  test("output CRCs are valid for every chunk", () => {
    const apng = assembleApng([
      { png: makePng(2, 2, 5), delayMs: 100 },
      { png: makePng(2, 2, 6), delayMs: 100 },
    ]);
    let offset = 8;
    while (offset + 8 <= apng.length) {
      const length = apng.readUInt32BE(offset);
      const stored = apng.readUInt32BE(offset + 8 + length);
      expect(stored).toBe(crc32(apng.subarray(offset + 4, offset + 8 + length)));
      offset += 12 + length;
    }
  });
});

describe("framesFromTimeline", () => {
  test("derives delays from timestamps, drops odd-sized load frames, merges duplicates", () => {
    const a = makePng(4, 4, 10);
    const b = makePng(4, 4, 20);
    const loading = makePng(2, 2, 0); // pre-resize frame at the wrong size
    const frames = framesFromTimeline([
      { png: loading, tMs: 0 },
      { png: a, tMs: 100 },
      { png: a, tMs: 350 }, // duplicate repaint — merged into the first
      { png: b, tMs: 600 },
    ]);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.delayMs).toBe(500); // 100 → 600
    expect(frames[1]!.delayMs).toBe(1000); // last-frame hold
  });

  test("clamps extreme gaps to keep a frame-starved clip watchable", () => {
    const frames = framesFromTimeline([
      { png: makePng(3, 3, 1), tMs: 0 },
      { png: makePng(3, 3, 2), tMs: 9_000 }, // 9s repaint gap on slow headless GL
      { png: makePng(3, 3, 3), tMs: 9_010 }, // 10ms burst
    ]);
    expect(frames.map((f) => f.delayMs)).toEqual([2000, 40, 1000]);
  });

  test("empty timeline yields no frames", () => {
    expect(framesFromTimeline([])).toEqual([]);
  });
});

describe("thinFrames", () => {
  test("halves frame count while preserving total duration", () => {
    const frames = [100, 200, 300, 400, 500].map((delayMs, i) => ({ png: makePng(2, 2, i), delayMs }));
    const thinned = thinFrames(frames);
    expect(thinned).toHaveLength(3);
    const total = (list: { delayMs: number }[]) => list.reduce((sum, f) => sum + f.delayMs, 0);
    expect(total(thinned)).toBe(total(frames));
    expect(thinned.map((f) => f.delayMs)).toEqual([300, 700, 500]);
  });
});

function makePngPayload(width: number, height: number, shade: number): Buffer {
  const chunks = parsePngChunks(makePng(width, height, shade));
  return Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
}
