/**
 * Assemble complete PNG frames (e.g. CDP screencast/screenshot output) into a
 * single animated PNG (APNG). Pure TS, no ffmpeg/native deps: frame pixel data
 * is never re-encoded — each frame's IDAT payload is rewrapped as APNG fdAT
 * chunks, so assembly is cheap and lossless. GitHub renders the result inline
 * from raw.githubusercontent URLs exactly like a static PNG (same `pr-shots`
 * path), which is what makes this the PR-embeddable "video" format here.
 *
 * All frames must share IHDR parameters (dimensions, bit depth, color type);
 * CDP captures of one page at one size always do.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ApngFrame {
  /** A complete, standalone PNG file. */
  png: Buffer | Uint8Array;
  /** How long this frame stays on screen during playback. */
  delayMs: number;
}

interface PngChunk {
  type: string;
  data: Buffer;
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

function crc32(...buffers: Buffer[]): number {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function parsePngChunks(png: Buffer | Uint8Array): PngChunk[] {
  const buffer = Buffer.isBuffer(png) ? png : Buffer.from(png);
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("apng: not a PNG (bad signature)");
  }
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`apng: truncated ${type} chunk`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  if (chunks.length === 0 || chunks[chunks.length - 1]!.type !== "IEND") {
    throw new Error("apng: PNG missing IEND");
  }
  return chunks;
}

function chunkBytes(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(header.subarray(4, 8), data), 0);
  return Buffer.concat([header, data, crc]);
}

function fctlBytes(
  sequence: number,
  width: number,
  height: number,
  delayMs: number,
): Buffer {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(width, 4);
  data.writeUInt32BE(height, 8);
  data.writeUInt32BE(0, 12); // x_offset — every frame is a full repaint
  data.writeUInt32BE(0, 16); // y_offset
  data.writeUInt16BE(Math.min(0xffff, Math.max(1, Math.round(delayMs))), 20); // delay_num
  data.writeUInt16BE(1000, 22); // delay_den (delay in ms)
  data.writeUInt8(0, 24); // dispose_op: none
  data.writeUInt8(0, 25); // blend_op: source (overwrite, no alpha compositing)
  return chunkBytes("fcTL", data);
}

/**
 * Assemble frames into one APNG. `loops` 0 (default) plays forever. Throws when
 * frames disagree on IHDR (dimensions/bit depth/color type) — the caller
 * captured at inconsistent sizes, which is a bug, not a recoverable state.
 */
/** A raw capture (screencast/screenshot) with its wall-clock capture time. */
export interface TimedPng {
  png: Buffer;
  /** Capture time in milliseconds (any consistent epoch). */
  tMs: number;
}

/** Playback delay clamps: a frame-starved headless page can go seconds between
 * repaints; clamping keeps the clip watchable while preserving frame order. */
const MIN_DELAY_MS = 40;
const MAX_DELAY_MS = 2_000;
const LAST_FRAME_HOLD_MS = 1_000;

function ihdrOf(png: Buffer): Buffer | null {
  try {
    return parsePngChunks(png).find((chunk) => chunk.type === "IHDR")?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Turn a captured timeline into APNG frames: keep only shots matching the
 * final capture size (early frames during load/resize can differ), merge
 * consecutive identical shots into one longer-held frame, and derive per-frame
 * delays from the real timestamps, clamped to stay watchable.
 */
export function framesFromTimeline(shots: TimedPng[]): ApngFrame[] {
  if (shots.length === 0) return [];
  const lastIhdr = ihdrOf(shots[shots.length - 1]!.png);
  if (lastIhdr === null) return [];
  const kept = shots.filter((shot) => ihdrOf(shot.png)?.equals(lastIhdr) ?? false);
  const unique: TimedPng[] = [];
  for (const shot of kept) {
    if (unique.length > 0 && unique[unique.length - 1]!.png.equals(shot.png)) continue;
    unique.push(shot);
  }
  return unique.map((shot, index) => {
    const next = unique[index + 1];
    const delay = next === undefined ? LAST_FRAME_HOLD_MS : next.tMs - shot.tMs;
    return { png: shot.png, delayMs: Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(delay))) };
  });
}

/**
 * Halve the frame count by dropping every second frame, folding each dropped
 * frame's screen time into its predecessor — used to fit an oversized clip
 * under the GitHub camo image-proxy budget without changing total duration.
 */
export function thinFrames(frames: ApngFrame[]): ApngFrame[] {
  const out: ApngFrame[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    if (index % 2 === 0) out.push({ ...frame });
    else out[out.length - 1]!.delayMs = Math.min(2 * MAX_DELAY_MS, out[out.length - 1]!.delayMs + frame.delayMs);
  }
  return out;
}

export function assembleApng(frames: ApngFrame[], opts: { loops?: number } = {}): Buffer {
  if (frames.length === 0) throw new Error("apng: no frames");
  const parsed = frames.map((frame) => parsePngChunks(frame.png));
  const firstIhdr = parsed[0]!.find((chunk) => chunk.type === "IHDR");
  if (firstIhdr === undefined) throw new Error("apng: first frame missing IHDR");
  for (let index = 1; index < parsed.length; index += 1) {
    const ihdr = parsed[index]!.find((chunk) => chunk.type === "IHDR");
    if (ihdr === undefined || !ihdr.data.equals(firstIhdr.data)) {
      throw new Error(`apng: frame ${index} IHDR differs from frame 0 — capture sizes must match`);
    }
  }
  const width = firstIhdr.data.readUInt32BE(0);
  const height = firstIhdr.data.readUInt32BE(4);

  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  actl.writeUInt32BE(opts.loops ?? 0, 4);

  const out: Buffer[] = [PNG_SIGNATURE];
  let sequence = 0;

  // Frame 0 carries the shared structure: everything before the first IDAT
  // (IHDR, color chunks like sRGB/gAMA/pHYs) is copied verbatim, with acTL
  // right after IHDR and fcTL right before the image data.
  const first = parsed[0]!;
  const firstIdatIndex = first.findIndex((chunk) => chunk.type === "IDAT");
  if (firstIdatIndex < 0) throw new Error("apng: first frame has no IDAT");
  for (let index = 0; index < firstIdatIndex; index += 1) {
    const chunk = first[index]!;
    out.push(chunkBytes(chunk.type, chunk.data));
    if (chunk.type === "IHDR") out.push(chunkBytes("acTL", actl));
  }
  out.push(fctlBytes(sequence++, width, height, frames[0]!.delayMs));
  for (const chunk of first) {
    if (chunk.type === "IDAT") out.push(chunkBytes("IDAT", chunk.data));
  }

  for (let index = 1; index < parsed.length; index += 1) {
    out.push(fctlBytes(sequence++, width, height, frames[index]!.delayMs));
    for (const chunk of parsed[index]!) {
      if (chunk.type !== "IDAT") continue;
      const fdat = Buffer.alloc(4 + chunk.data.length);
      fdat.writeUInt32BE(sequence++, 0);
      chunk.data.copy(fdat, 4);
      out.push(chunkBytes("fdAT", fdat));
    }
  }

  out.push(chunkBytes("IEND", Buffer.alloc(0)));
  return Buffer.concat(out);
}
