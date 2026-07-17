import { pointInPolygon } from "./scatterRegion";
import type { Vec2 } from "./geometry";

/**
 * Deterministic minimap terrain bake (#1036): rasterize an authored world's terrain (plus optional
 * biome zones and water) into a top-down RGBA image and a matching world-bounds rectangle, then
 * encode it as a PNG data URI. The editor runs this as a bake action and stores the result on the
 * scene document; runtime feeds it straight into the existing `Minimap` / `WorldMap` `background` +
 * `mapBounds` props — no new runtime render path, and the same authored world always bakes the same
 * image (safe for verify/CI). Pure: no canvas, no DOM, `core` still imports nothing external.
 */

/** World-space rectangle the bake spans (matches the react `MapBounds` shape structurally). */
export interface MinimapBakeBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** One biome/region tint painted over the terrain shade where the ground falls inside its polygon. */
export interface MinimapBakeZone {
  /** Closed XZ polygon in world space. */
  polygon: readonly Vec2[];
  /** `#rgb` / `#rrggbb` tint. */
  color: string;
  /** Blend strength 0..1. Default 0.5. */
  alpha?: number;
}

/** The authored world a bake reads — a height sampler, its bounds, and optional zones/water. */
export interface MinimapBakeSource {
  bounds: MinimapBakeBounds;
  sampleHeight(x: number, z: number): number;
  /** Optional surface normal for slope shading; flat shading when omitted. */
  sampleNormal?(x: number, z: number): readonly [number, number, number];
  zones?: readonly MinimapBakeZone[];
  /** Ground at or below this height renders as water. */
  waterLevel?: number;
}

/** The height→color ramp and water color used by the bake. */
export interface MinimapBakePalette {
  low: string;
  high: string;
  water: string;
}

/** The built-in height→color ramp and water color a bake uses when no palette override is given. */
export const DEFAULT_MINIMAP_PALETTE: MinimapBakePalette = {
  low: "#3f5d34",
  high: "#cdbb93",
  water: "#2f5d78",
};

/** Options for {@link bakeMinimapImage}. */
export interface MinimapBakeOptions {
  /** Pixel resolution of the longer axis; the shorter axis keeps world aspect. Default 128. */
  resolution?: number;
  palette?: Partial<MinimapBakePalette>;
}

/** A baked minimap image: RGBA pixels plus the world bounds they span. */
export interface MinimapBake {
  width: number;
  height: number;
  /** Row-major RGBA, length `width * height * 4`. */
  pixels: Uint8ClampedArray;
  bounds: MinimapBakeBounds;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb {
  let value = hex.trim().replace(/^#/, "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const int = Number.parseInt(value, 16);
  if (!Number.isFinite(int) || value.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/**
 * Rasterizes a top-down terrain image: height maps onto a low→high color ramp (normalized over the
 * sampled height range), slope darkens the shade, water fills below `waterLevel`, and each zone
 * polygon tints the ground it covers. Deterministic for a fixed source. The bounds are preserved so
 * a player-centered minimap pans the image correctly.
 * @capability minimap-bake rasterize authored terrain + zones into a top-down minimap image
 */
export function bakeMinimapImage(source: MinimapBakeSource, options: MinimapBakeOptions = {}): MinimapBake {
  const resolution = Math.max(8, Math.floor(options.resolution ?? 128));
  const palette: MinimapBakePalette = { ...DEFAULT_MINIMAP_PALETTE, ...options.palette };
  const low = parseHex(palette.low);
  const high = parseHex(palette.high);
  const water = parseHex(palette.water);
  const { minX, minZ, maxX, maxZ } = source.bounds;
  const spanX = Math.max(1e-6, maxX - minX);
  const spanZ = Math.max(1e-6, maxZ - minZ);

  // Longer world axis gets `resolution` pixels; the other keeps aspect.
  const width = spanX >= spanZ ? resolution : Math.max(8, Math.round((spanX / spanZ) * resolution));
  const height = spanZ >= spanX ? resolution : Math.max(8, Math.round((spanZ / spanX) * resolution));

  const worldX = (px: number) => minX + ((px + 0.5) / width) * spanX;
  const worldZ = (py: number) => minZ + ((py + 0.5) / height) * spanZ;

  // First pass: height range for a stable ramp.
  let hMin = Infinity;
  let hMax = -Infinity;
  const heights = new Float64Array(width * height);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const h = source.sampleHeight(worldX(px), worldZ(py));
      heights[py * width + px] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  const hSpan = Math.max(1e-6, hMax - hMin);

  const pixels = new Uint8ClampedArray(width * height * 4);
  const zones = source.zones ?? [];
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const wx = worldX(px);
      const wz = worldZ(py);
      const h = heights[py * width + px]!;
      let color: Rgb;
      if (source.waterLevel !== undefined && h <= source.waterLevel) {
        color = water;
      } else {
        color = mix(low, high, (h - hMin) / hSpan);
        if (source.sampleNormal !== undefined) {
          const n = source.sampleNormal(wx, wz);
          const shade = 0.62 + 0.38 * Math.max(0, Math.min(1, n[1]));
          color = { r: Math.round(color.r * shade), g: Math.round(color.g * shade), b: Math.round(color.b * shade) };
        }
      }
      for (const zone of zones) {
        if (pointInPolygon([wx, wz], zone.polygon)) {
          color = mix(color, parseHex(zone.color), zone.alpha ?? 0.5);
        }
      }
      const index = (py * width + px) * 4;
      pixels[index] = color.r;
      pixels[index + 1] = color.g;
      pixels[index + 2] = color.b;
      pixels[index + 3] = 255;
    }
  }

  return { width, height, pixels, bounds: { minX, minZ, maxX, maxZ } };
}

// --- Minimal pure PNG encoder (RGBA, stored/uncompressed DEFLATE) ------------------------------

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
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Wraps raw bytes in a zlib stream using only stored (uncompressed) DEFLATE blocks. */
function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01]; // zlib header (no compression)
  let offset = 0;
  while (offset < data.length) {
    const chunk = Math.min(0xffff, data.length - offset);
    const final = offset + chunk >= data.length ? 1 : 0;
    blocks.push(final, chunk & 0xff, (chunk >> 8) & 0xff, ~chunk & 0xff, (~chunk >> 8) & 0xff);
    for (let i = 0; i < chunk; i += 1) blocks.push(data[offset + i]!);
    offset += chunk;
  }
  const checksum = adler32(data);
  blocks.push((checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(blocks);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([...type].map((c) => c.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = crc32(body);
  const out = new Uint8Array(4 + body.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(4 + body.length, crc);
  return out;
}

function base64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 63] : "=";
  }
  return out;
}

/** Encodes an RGBA bake to raw PNG bytes (pure; stored DEFLATE, valid for any decoder). */
export function encodeBakePng(bake: MinimapBake): Uint8Array {
  const { width, height, pixels } = bake;
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0

  // Filtered scanlines: filter byte 0 (none) per row.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }

  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Encodes a bake as a `data:image/png;base64,...` URI — the exact string the `Minimap` /
 * `WorldMap` `background` prop takes. Deterministic for a fixed bake.
 * @capability minimap-bake encode a baked minimap as a PNG data URI for the Minimap background
 */
export function minimapBakeToPngDataUri(bake: MinimapBake): string {
  return `data:image/png;base64,${base64(encodeBakePng(bake))}`;
}

/** One-call convenience: rasterize a source and return `{ background, mapBounds }` for a minimap. */
export function bakeMinimapBackground(
  source: MinimapBakeSource,
  options: MinimapBakeOptions = {},
): { background: string; mapBounds: MinimapBakeBounds } {
  const bake = bakeMinimapImage(source, options);
  return { background: minimapBakeToPngDataUri(bake), mapBounds: bake.bounds };
}
