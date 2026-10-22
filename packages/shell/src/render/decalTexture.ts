import type { DecalStyle } from "@jgengine/core/world/decalKind";

/** Row-major RGBA bytes plus their edge length, ready for a `THREE.DataTexture`. */
export interface DecalTextureData {
  size: number;
  data: Uint8Array;
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.62 + noise(x * 2.1 + 7.3, y * 2.1 - 3.1, seed + 11) * 0.26 + noise(x * 4.3 - 1.7, y * 4.3 + 5.9, seed + 23) * 0.12;
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

/**
 * The deterministic procedural texture behind one decal style. Same style+seed always bakes the
 * same bytes; the renderer uploads it once as a `DataTexture`, so no scan is pulled and no game
 * ships stain art it cannot inspect. Alpha is the coverage; colour is the stain itself.
 * @internal
 */
export function createDecalTexture(style: DecalStyle, seed: string, size = 128): DecalTextureData {
  const seedNumber = seedOf(seed.length > 0 ? seed : style);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      const r = Math.hypot(u, v) * 2;
      const n = fbm(u * 5 + 13.1, v * 5 - 7.7, seedNumber);
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      if (style === "dirt") {
        const grain = fbm(u * 17 + 3.3, v * 17 + 9.1, seedNumber + 5);
        alpha = smoothstep(0.5, 0.62, n) * (1 - smoothstep(0.55, 1, r)) * (0.55 + grain * 0.45);
        const shade = 0.75 + grain * 0.5;
        red = 0.36 * shade;
        green = 0.29 * shade;
        blue = 0.19 * shade;
      } else if (style === "blood") {
        const splatter = fbm(u * 7 - 2.2, v * 7 + 4.4, seedNumber);
        const main = smoothstep(0.46, 0.58, splatter) * (1 - smoothstep(0.6, 1, r));
        // Satellite droplets: 26 seeded points, each a soft dark ring.
        let drops = 0;
        for (let i = 0; i < 26; i += 1) {
          const a = hash(i, 3, seedNumber) * Math.PI * 2;
          const d = 0.08 + hash(i, 7, seedNumber) * 0.42;
          const radius = 0.012 + hash(i, 11, seedNumber) * 0.03;
          const dist = Math.hypot(u - Math.cos(a) * d, v - Math.sin(a) * d);
          drops = Math.max(drops, 1 - smoothstep(radius * 0.6, radius, dist));
        }
        alpha = Math.max(main, drops);
        const shade = 0.8 + splatter * 0.35;
        red = 0.46 * shade;
        green = 0.055 * shade;
        blue = 0.045 * shade;
      } else if (style === "paint") {
        const body = smoothstep(0.44, 0.55, n) * (1 - smoothstep(0.7, 1, r));
        const streak = smoothstep(0.38, 0.52, fbm(u * 22 + 1.7, v * 5 + 8.3, seedNumber + 3)) * smoothstep(0.2, 0.9, v + 0.5) * 0.5;
        alpha = Math.max(body, streak * (1 - smoothstep(0.5, 0.9, r)));
        const shade = 0.86 + n * 0.22;
        red = 0.84 * shade;
        green = 0.8 * shade;
        blue = 0.72 * shade;
      } else {
        // Cracks: six warped radial lines plus two branches, faded toward the rim.
        let line = 0;
        for (let i = 0; i < 8; i += 1) {
          const base = (i / 8) * Math.PI * 2 + hash(i, 1, seedNumber) * 0.7;
          const wobble = (fbm(u * 9 + i * 3.1, v * 9 - i * 2.3, seedNumber + i) - 0.5) * 0.5;
          const angle = Math.atan2(v, u);
          const delta = Math.abs(Math.atan2(Math.sin(angle - base - wobble), Math.cos(angle - base - wobble)));
          const width = 0.022 + hash(i, 5, seedNumber) * 0.02;
          line = Math.max(line, (1 - smoothstep(0, width, delta * Math.max(0.05, r))) * (1 - smoothstep(0.45, 1, r)));
        }
        const grit = fbm(u * 30 + 4.1, v * 30 - 2.8, seedNumber + 9) * 0.35;
        alpha = Math.max(line, grit * smoothstep(0.35, 0.7, n) * (1 - smoothstep(0.6, 1, r)));
        red = 0.13;
        green = 0.12;
        blue = 0.11;
      }
      const index = (y * size + x) * 4;
      data[index] = Math.round(Math.min(1, red) * 255);
      data[index + 1] = Math.round(Math.min(1, green) * 255);
      data[index + 2] = Math.round(Math.min(1, blue) * 255);
      data[index + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return { size, data };
}
