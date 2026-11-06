import { seededRng } from "@jgengine/core/random/rng";
import { hashNoise2 } from "@jgengine/core/terrain/terrainSeed";
import type { GrassLook } from "@jgengine/core/grass/grassKind";

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Two-octave value noise in 0..1, deterministic per numeric seed; the grass field's season, patch and bare masks. */
export function grassFieldNoise(x: number, z: number, seed: number): number {
  let total = 0;
  let weight = 0;
  for (let octave = 0, scale = 1, amp = 1; octave < 2; octave += 1, scale *= 2.3, amp *= 0.45) {
    const px = x * scale, pz = z * scale;
    const xi = Math.floor(px), zi = Math.floor(pz);
    const tx = smooth(px - xi), tz = smooth(pz - zi);
    const s = seed + octave * 977;
    const a = hashNoise2(xi, zi, s), b = hashNoise2(xi + 1, zi, s), c = hashNoise2(xi, zi + 1, s), d = hashNoise2(xi + 1, zi + 1, s);
    total += ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * amp;
    weight += amp;
  }
  return total / weight;
}

/**
 * Mow-stripe shade at a patch-local point, -1..1 (0 when the look has no stripes). The blade shader
 * and the turf mat both read this same band, so stripes line up across the two.
 * @internal
 */
export function grassStripeAt(look: Pick<GrassLook, "mowing">, x: number, z: number): number {
  if (look.mowing.stripeWidth <= 0 || look.mowing.stripeContrast <= 0) return 0;
  const heading = (look.mowing.stripeAngle * Math.PI) / 180;
  const band = Math.sin(((x * Math.cos(heading) + z * Math.sin(heading)) * Math.PI) / look.mowing.stripeWidth);
  return smoothstep(-0.15, 0.15, band) * 2 - 1;
}

/**
 * Centre of the clump a patch-local point falls in. Clumps sit one per cell of a grid twice
 * `clumpSize` wide, jittered by `clumpSeed`, so the blade bake and the turf mat agree on where they are.
 * @internal
 */
export function grassClumpCentre(halfW: number, halfD: number, clumpSize: number, clumpSeed: number, x: number, z: number): [number, number] {
  const cs2 = clumpSize * 2;
  const column = Math.floor((x + halfW) / cs2), row = Math.floor((z + halfD) / cs2);
  return [
    (column + 0.5 + (hashNoise2(column, row, clumpSeed) - 0.5) * 0.8) * cs2 - halfW,
    (row + 0.5 + (hashNoise2(row, column, clumpSeed) - 0.5) * 0.8) * cs2 - halfD,
  ];
}

/**
 * Turf-mat shade from cushion mounds at a patch-local point, about -0.45..0.45 times `cushion`: light
 * over each clump's dome, dark in the crevices between, so moss reads as cushions even where its
 * blades are too small to see. 0 when the look has no cushions.
 * @internal
 */
export function grassCushionShadeAt(look: Pick<GrassLook, "tuft">, clumpSeed: number, halfW: number, halfD: number, x: number, z: number): number {
  if (look.tuft.cushion <= 0) return 0;
  const [cx, cz] = grassClumpCentre(halfW, halfD, look.tuft.clumpSize, clumpSeed, x, z);
  const rim = Math.hypot(x - cx, z - cz) / Math.max(1e-4, look.tuft.clumpSize);
  const dome = Math.sqrt(Math.max(0, 1 - rim * rim));
  return (dome - 0.5) * 0.9 * look.tuft.cushion;
}

/**
 * Share of the ground grass grows on at a patch-local point, 0..1: the `bareGround` mask that opens
 * sand or soil between tufts. 1 everywhere when `bareGround` is 0.
 */
export function grassBareAt(look: Pick<GrassLook, "growth" | "season">, seed: number, x: number, z: number): number {
  if (look.growth.bareGround <= 0) return 1;
  const threshold = 0.2 + look.growth.bareGround * 0.65;
  const noise = grassFieldNoise((x / look.season.noiseScale) * 2.2 + 5.1, (z / look.season.noiseScale) * 2.2 - 3.7, seed + 71);
  return smoothstep(threshold - 0.05, threshold + 0.05, noise);
}

/** One draw-detail level of the tuft template: an index range drawing every blade at `segments`. */
export interface GrassTemplateLod {
  segments: number;
  start: number;
  count: number;
}

/**
 * The shared tuft mesh every instance places: `tuftBlades` blades splayed around a root, each a
 * strip of `segments` rows, plus one flower quad that only flowering tufts open. The index buffer
 * holds the strips at full, half and single-segment detail back to back, so a far draw picks a
 * cheaper range of the same vertices.
 */
export interface GrassTuftTemplate {
  position: Float32Array;
  uv: Float32Array;
  bladeOffset: Float32Array;
  bladeVary: Float32Array;
  /** Per vertex: the blade's bend scale and its lean out from the tuft centre, radians. */
  bladeBend: Float32Array;
  index: Uint16Array;
  lods: readonly GrassTemplateLod[];
  /** Largest per-blade height and width scale and splay radius, for conservative bounds. */
  heightScale: number;
  widthScale: number;
  radius: number;
}

/** What a tuft template is built from: the look, the patch seed, the full-detail blade segments and the look's blade density. */
export interface GrassTuftInputs {
  look: GrassLook;
  seed: string;
  segments: number;
  /** Blades per square metre at full detail (`grassBladeDensity`), which sets how far apart tufts stand. */
  bladesPerM2: number;
}

/**
 * Radius a tuft's blade roots fill, metres: the look's `tuftSpread`, or three quarters of the
 * spacing between tufts when that is wider. Roots that stop short of the spacing leave every tuft
 * an island on bare mat; filling it lets neighbouring tufts interleave into one sward.
 * @internal
 */
export function grassTuftReach(look: Pick<GrassLook, "tuft">, bladesPerM2: number): number {
  const spacing = Math.sqrt(look.tuft.tuftBlades / Math.max(1e-6, bladesPerM2));
  return Math.max(look.tuft.tuftSpread, spacing * 0.75);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Build the shared tuft template for a patch. Pure and seeded: the same inputs give the same buffers. */
export function createGrassTuftTemplate(inputs: GrassTuftInputs): GrassTuftTemplate {
  const { look } = inputs;
  const segments = Math.max(1, Math.floor(inputs.segments));
  const blades = look.tuft.tuftBlades;
  const random = seededRng(`${inputs.seed}/tuft`);
  // Splay draws from its own stream, so a look without it keeps the same tuft it always had.
  const splayRandom = seededRng(`${inputs.seed}/tuft-splay`);
  const splay = look.tuft.splay;
  const tuftReach = grassTuftReach(look, inputs.bladesPerM2);
  const position: number[] = [];
  const uv: number[] = [];
  const bladeOffset: number[] = [];
  const bladeVary: number[] = [];
  const bladeBend: number[] = [];
  let heightScale = 0, widthScale = 0, radius = 0;
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = blade === 0 ? 0 : ((blade - 1) / Math.max(1, blades - 1)) * Math.PI * 2 + random() * 1.4;
    // Roots spread evenly over the tuft's disc (area-uniform), not on a ring round one centre blade,
    // so a tuft reads as a patch of sward instead of a fountain with a hole beside it.
    const reach = blade === 0 ? 0 : tuftReach * Math.sqrt(0.06 + 0.94 * random());
    const ox = Math.cos(angle) * reach;
    const oz = Math.sin(angle) * reach;
    // Each blade bends away from the tuft centre (plus jitter), so the clump splays open.
    const curled = angle + Math.PI / 2 + (random() - 0.5) * 1.6;
    // Splayed blades turn to face straight out from the centre and lean that way from the root.
    const outward = Math.PI / 2 - angle + (splayRandom() - 0.5) * 0.5;
    const yaw = blade === 0 ? curled : curled + wrapAngle(outward - curled) * splay;
    const lean = blade === 0 ? splay * 0.15 : splay * (0.55 + 0.45 * splayRandom()) * 1.3;
    const h = blade === 0 ? 1 : 0.7 + random() * 0.45;
    const w = 0.8 + random() * 0.4;
    const phase = random();
    const bend = 0.7 + random() * 0.7;
    heightScale = Math.max(heightScale, h);
    widthScale = Math.max(widthScale, w);
    radius = Math.max(radius, reach);
    for (let row = 0; row <= segments; row += 1) {
      const t = row / segments;
      for (const side of [-0.5, 0.5]) {
        position.push(side, t, 0);
        uv.push(side + 0.5, t);
        bladeOffset.push(ox, oz);
        bladeVary.push(yaw, h, w, phase);
        bladeBend.push(bend, lean);
      }
    }
  }
  // Flower quad on the first blade's tip; uv.y above 1 marks its corners for the shader.
  const flowerBase = position.length / 3;
  for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
    position.push(cx, cy, 0);
    uv.push(cx + 0.5, cy + 2.5);
    bladeOffset.push(0, 0);
    bladeVary.push(Math.PI / 2, 1, 1, 0);
    bladeBend.push(1, splay * 0.15);
  }
  const levels = [...new Set([segments, Math.ceil(segments / 2), 1])].sort((a, b) => b - a);
  const index: number[] = [];
  const lods: GrassTemplateLod[] = [];
  const vertsPerBlade = (segments + 1) * 2;
  for (const level of levels) {
    const start = index.length;
    for (let blade = 0; blade < blades; blade += 1) {
      const base = blade * vertsPerBlade;
      for (let k = 0; k < level; k += 1) {
        const a = base + Math.round((k * segments) / level) * 2;
        const b = base + Math.round(((k + 1) * segments) / level) * 2;
        index.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    if (look.flowers.flowerShare > 0) index.push(flowerBase, flowerBase + 1, flowerBase + 3, flowerBase, flowerBase + 3, flowerBase + 2);
    lods.push({ segments: level, start, count: index.length - start });
  }
  return {
    position: Float32Array.from(position),
    uv: Float32Array.from(uv),
    bladeOffset: Float32Array.from(bladeOffset),
    bladeVary: Float32Array.from(bladeVary),
    bladeBend: Float32Array.from(bladeBend),
    index: Uint16Array.from(index),
    lods,
    heightScale,
    widthScale,
    radius,
  };
}
