import { decodePng, encodePng, type RgbaImage } from "@jgengine/assets/imageCodec";

/** Every file Tauri reads from `src-tauri/icons/`, keyed by file name. */
export type DesktopIconFiles = Record<string, Uint8Array>;

const ICO_SIZES = [16, 24, 32, 48, 64, 256] as const;
const PNG_SIZES: ReadonlyArray<readonly [string, number]> = [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
];

/** Centre-crops to a square and resamples to `size`×`size` with an alpha-weighted area filter. */
export function resizeSquare(image: RgbaImage, size: number): RgbaImage {
  const side = Math.min(image.width, image.height);
  const left = (image.width - side) / 2;
  const top = (image.height - side) / 2;
  const step = side / size;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const y0 = top + y * step;
    const y1 = y0 + Math.max(step, 1);
    for (let x = 0; x < size; x += 1) {
      const x0 = left + x * step;
      const x1 = x0 + Math.max(step, 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < image.height; sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < image.width; sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * image.width + sx) * 4;
          const alpha = image.data[i + 3]! * w;
          r += image.data[i]! * alpha;
          g += image.data[i + 1]! * alpha;
          b += image.data[i + 2]! * alpha;
          a += alpha;
          weight += w;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
      }
      data[o + 3] = weight > 0 ? Math.round(a / weight) : 0;
    }
  }
  return { width: size, height: size, data };
}

function bmpIconEntry(image: RgbaImage): Uint8Array {
  const { width, height } = image;
  const maskStride = Math.ceil(width / 32) * 4;
  const out = Buffer.alloc(40 + width * height * 4 + maskStride * height);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(width, 4);
  out.writeInt32LE(height * 2, 8);
  out.writeUInt16LE(1, 12);
  out.writeUInt16LE(32, 14);
  out.writeUInt32LE(width * height * 4 + maskStride * height, 20);
  let o = 40;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      out[o++] = image.data[i + 2]!;
      out[o++] = image.data[i + 1]!;
      out[o++] = image.data[i]!;
      out[o++] = image.data[i + 3]!;
    }
  }
  return out;
}

/** Packs square RGBA images into a Windows `.ico`: BMP entries below 256px, PNG at 256px. */
export function encodeIco(images: RgbaImage[]): Uint8Array {
  const entries = images.map((image) => (image.width >= 256 ? encodePng(image) : bmpIconEntry(image)));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + index * 16;
    header[at] = image.width >= 256 ? 0 : image.width;
    header[at + 1] = image.height >= 256 ? 0 : image.height;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(entries[index]!.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += entries[index]!.length;
  });
  return Buffer.concat([header, ...entries]);
}

function hex(color: string): [number, number, number] {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The jgengine mark from jgengine.com's favicon, drawn at `size` with 4×4 supersampling. */
export function defaultDesktopIcon(size: number): RgbaImage {
  const shapes: Array<{ x: number; y: number; w: number; r: number; color: [number, number, number]; alpha: number }> = [
    { x: 0, y: 0, w: 64, r: 8, color: hex("#0a0c0f"), alpha: 1 },
    { x: 12, y: 12, w: 18, r: 4, color: hex("#edf1f5"), alpha: 1 },
    { x: 34, y: 12, w: 18, r: 4, color: hex("#edf1f5"), alpha: 0.55 },
    { x: 12, y: 34, w: 18, r: 4, color: hex("#edf1f5"), alpha: 0.55 },
    { x: 34, y: 34, w: 18, r: 4, color: hex("#ff6b2c"), alpha: 1 },
  ];
  const inside = (px: number, py: number, s: (typeof shapes)[number]): boolean => {
    const dx = Math.max(s.x + s.r - px, 0, px - (s.x + s.w - s.r));
    const dy = Math.max(s.y + s.r - py, 0, py - (s.y + s.w - s.r));
    return px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.w && dx * dx + dy * dy <= s.r * s.r;
  };
  const data = new Uint8Array(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = ((x + (sx + 0.5) / samples) / size) * 64;
          const py = ((y + (sy + 0.5) / samples) / size) * 64;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;
          for (const s of shapes) {
            if (!inside(px, py, s)) continue;
            cr = cr * (1 - s.alpha) + s.color[0] * s.alpha;
            cg = cg * (1 - s.alpha) + s.color[1] * s.alpha;
            cb = cb * (1 - s.alpha) + s.color[2] * s.alpha;
            ca = ca + s.alpha * (1 - ca);
          }
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = samples * samples;
      const o = (y * size + x) * 4;
      const coverage = a / n;
      data[o] = coverage > 0 ? Math.round(r / a) : 0;
      data[o + 1] = coverage > 0 ? Math.round(g / a) : 0;
      data[o + 2] = coverage > 0 ? Math.round(b / a) : 0;
      data[o + 3] = Math.round(coverage * 255);
    }
  }
  return { width: size, height: size, data };
}

/**
 * Builds the full Tauri icon set (`icon.ico` plus the PNG sizes) from a PNG source, or from the
 * jgengine mark when `source` is null.
 */
export function buildDesktopIcons(source: Uint8Array | null): DesktopIconFiles {
  const decoded = source === null ? null : decodePng(source);
  const at = (size: number): RgbaImage => (decoded === null ? defaultDesktopIcon(size) : resizeSquare(decoded, size));
  const files: DesktopIconFiles = {};
  for (const [name, size] of PNG_SIZES) files[name] = encodePng(at(size));
  files["icon.ico"] = encodeIco(ICO_SIZES.map(at));
  return files;
}

/** File names `buildDesktopIcons` writes, in the order tauri.conf.json lists them. */
export const DESKTOP_ICON_FILES: readonly string[] = [...PNG_SIZES.map(([name]) => name), "icon.ico"];
